"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";

import { MAX_GENETIC_TESTS_PER_DOG, MAX_HEALTH_RECORDS_PER_DOG } from "./constraints";
import {
  normalizeGeneticTest,
  normalizeHealthRecord,
  validateGeneticTest,
  validateHealthRecord,
  type GeneticTestErrors,
  type GeneticTestInput,
  type HealthRecordErrors,
  type HealthRecordInput,
} from "./validation";

/**
 * ============================================================================
 * Saúde e exames — listas REPETÍVEIS.
 * ============================================================================
 *
 * UMA LINHA POR SUBMISSÃO, e é a decisão de desenho que sustenta a tela.
 *
 * O projeto não tem nenhuma lista dinâmica hoje (`titles` é textarea com uma
 * linha por título; identificadores é formulário fixo de três campos), então
 * não havia padrão a copiar. A alternativa seria estado de array no client —
 * "adicionar linha" empurrando num `useState`, tudo salvo de uma vez. Aqui cada
 * registro é um `<form>` próprio: adicionar é um INSERT, remover é um
 * soft-delete, e a lista rerenderiza do servidor.
 *
 * O que isso compra: nada de sincronizar índice de array com id de banco, nada
 * de perder o que já foi digitado quando uma linha falha, e o `useActionState`
 * que o resto do projeto já usa continua servindo sem adaptação.
 *
 * Quem autoriza é `private.can_manage_dog(dog_id)` nas policies — o filhote é
 * gerenciável pelo dono do canil, e o reprodutor de terceiro NÃO é. É por isso
 * que a tela da ninhada mostra os exames do pai sem oferecer formulário quando
 * ele não é do criador: o INSERT falharia, e oferecer um campo que não salva é
 * pior que não oferecer.
 */

export type HealthRecordFormState = {
  errors?: HealthRecordErrors;
  formError?: string;
  values?: HealthRecordInput;
  ok?: boolean;
};

export type GeneticTestFormState = {
  errors?: GeneticTestErrors;
  formError?: string;
  values?: GeneticTestInput;
  ok?: boolean;
};

/**
 * Revalida as telas que exibem o dado do cão.
 *
 * A ninhada entra porque a página pública dela mostra a saúde dos filhotes E os
 * exames dos progenitores — sem isto, cadastrar um exame no perfil do pai
 * deixaria `/n/[public_id]` com a versão antiga até o ISR expirar.
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

  // Duas razões distintas para uma ninhada exibir este cão, e as duas contam:
  //
  //   1. ele é PROGENITOR dela — e o exame genético do reprodutor aparece em
  //      TODA ninhada em que ele é pai ou mãe, não só na que ele mesmo gerou;
  //   2. ele é FILHOTE dela — e o histórico de vacina aparece no card dele.
  //
  // Por isso a busca não é só por `litter_id`: um reprodutor não tem
  // `litter_id` nenhum e ainda assim invalida várias páginas.
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

export async function addHealthRecord(
  _prev: HealthRecordFormState,
  formData: FormData,
): Promise<HealthRecordFormState> {
  const dogId = String(formData.get("dog_id") ?? "");
  if (!dogId) return { formError: "Cão não identificado." };

  const user = await requireUser(`/painel/caes/${dogId}`);

  const input: HealthRecordInput = {
    kind: String(formData.get("kind") ?? ""),
    applied_on: String(formData.get("applied_on") ?? ""),
    product: String(formData.get("product") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const errors = validateHealthRecord(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const supabase = await createClient();

  // Teto checado na aplicação: não há constraint no banco para isto (ver
  // constraints.ts). Consulta antes de gravar só para dar mensagem decente.
  const { count } = await supabase
    .from("dog_health_records")
    .select("id", { count: "exact", head: true })
    .eq("dog_id", dogId)
    .is("deleted_at", null);

  if ((count ?? 0) >= MAX_HEALTH_RECORDS_PER_DOG) {
    return {
      formError: `Este cão já tem ${MAX_HEALTH_RECORDS_PER_DOG} registros de saúde.`,
      values: input,
    };
  }

  const values = normalizeHealthRecord(input);
  const { error } = await supabase.from("dog_health_records").insert({
    dog_id: dogId,
    kind: values.kind,
    applied_on: values.applied_on,
    product: values.product,
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
export async function deleteHealthRecord(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const dogId = String(formData.get("dog_id") ?? "");
  if (!id || !dogId) return;

  await requireUser(`/painel/caes/${dogId}`);

  const supabase = await createClient();
  await supabase
    .from("dog_health_records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("dog_id", dogId)
    .is("deleted_at", null);

  await revalidateDogPaths(supabase, dogId);
}

/**
 * Editar um registro de saúde já gravado.
 *
 * Existe porque corrigir "V10" digitado como "V8" não pode custar o
 * `created_at` original — que é o que `deleteHealthRecord` + `addHealthRecord`
 * faria. A linha permanece a mesma; só o conteúdo muda.
 *
 * Os três filtros do `update` são defesa em profundidade, não redundância:
 * `id` sozinho bastaria SE a RLS nunca falhasse. `dog_id` impede que um id
 * forjado alcance a linha de outro cão, e `deleted_at is null` impede editar
 * (e assim ressuscitar na tela) o que já foi excluído.
 */
