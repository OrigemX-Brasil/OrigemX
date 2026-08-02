"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";

import {
  ineligibilityOf,
  INELIGIBILITY_REASON,
  type AncestorCandidate,
  type ParentSlot,
} from "./ancestors";
import { translateDogError } from "./errors";
import { DOG_FIELDS, DOG_GHOST_FIELDS, type DogField } from "./fields";
import { getDescendantIds, searchAncestorCandidates } from "./queries";
import { normalizeDogInput, validateDog, type DogFieldErrors, type DogInput } from "./validation";

export type DogFormState = {
  errors?: DogFieldErrors;
  formError?: string;
  parentError?: { sire_id?: string; dam_id?: string };
  values?: DogInput;
  /** Preenchido só por `createGhostAncestor`, para o seletor já marcá-lo. */
  created?: AncestorCandidate;
};

function readForm(formData: FormData, fields: readonly DogField[]): DogInput {
  const input: DogInput = {};
  for (const field of fields) {
    const raw = formData.get(field.name);
    if (typeof raw === "string") input[field.name] = raw;
  }
  return input;
}

function readParent(formData: FormData, slot: ParentSlot): string | null {
  const value = formData.get(slot === "sire" ? "sire_id" : "dam_id");
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Converte o erro do banco no formato do formulário.
 *
 * É aqui que o ciclo genealógico deixa de ser um 500 e vira um parágrafo que
 * explica ao criador por que a ligação não pode existir.
 */
function toFormState(error: unknown, values: DogInput): DogFormState {
  const translated = translateDogError(error as { code?: string; message?: string } | null);

  if (translated.field === "sire_id" || translated.field === "dam_id") {
    return { parentError: { [translated.field]: translated.message }, values };
  }
  if (translated.field === "slug") {
    return { errors: { slug: translated.message }, values };
  }
  return { formError: translated.message, values };
}

export async function createDog(_prev: DogFormState, formData: FormData): Promise<DogFormState> {
  const user = await requireUser("/painel/caes/novo");

  const input = readForm(formData, DOG_FIELDS);
  const errors = validateDog(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const kennelId = String(formData.get("kennel_id") ?? "") || null;
  const sireId = readParent(formData, "sire");
  const damId = readParent(formData, "dam");

  const values = normalizeDogInput(input);
  const name = values.name;
  const sex = values.sex;
  if (!name || !sex) return { formError: "Nome e sexo são obrigatórios.", values: input };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dogs")
    .insert({
      ...values,
      name,
      sex,
      kennel_id: kennelId,
      owner_id: user.id,
      sire_id: sireId,
      dam_id: damId,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return toFormState(error, input);

  revalidatePath("/painel/caes");
  redirect(`/painel/caes/${data.id}`);
}

export async function updateDog(_prev: DogFormState, formData: FormData): Promise<DogFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { formError: "Cão não identificado." };

  await requireUser(`/painel/caes/${id}`);

  const input = readForm(formData, DOG_FIELDS);
  const errors = validateDog(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const kennelId = String(formData.get("kennel_id") ?? "") || null;
  const sireId = readParent(formData, "sire");
  const damId = readParent(formData, "dam");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dogs")
    .update({
      ...normalizeDogInput(input),
      kennel_id: kennelId,
      sire_id: sireId,
      dam_id: damId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) return toFormState(error, input);

  // Zero linhas sem erro é RLS negando, não "nada mudou".
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar este cão.", values: input };
  }

  revalidatePath("/painel/caes");
  revalidatePath(`/painel/caes/${id}`);
  return { values: input };
}

/**
 * Exclusão LÓGICA. O banco nem concede DELETE a `authenticated`.
 *
 * Não impedimos excluir um cão que é progenitor de outro: a FK é RESTRICT
 * apenas contra DELETE físico, e o pedigree do descendente continua íntegro
 * apontando para a linha, que permanece.
 */
export async function softDeleteDog(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await requireUser(`/painel/caes/${id}`);

  const supabase = await createClient();
  await supabase
    .from("dogs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  revalidatePath("/painel/caes");
  redirect("/painel/caes");
}

/**
 * Cadastro mínimo do ancestral fantasma.
 *
 * SEM dono e SEM canil, e isso é o que o define: a policy `dogs_select` só
 * trata como fantasma — legível publicamente sem estar publicado — quem tem as
 * duas colunas nulas. Cão com canil e sem dono é rascunho de alguém.
 *
 * `created_by` fica registrado para o criador reencontrar o que cadastrou; não
 * transforma o fantasma em cão gerenciável, só em cão localizável.
 */
export async function createGhostAncestor(
  _prev: DogFormState,
  formData: FormData,
): Promise<DogFormState> {
  const user = await requireUser("/painel/caes/novo");

  const input = readForm(formData, DOG_GHOST_FIELDS);
  const errors = validateDog(input, DOG_GHOST_FIELDS);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeDogInput(input, DOG_GHOST_FIELDS);
  const name = values.name;
  const sex = values.sex;
  if (!name || !sex) return { formError: "Nome e sexo são obrigatórios.", values: input };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dogs")
    .insert({
      ...values,
      name,
      sex,
      kennel_id: null,
      owner_id: null,
      created_by: user.id,
    })
    .select("id, name, sex, born_on, breed, kennel_id, owner_id")
    .single();

  if (error || !data) return toFormState(error, input);

  revalidatePath("/painel/caes");
  return {
    created: {
      id: data.id,
      name: data.name,
      sex: data.sex as "male" | "female",
      born_on: data.born_on,
      breed: data.breed,
      kennel_id: data.kennel_id,
      owner_id: data.owner_id,
    },
  };
}

export type AncestorSearchState = {
  slot: ParentSlot;
  term: string;
  results: Array<AncestorCandidate & { blockedReason?: string }>;
  truncated: boolean;
  searched: boolean;
};

/**
 * Busca de progenitor para a tela.
 *
 * Devolve os candidatos JÁ ANOTADOS com o motivo de bloqueio, em vez de
 * escondê-los. Sumir com o cão que o criador está procurando faz ele concluir
 * que precisa cadastrar de novo — e criar o duplicado. Mostrar bloqueado, com
 * o porquê, ensina a regra.
 */
export async function searchAncestors(
  _prev: AncestorSearchState,
  formData: FormData,
): Promise<AncestorSearchState> {
  await requireUser("/painel/caes");

  const slot = (formData.get("slot") === "dam" ? "dam" : "sire") as ParentSlot;
  const term = String(formData.get("term") ?? "");
  const dogId = String(formData.get("dog_id") ?? "") || null;
  const otherParentId = String(formData.get("other_parent_id") ?? "") || null;

  const { candidates, truncated } = await searchAncestorCandidates(term, slot);

  const descendantIds = dogId ? await getDescendantIds(dogId) : undefined;

  const results = candidates.map((candidate) => {
    const reason = ineligibilityOf(candidate, { slot, dogId, otherParentId, descendantIds });
    return reason ? { ...candidate, blockedReason: INELIGIBILITY_REASON[reason] } : candidate;
  });

  return { slot, term, results, truncated, searched: true };
}
