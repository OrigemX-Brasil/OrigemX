"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";
import { BUCKET_PRIVATE, BUCKET_PUBLIC } from "@/modules/media/constraints";
import type { PublishState } from "@/modules/media/publish";
import { reconcileMediaBucket, testimonialMediaRows } from "@/modules/media/sync";

import { MAX_TESTIMONIALS_PER_KENNEL } from "./constraints";
import { countKennelTestimonials } from "./queries";
import {
  normalizeTestimonial,
  validateTestimonial,
  type TestimonialErrors,
  type TestimonialInput,
} from "./validation";

/**
 * ============================================================================
 * Depoimentos — lista REPETÍVEL, mesmo desenho de `health/actions.ts`.
 * ============================================================================
 *
 * Cada depoimento é um `<form>` próprio: adicionar é um INSERT, editar é um
 * UPDATE com defesa em profundidade, excluir é soft-delete. Nenhum estado de
 * array no client.
 */

export type TestimonialFormState = {
  errors?: TestimonialErrors;
  formError?: string;
  values?: TestimonialInput;
  ok?: boolean;
};

/**
 * Traduz o erro do trigger `testimonials_check_dog_kennel`.
 *
 * Não deveria disparar pela UI normal — o `<select>` de cão só lista os do
 * próprio canil — mas é a defesa em profundidade contra um POST forjado.
 */
function translateTestimonialError(error: { message?: string } | null): TestimonialFormState {
  const message = error?.message ?? "";

  if (message.includes("precisa pertencer ao mesmo canil")) {
    return { formError: "O cão selecionado não pertence a este canil." };
  }

  return { formError: "Não foi possível salvar o depoimento." };
}

/**
 * Revalida as telas que exibem depoimento — o painel do canil e a própria
 * página pública dele. Depoimento não tem página própria (ao contrário de
 * ninhada): ele só aparece embutido em `/c/[slug]` e, se vinculado a um cão,
 * em `/d/[public_id]` daquele cão.
 */
async function revalidateTestimonialPaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kennelId: string,
  dogId: string | null,
) {
  revalidatePath(`/painel/canis/${kennelId}`);

  const { data: kennel } = await supabase
    .from("kennels")
    .select("slug")
    .eq("id", kennelId)
    .maybeSingle();
  if (kennel?.slug) revalidatePath(`/c/${kennel.slug}`);

  if (dogId) {
    const { data: dog } = await supabase
      .from("dogs")
      .select("public_id")
      .eq("id", dogId)
      .maybeSingle();
    if (dog?.public_id) revalidatePath(`/d/${dog.public_id}`);
  }
}

export async function addTestimonial(
  _prev: TestimonialFormState,
  formData: FormData,
): Promise<TestimonialFormState> {
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!kennelId) return { formError: "Canil não identificado." };

  const user = await requireUser(`/painel/canis/${kennelId}`);

  // LGPD, antes de qualquer outra coisa: sem a confirmação marcada, nem
  // valida o resto do formulário. O estado do checkbox NUNCA é persistido —
  // não existe coluna para isso, é validação de submissão, não dado.
  if (formData.get("lgpd_consent") !== "on") {
    return {
      formError: "Confirme que você tem autorização da pessoa para publicar este depoimento.",
    };
  }

  const input: TestimonialInput = {
    author_name: String(formData.get("author_name") ?? ""),
    text: String(formData.get("text") ?? ""),
    rating: String(formData.get("rating") ?? ""),
    dog_id: String(formData.get("dog_id") ?? ""),
  };

  const errors = validateTestimonial(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const supabase = await createClient();

  // Teto checado na aplicação: não há constraint no banco para isto.
  const count = await countKennelTestimonials(kennelId);
  if (count >= MAX_TESTIMONIALS_PER_KENNEL) {
    return {
      formError: `Este canil já tem ${MAX_TESTIMONIALS_PER_KENNEL} depoimentos.`,
      values: input,
    };
  }

  const values = normalizeTestimonial(input);
  const { error } = await supabase.from("testimonials").insert({
    kennel_id: kennelId,
    dog_id: values.dog_id,
    author_name: values.author_name,
    text: values.text,
    rating: values.rating,
    created_by: user.id,
  });

  if (error) return { ...translateTestimonialError(error), values: input };

  await revalidateTestimonialPaths(supabase, kennelId, values.dog_id);
  return { ok: true };
}

/**
 * Editar um depoimento já gravado.
 *
 * Os três filtros do `update` são defesa em profundidade, não redundância:
 * `id` sozinho bastaria SE a RLS nunca falhasse. `kennel_id` impede que um id
 * forjado alcance a linha de outro canil; `deleted_at is null` impede editar
 * (e assim ressuscitar na tela) o que já foi excluído. Mesmo padrão de
 * `updateHealthRecord`.
 *
 * Sem checkbox de LGPD aqui, de propósito — a confirmação é sobre AUTORIZAR A
 * PUBLICAÇÃO de um depoimento novo, não sobre corrigir um erro de digitação
 * num que já foi autorizado.
 */
