"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";

import { MAX_FAQS_PER_KENNEL } from "./constraints";
import { countKennelFaqs } from "./queries";
import { normalizeFaq, validateFaq, type FaqErrors, type FaqInput } from "./validation";

/**
 * ============================================================================
 * FAQ — lista REPETÍVEL e REORDENÁVEL, mesmo desenho de `health/actions.ts`
 * mais o mecanismo de reordenação de `setDogGalleryCover`.
 * ============================================================================
 */

export type FaqFormState = {
  errors?: FaqErrors;
  formError?: string;
  values?: FaqInput;
  ok?: boolean;
};

async function revalidateFaqPaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kennelId: string,
) {
  revalidatePath(`/painel/canis/${kennelId}`);

  const { data: kennel } = await supabase
    .from("kennels")
    .select("slug")
    .eq("id", kennelId)
    .maybeSingle();
  if (kennel?.slug) revalidatePath(`/c/${kennel.slug}`);
}

export async function addFaq(_prev: FaqFormState, formData: FormData): Promise<FaqFormState> {
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!kennelId) return { formError: "Canil não identificado." };

  const user = await requireUser(`/painel/canis/${kennelId}`);

  const input: FaqInput = {
    question: String(formData.get("question") ?? ""),
    answer: String(formData.get("answer") ?? ""),
  };

  const errors = validateFaq(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const supabase = await createClient();

  // Teto checado na aplicação: não há constraint no banco para isto. A mesma
  // contagem alimenta a próxima posição — pergunta nova sempre entra por
  // último.
  const count = await countKennelFaqs(kennelId);
  if (count >= MAX_FAQS_PER_KENNEL) {
    return { formError: `Este canil já tem ${MAX_FAQS_PER_KENNEL} perguntas.`, values: input };
  }

  const values = normalizeFaq(input);
  const { error } = await supabase.from("kennel_faqs").insert({
    kennel_id: kennelId,
    question: values.question,
    answer: values.answer,
    position: count,
    created_by: user.id,
  });

  if (error) {
    return {
      formError: "Não foi possível salvar. Confira se o canil é seu e tente de novo.",
      values: input,
    };
  }

  await revalidateFaqPaths(supabase, kennelId);
  return { ok: true };
}

/**
 * Editar uma pergunta já gravada. Os três filtros do `update` são defesa em
 * profundidade, não redundância — mesmo raciocínio de `updateHealthRecord`.
 */
export async function updateFaq(_prev: FaqFormState, formData: FormData): Promise<FaqFormState> {
  const id = String(formData.get("id") ?? "");
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!id || !kennelId) return { formError: "Pergunta não identificada." };

  await requireUser(`/painel/canis/${kennelId}`);

  const input: FaqInput = {
    question: String(formData.get("question") ?? ""),
    answer: String(formData.get("answer") ?? ""),
  };

  const errors = validateFaq(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeFaq(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kennel_faqs")
    .update({ question: values.question, answer: values.answer })
    .eq("id", id)
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .select("id");

  if (error) return { formError: "Não foi possível salvar a pergunta.", values: input };

  // Zero linhas sem erro é a assinatura de RLS negando, não "nada mudou" —
  // mesmo idioma de `updateHealthRecord`/`updateKennel`.
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar esta pergunta.", values: input };
  }

  await revalidateFaqPaths(supabase, kennelId);
  return { ok: true };
}

/** Exclusão LÓGICA — nenhuma tabela do projeto concede DELETE. */
export async function softDeleteFaq(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!id || !kennelId) return;

  await requireUser(`/painel/canis/${kennelId}`);

  const supabase = await createClient();
  await supabase
    .from("kennel_faqs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("kennel_id", kennelId)
    .is("deleted_at", null);

  await revalidateFaqPaths(supabase, kennelId);
}

/**
 * Reordenar — troca a pergunta escolhida com a vizinha (acima ou abaixo) e
 * RENUMERA A LISTA INTEIRA, mesmo mecanismo de `setDogGalleryCover` (que
 * move só 1 item pro topo; aqui generalizado para trocar 2 quaisquer).
 * Renumerar tudo em vez de só trocar as duas posições é o que garante que a
 * ordem nunca desalinha, mesmo que alguma linha antiga tenha ficado com
 * posição repetida ou fora de sequência por algum motivo.
 */
export async function moveFaq(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const kennelId = String(formData.get("kennel_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || !kennelId || (direction !== "up" && direction !== "down")) return;

  await requireUser(`/painel/canis/${kennelId}`);

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("kennel_faqs")
    .select("id")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (!rows || rows.length < 2) return;

  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= rows.length) return; // já está na ponta

  const ordered = [...rows];
  const [moved] = ordered.splice(index, 1);
  ordered.splice(targetIndex, 0, moved);

  const updates = await Promise.all(
    ordered.map((row, i) => supabase.from("kennel_faqs").update({ position: i }).eq("id", row.id)),
  );

  if (updates.some((u) => u.error)) {
    console.error(`[faqs:moveFaq] falha ao renumerar as perguntas do canil ${kennelId}`);
    return;
  }

  await revalidateFaqPaths(supabase, kennelId);
}