export async function updateHealthRecord(
  _prev: HealthRecordFormState,
  formData: FormData,
): Promise<HealthRecordFormState> {
  const id = String(formData.get("id") ?? "");
  const dogId = String(formData.get("dog_id") ?? "");
  if (!id || !dogId) return { formError: "Registro não identificado." };

  await requireUser(`/painel/caes/${dogId}`);

  const input: HealthRecordInput = {
    kind: String(formData.get("kind") ?? ""),
    applied_on: String(formData.get("applied_on") ?? ""),
    product: String(formData.get("product") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const errors = validateHealthRecord(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeHealthRecord(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dog_health_records")
    .update({
      kind: values.kind,
      applied_on: values.applied_on,
      product: values.product,
      notes: values.notes,
    })
    .eq("id", id)
    .eq("dog_id", dogId)
    .is("deleted_at", null)
    .select("id");

  if (error) return { formError: "Não foi possível salvar o registro.", values: input };

  // Zero linhas sem erro é a assinatura de RLS negando, não "nada mudou" —
  // mesmo idioma de `updateKennel`/`updateDog`.
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar este registro.", values: input };
  }

  await revalidateDogPaths(supabase, dogId);
  return { ok: true };
}

export async function addGeneticTest(
  _prev: GeneticTestFormState,
  formData: FormData,
): Promise<GeneticTestFormState> {
  const dogId = String(formData.get("dog_id") ?? "");
  if (!dogId) return { formError: "Cão não identificado." };

  const user = await requireUser(`/painel/caes/${dogId}`);

  const input: GeneticTestInput = {
    name: String(formData.get("name") ?? ""),
    result: String(formData.get("result") ?? ""),
    tested_on: String(formData.get("tested_on") ?? ""),
    lab: String(formData.get("lab") ?? ""),
  };

  const errors = validateGeneticTest(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const supabase = await createClient();

  const { count } = await supabase
    .from("dog_genetic_tests")
    .select("id", { count: "exact", head: true })
    .eq("dog_id", dogId)
    .is("deleted_at", null);

  if ((count ?? 0) >= MAX_GENETIC_TESTS_PER_DOG) {
    return {
      formError: `Este cão já tem ${MAX_GENETIC_TESTS_PER_DOG} exames cadastrados.`,
      values: input,
    };
  }

  const values = normalizeGeneticTest(input);
  const { error } = await supabase.from("dog_genetic_tests").insert({
    dog_id: dogId,
    name: values.name,
    result: values.result,
    tested_on: values.tested_on,
    lab: values.lab,
    created_by: user.id,
  });

  if (error) {
    return {
      formError: "Não foi possível registrar o exame. Confira se o cão é seu e tente de novo.",
      values: input,
    };
  }

  await revalidateDogPaths(supabase, dogId);
  return { ok: true };
}

/**
 * Editar um exame já gravado — o "U" que faltava no CRUD.
 *
 * É o caso com mais consequência das duas listas: `A/A` e `A/B` diferem por um
 * caractere e significam coisas opostas para quem avalia um cruzamento. Sem
 * edição, corrigir esse dedo exigia excluir e recadastrar, o que descartava o
 * `created_at` — a única pista de quando o laudo entrou no sistema.
 *
 * Mesmos três filtros de `updateHealthRecord`, pelo mesmo motivo.
 */
export async function updateGeneticTest(
  _prev: GeneticTestFormState,
  formData: FormData,
): Promise<GeneticTestFormState> {
  const id = String(formData.get("id") ?? "");
  const dogId = String(formData.get("dog_id") ?? "");
  if (!id || !dogId) return { formError: "Exame não identificado." };

  await requireUser(`/painel/caes/${dogId}`);

  const input: GeneticTestInput = {
    name: String(formData.get("name") ?? ""),
    result: String(formData.get("result") ?? ""),
    tested_on: String(formData.get("tested_on") ?? ""),
    lab: String(formData.get("lab") ?? ""),
  };

  const errors = validateGeneticTest(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeGeneticTest(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dog_genetic_tests")
    .update({
      name: values.name,
      result: values.result,
      tested_on: values.tested_on,
      lab: values.lab,
    })
    .eq("id", id)
    .eq("dog_id", dogId)
    .is("deleted_at", null)
    .select("id");

  if (error) return { formError: "Não foi possível salvar o exame.", values: input };

  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar este exame.", values: input };
  }

  await revalidateDogPaths(supabase, dogId);
  return { ok: true };
}

export async function deleteGeneticTest(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const dogId = String(formData.get("dog_id") ?? "");
  if (!id || !dogId) return;

  await requireUser(`/painel/caes/${dogId}`);

  const supabase = await createClient();
  await supabase
    .from("dog_genetic_tests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("dog_id", dogId)
    .is("deleted_at", null);

  await revalidateDogPaths(supabase, dogId);
}