export async function updateTestimonial(
  _prev: TestimonialFormState,
  formData: FormData,
): Promise<TestimonialFormState> {
  const id = String(formData.get("id") ?? "");
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!id || !kennelId) return { formError: "Depoimento não identificado." };

  await requireUser(`/painel/canis/${kennelId}`);

  const input: TestimonialInput = {
    author_name: String(formData.get("author_name") ?? ""),
    text: String(formData.get("text") ?? ""),
    rating: String(formData.get("rating") ?? ""),
    dog_id: String(formData.get("dog_id") ?? ""),
  };

  const errors = validateTestimonial(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeTestimonial(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("testimonials")
    .update({
      dog_id: values.dog_id,
      author_name: values.author_name,
      text: values.text,
      rating: values.rating,
    })
    .eq("id", id)
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .select("id");

  if (error) return { ...translateTestimonialError(error), values: input };

  // Zero linhas sem erro é a assinatura de RLS negando, não "nada mudou" —
  // mesmo idioma de `updateHealthRecord`/`updateKennel`.
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar este depoimento.", values: input };
  }

  await revalidateTestimonialPaths(supabase, kennelId, values.dog_id);
  return { ok: true };
}

/** Exclusão LÓGICA — nenhuma tabela do projeto concede DELETE. */
export async function softDeleteTestimonial(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!id || !kennelId) return;

  await requireUser(`/painel/canis/${kennelId}`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("testimonials")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .select("dog_id")
    .maybeSingle();

  await revalidateTestimonialPaths(supabase, kennelId, data?.dog_id ?? null);
}

/**
 * Publicar/despublicar UM depoimento — mirror exato de `publishLitter`/
 * `unpublishLitter` (mesma ordem de segurança: mover mídia antes de publicar,
 * despublicar antes de mover mídia de volta). Sem página própria para
 * revalidar (depoimento não tem `/algo/[public_id]`): `/c/[slug]` e, se
 * vinculado, `/d/[public_id]` do cão já cobrem.
 */
export async function publishTestimonial(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Depoimento não identificado." };

  const user = await requireUser("/painel");
  const supabase = await createClient();

  const { data: testimonial } = await supabase
    .from("testimonials")
    .select("id, kennel_id, dog_id, kennels!inner(owner_id, published_at)")
    .eq("id", id)
    .eq("kennels.owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  const kennel = kennelOf(testimonial?.kennels);
  if (!testimonial || !kennel) return { error: "Depoimento não encontrado." };

  // Move primeiro — só se o CANIL já estiver publicado. Em rascunho, a regra
  // dupla já esconde o depoimento inteiro, e mover o avatar seria expor um
  // arquivo que nenhuma página RLS deixa alguém enxergar.
  if (kennel.published_at) {
    const rows = await testimonialMediaRows(supabase, id);
    const sync = await reconcileMediaBucket(supabase, rows, BUCKET_PUBLIC);
    if (sync.failed.length > 0) {
      return {
        error:
          "Não foi possível preparar o avatar para o acesso público. O depoimento NÃO foi publicado — tente de novo.",
      };
    }
  }

  const { data: updated, error } = await supabase
    .from("testimonials")
    .update({ published_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível publicar o depoimento." };
  }

  await revalidateTestimonialPaths(supabase, testimonial.kennel_id, testimonial.dog_id);
  return { ok: true };
}

export async function unpublishTestimonial(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Depoimento não identificado." };

  const user = await requireUser("/painel");
  const supabase = await createClient();

  const { data: testimonial } = await supabase
    .from("testimonials")
    .select("id, kennel_id, dog_id, kennels!inner(owner_id)")
    .eq("id", id)
    .eq("kennels.owner_id", user.id)
    .maybeSingle();
  if (!testimonial) return { error: "Depoimento não encontrado." };

  // 1. Tira do ar primeiro.
  const { data: updated, error } = await supabase
    .from("testimonials")
    .update({ published_at: null })
    .eq("id", id)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível despublicar o depoimento." };
  }

  // 2. Purga o cache antes de mexer em arquivo.
  await revalidateTestimonialPaths(supabase, testimonial.kennel_id, testimonial.dog_id);

  // 3. Devolve o avatar ao privado.
  const rows = await testimonialMediaRows(supabase, id);
  const sync = await reconcileMediaBucket(supabase, rows, BUCKET_PRIVATE);

  if (sync.failed.length > 0) {
    return {
      ok: true,
      warning:
        "O depoimento saiu do ar, mas não foi possível remover o avatar do endereço público. " +
        "Quem tiver o link antigo da imagem ainda consegue abri-la. Rode a reconciliação ou tente despublicar de novo.",
    };
  }

  return { ok: true };
}

/** O join do PostgREST vem como objeto ou array conforme a cardinalidade. */
function kennelOf<T extends { owner_id: string }>(k: T | T[] | null | undefined): T | null {
  if (!k) return null;
  return Array.isArray(k) ? (k[0] ?? null) : k;
}
