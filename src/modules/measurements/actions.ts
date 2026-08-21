"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";

import { MAX_MEASUREMENTS_PER_DOG } from "./constraints";
import {
  normalizeMeasurement,
  validateMeasurement,
  type MeasurementErrors,
  type MeasurementInput,
} from "./validation";

/**
 * ============================================================================
 * Peso e cernelha — lista REPETÍVEL, com CRUD completo.
 * ============================================================================
 *
 * Mesmo desenho de `health/actions.ts`: UMA LINHA POR SUBMISSÃO, um `<form>`
 * por registro, adicionar é INSERT, remover é soft-delete, sem estado de
 * array no client.
 *
 * Quem autoriza é `private.can_manage_dog(dog_id)` nas policies — mesma regra
 * de saúde e exames.
 */

export type MeasurementFormState = {
  errors?: MeasurementErrors;
  formError?: string;
  values?: MeasurementInput;
  ok?: boolean;
};

/**
 * Revalida as telas que exibem a medição do cão.
 *
 * Mesma lista de `health/actions.ts::revalidateDogPaths`: o perfil do cão, e
 * toda ninhada onde ele é filhote ou progenitor (a página da ninhada não
 * exibe medição hoje, mas duplicar a lista de paths aqui é mais barato do que
 * a página pública do cão ficar desatualizada por 5 minutos se um dia passar
 * a exibir).
 */
async function revalidateDogPaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dogId: string,
) {
  revalidatePath(`/painel/caes/${dogId}`);

  const { data: dog } = await supabase
    .from("dogs")
    .select("public_id, litter_id")
    .eq("id", dogId)
    .maybeSingle();

  if (!dog) return;
  revalidatePath(`/d/${dog.public_id}`);

  const filtros = [`sire_id.eq.${dogId}`, `dam_id.eq.${dogId}`];
  if (dog.litter_id) filtros.push(`id.eq.${dog.litter_id}`);

  const { data: litters } = await supabase
    .from("kennel_litters")
    .select("public_id")
    .or(filtros.join(","))
    .is("deleted_at", null)
    .limit(20);

  for (const litter of litters ?? []) revalidatePath(`/n/${litter.public_id}`);
}

export async function addMeasurement(
  _prev: MeasurementFormState,
  formData: FormData,
): Promise<MeasurementFormState> {
  const dogId = String(formData.get("dog_id") ?? "");
  if (!dogId) return { formError: "Cão não identificado." };

  const user = await requireUser(`/painel/caes/${dogId}`);

  const input: MeasurementInput = {
    kind: String(formData.get("kind") ?? ""),
    value: String(formData.get("value") ?? ""),
    measured_on: String(formData.get("measured_on") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const errors = validateMeasurement(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const supabase = await createClient();

  // Teto checado na aplicação: não há constraint no banco para isto (ver
  // constraints.ts). Consulta antes de gravar só para dar mensagem decente.
  const { count } = await supabase
    .from("dog_measurements")
    .select("id", { count: "exact", head: true })
    .eq("dog_id", dogId)
    .is("deleted_at", null);

  if ((count ?? 0) >= MAX_MEASUREMENTS_PER_DOG) {
    return {
      formError: `Este cão já tem ${MAX_MEASUREMENTS_PER_DOG} medições registradas.`,
      values: input,
    };
  }

  const values = normalizeMeasurement(input);

  // `validateMeasurement` já garantiu `value` numérico e positivo, mas o
  // TypeScript não tem como saber: a checagem mora em `validation.ts`, que é
  // dado de runtime. Mesma guarda de `createKennel` para `name`/`slug`.
  if (values.value === null) {
    return { formError: "Informe um número maior que zero.", values: input };
  }

  const { error } = await supabase.from("dog_measurements").insert({
    dog_id: dogId,
    kind: values.kind,
    value: values.value,
    measured_on: values.measured_on,
    notes: values.notes,
    created_by: user.id,
  });

  if (error) {
    return {
      formError: "Não foi possível registrar. Confira se o cão é seu e tente de novo.",
      values: input,
    };
  }

  await revalidateDogPaths(supabase, dogId);
  return { ok: true };
}

/** Exclusão LÓGICA — nenhuma tabela do projeto concede DELETE. */
export async function deleteMeasurement(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const dogId = String(formData.get("dog_id") ?? "");
  if (!id || !dogId) return;

  await requireUser(`/painel/caes/${dogId}`);

  const supabase = await createClient();
  await supabase
    .from("dog_measurements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("dog_id", dogId)
    .is("deleted_at", null);

  await revalidateDogPaths(supabase, dogId);
}

/**
 * Editar uma medição já gravada — mesmo motivo de `updateHealthRecord`:
 * corrigir "4,5" digitado como "45" não pode custar o `created_at` original.
 *
 * Mesmos três filtros de defesa em profundidade: `id` sozinho bastaria SE a
 * RLS nunca falhasse.
 */
export async function updateMeasurement(
  _prev: MeasurementFormState,
  formData: FormData,
): Promise<MeasurementFormState> {
  const id = String(formData.get("id") ?? "");
  const dogId = String(formData.get("dog_id") ?? "");
  if (!id || !dogId) return { formError: "Registro não identificado." };

  await requireUser(`/painel/caes/${dogId}`);

  const input: MeasurementInput = {
    kind: String(formData.get("kind") ?? ""),
    value: String(formData.get("value") ?? ""),
    measured_on: String(formData.get("measured_on") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const errors = validateMeasurement(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeMeasurement(input);

  // Mesma guarda de `addMeasurement`: `validateMeasurement` já garantiu
  // `value` numérico e positivo, o tipo é que não sabe.
  if (values.value === null) {
    return { formError: "Informe um número maior que zero.", values: input };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dog_measurements")
    .update({
      kind: values.kind,
      value: values.value,
      measured_on: values.measured_on,
      notes: values.notes,
    })
    .eq("id", id)
    .eq("dog_id", dogId)
    .is("deleted_at", null)
    .select("id");

  if (error) return { formError: "Não foi possível salvar a medição.", values: input };

  // Zero linhas sem erro é a assinatura de RLS negando, não "nada mudou" —
  // mesmo idioma de `updateHealthRecord`/`updateKennel`.
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar esta medição.", values: input };
  }

  await revalidateDogPaths(supabase, dogId);
  return { ok: true };
}
