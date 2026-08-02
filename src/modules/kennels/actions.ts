"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";

import { KENNEL_FORM_FIELDS } from "./fields";
import { isSlugTaken } from "./queries";
import {
  normalizeKennelInput,
  validateKennel,
  type FieldErrors,
  type KennelInput,
} from "./validation";

export type KennelFormState = {
  errors?: FieldErrors;
  formError?: string;
  values?: KennelInput;
};

/** Lê do FormData só o que a configuração declara. Campo extra é ignorado. */
function readForm(formData: FormData): KennelInput {
  const input: KennelInput = {};
  for (const field of KENNEL_FORM_FIELDS) {
    const raw = formData.get(field.name);
    if (typeof raw === "string") input[field.name] = raw;
  }
  return input;
}

/**
 * Revalida a validação do client. Não é redundância: o formulário é
 * conveniência, e um POST direto pula a tela inteira.
 */
async function validateOrFail(input: KennelInput, exceptId?: string): Promise<FieldErrors | null> {
  const errors = validateKennel(input);
  if (Object.keys(errors).length > 0) return errors;

  const values = normalizeKennelInput(input);
  const slug = values.slug;
  if (slug && (await isSlugTaken(slug, exceptId))) {
    return {
      slug: "Esse endereço já está em uso. O endereço fica reservado mesmo se o canil for excluído.",
    };
  }

  return null;
}

export async function createKennel(
  _prev: KennelFormState,
  formData: FormData,
): Promise<KennelFormState> {
  const user = await requireUser("/painel/canis/novo");
  const input = readForm(formData);

  const errors = await validateOrFail(input);
  if (errors) return { errors, values: input };

  const values = normalizeKennelInput(input);

  // `validateOrFail` já garantiu que os obrigatórios vieram, mas o TypeScript
  // não tem como saber: a obrigatoriedade mora em `fields.ts`, que é dado de
  // runtime. Esta guarda satisfaz o tipo e cobre o caso de alguém marcar `name`
  // ou `slug` como não-obrigatório na configuração sem alterar o banco, onde as
  // duas colunas são NOT NULL.
  const { name, slug } = values;
  if (!name || !slug) {
    return { formError: "Nome e endereço público são obrigatórios.", values: input };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kennels")
    .insert({
      ...values,
      name,
      slug,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    // O índice único é a última linha e pode disparar mesmo depois da checagem
    // acima, se duas gravações correrem juntas.
    if (error?.code === "23505") {
      return {
        errors: { slug: "Esse endereço acabou de ser tomado. Escolha outro." },
        values: input,
      };
    }
    return { formError: "Não foi possível salvar o canil. Tente novamente.", values: input };
  }

  revalidatePath("/painel/canis");
  redirect(`/painel/canis/${data.id}`);
}

export async function updateKennel(
  _prev: KennelFormState,
  formData: FormData,
): Promise<KennelFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { formError: "Canil não identificado." };

  await requireUser(`/painel/canis/${id}`);
  const input = readForm(formData);

  const errors = await validateOrFail(input, id);
  if (errors) return { errors, values: input };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kennels")
    .update(normalizeKennelInput(input))
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return {
        errors: { slug: "Esse endereço acabou de ser tomado. Escolha outro." },
        values: input,
      };
    }
    return { formError: "Não foi possível salvar as alterações.", values: input };
  }

  // Zero linhas sem erro é a assinatura de RLS negando: a policy filtrou a
  // linha e o UPDATE não achou nada. Não confundir com "nada mudou".
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar este canil.", values: input };
  }

  revalidatePath("/painel/canis");
  revalidatePath(`/painel/canis/${id}`);
  return { values: input };
}

/**
 * Exclusão LÓGICA. Nunca DELETE físico — é invariante do projeto, e o banco
 * nem concede o privilégio de DELETE a `authenticated`.
 *
 * O slug NÃO é liberado: continua reservado para que um endereço já divulgado
 * não passe a resolver para outro canil.
 */
export async function softDeleteKennel(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await requireUser(`/painel/canis/${id}`);

  const supabase = await createClient();
  await supabase
    .from("kennels")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  revalidatePath("/painel/canis");
  redirect("/painel/canis");
}
