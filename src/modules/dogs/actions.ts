"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { dispararPrimeiroCao } from "@/lib/notify/usuario/disparos";
import { resolveOwnerId } from "@/lib/assist";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";
import { getMyKennel } from "@/modules/kennels/queries";

import {
  ineligibilityOf,
  INELIGIBILITY_REASON,
  type AncestorCandidate,
  type ParentSlot,
} from "./ancestors";
import { translateDogError } from "./errors";
import { DOG_FIELDS, DOG_GHOST_FIELDS, type DogField } from "./fields";
import {
  normalizeIdentifierInput,
  validateIdentifiers,
  type IdentifierErrors,
  type IdentifierInput,
} from "./identifiers";
import { countMyDogs, getDescendantIds, searchAncestorCandidates } from "./queries";
import { normalizeDogInput, validateDog, type DogFieldErrors, type DogInput } from "./validation";

export type DogFormState = {
  errors?: DogFieldErrors;
  formError?: string;
  parentError?: { sire_id?: string; dam_id?: string };
  values?: DogInput;
  /** Preenchido só por `createGhostAncestor`, para o seletor já marcá-lo. */
  created?: AncestorCandidate;
  ok?: boolean;
};

/**
 * A assinatura que `useActionState` exige, exportada para que uma tela de FORA
 * deste módulo injete outra ação no `DogForm` sem que `dogs` precise conhecê-la.
 *
 * Existe por causa da direção da dependência: `admin/actions.ts` já importa
 * `dogs/validation` e `dogs/fields`. Uma tabela de modos dentro do formulário
 * obrigaria o caminho inverso e fecharia o ciclo — então quem chama traz a ação.
 */
export type DogFormAction = (state: DogFormState, formData: FormData) => Promise<DogFormState>;

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

  // O canil vem do SERVIDOR, não do formulário: o cliente não nomeia mais id de
  // canil nenhum. Ele só diz se quer o vínculo — e a resposta vale só se o
  // usuário tiver canil.
  const kennelId = formData.get("vincular_canil")
    ? ((await getMyKennel(user.id))?.id ?? null)
    : null;
  const sireId = readParent(formData, "sire");
  const damId = readParent(formData, "dam");

  const values = normalizeDogInput(input);
  const name = values.name;
  const sex = values.sex;
  if (!name || !sex) return { formError: "Nome e sexo são obrigatórios.", values: input };

  // `dogs_slug_requires_kennel` recusa slug sem canil. O formulário já esconde o
  // campo nesse caso; isto é a garantia do servidor, e sai barato porque o
  // `kennelId` acabou de ser resolvido aqui.
  if (!kennelId) values.slug = null;

  const supabase = await createClient();
  // Sob cadastro assistido o cão nasce do CRIADOR, não do admin que digitou.
  // `created_by` continua sendo quem digitou — autoria não se transfere.
  const ownerId = await resolveOwnerId(user.id);

  const { data, error } = await supabase
    .from("dogs")
    .insert({
      ...values,
      name,
      sex,
      kennel_id: kennelId,
      owner_id: ownerId,
      sire_id: sireId,
      dam_id: damId,
      created_by: user.id,
    })
    .select("id, name, public_id")
    .single();

  if (error || !data) return toFormState(error, input);

  await avisarPrimeiroCao(user.id, data);

  revalidatePath("/painel/caes");
  // Para a TELA DE SUCESSO, não para o formulário de edição. Cair de volta no
  // mesmo formulário que acabou de ser preenchido — sem confirmação, e com o
  // cão em rascunho, portanto sem link público nenhum na tela — era a maior
  // fricção do cadastro: o criador salvava e não via nada pronto.
  redirect(`/painel/caes/${data.id}/pronto`);
}

/**
 * E-mail do PRIMEIRO cão — e só do primeiro.
 *
 * `countMyDogs === 1` logo depois do insert é o que decide: o cão recém-criado
 * já está contado, então "exatamente um" significa que este foi o primeiro. Um
 * sinalizador em `profiles` seria uma segunda fonte de verdade para algo que a
 * própria contagem responde.
 *
 * NÃO LEVANTA e não bloqueia: a guarda já engole tudo, e este `try` cobre a
 * contagem em si. Cadastrar um cão não pode falhar porque o e-mail caiu.
 *
 * `after()` porque `redirect()` lança por dentro e fecha a resposta — um
 * `void` solto morreria com a função serverless antes de o envio sair.
 */
async function avisarPrimeiroCao(
  userId: string,
  dog: { id: string; name: string; public_id: string },
): Promise<void> {
  try {
    if ((await countMyDogs(userId)) !== 1) return;
    after(() => dispararPrimeiroCao(userId, dog));
  } catch (erro) {
    console.error(
      "[email:primeiro-cao] contagem falhou:",
      erro instanceof Error ? erro.message : erro,
    );
  }
}

export async function updateDog(_prev: DogFormState, formData: FormData): Promise<DogFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { formError: "Cão não identificado." };

  const user = await requireUser(`/painel/caes/${id}`);

  const input = readForm(formData, DOG_FIELDS);
  const errors = validateDog(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  // `kennel_id` só entra no patch se o CONTROLE FOI RENDERIZADO. Quando não
  // foi, a coluna não é tocada — e isto não é preciosismo.
  //
  // `getManageableDogById` devolve também o ANCESTRAL FANTASMA que o usuário
  // cadastrou: `owner_id` e `kennel_id` nulos, `created_by` dele. A policy
  // `dogs_select` só o trata como nó público de árvore ENQUANTO os dois forem
  // nulos. Gravar `kennel_id` cegamente o transformaria em rascunho, e ele
  // sumiria — em silêncio — de todo pedigree publicado que o referencia.
  const vinculoNaTela = formData.has("vinculo_canil_presente");
  const kennelPatch = vinculoNaTela
    ? {
        kennel_id: formData.get("vincular_canil")
          ? ((await getMyKennel(user.id))?.id ?? null)
          : null,
      }
    : {};

  const sireId = readParent(formData, "sire");
  const damId = readParent(formData, "dam");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dogs")
    .update({
      ...normalizeDogInput(input),
      ...kennelPatch,
      sire_id: sireId,
      dam_id: damId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, public_id");

  if (error) return toFormState(error, input);

  // Zero linhas sem erro é RLS negando, não "nada mudou".
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar este cão.", values: input };
  }

  revalidatePath("/painel/caes");
  revalidatePath(`/painel/caes/${id}`);
  // Sem isto o perfil público ficava até 5min desatualizado depois de uma
  // edição — o mesmo padrão que `revalidateDog` já aplica em publish.ts.
  revalidatePath(`/d/${data[0].public_id}`);
  return { ok: true, values: input };
}

export type IdentifierFormState = {
  errors?: IdentifierErrors;
  formError?: string;
  values?: IdentifierInput;
  ok?: boolean;
};

/**
 * RG e microchip do cão. Uma única ação para os dois campos, porque é um
 * formulário só: deixar campo em branco remove o identificador daquele tipo.
 *
 * O antigo sai (soft-delete) antes do novo entrar, mesmo padrão do logo do
 * canil em `modules/media/actions.ts` — senão o índice único de "um principal
 * por tipo" recusaria a inserção. `translateDogError` já sabe traduzir tanto
 * duplicidade de microchip quanto de registro; nenhuma mudança precisou entrar
 * em `errors.ts`.
 */
export async function updateDogIdentifiers(
  _prev: IdentifierFormState,
  formData: FormData,
): Promise<IdentifierFormState> {
  const dogId = String(formData.get("dog_id") ?? "");
  if (!dogId) return { formError: "Cão não identificado." };

  const user = await requireUser(`/painel/caes/${dogId}`);

  const input: IdentifierInput = {
    registration_value: String(formData.get("registration_value") ?? ""),
    registration_issuer: String(formData.get("registration_issuer") ?? ""),
    microchip_value: String(formData.get("microchip_value") ?? ""),
  };

  const errors = validateIdentifiers(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeIdentifierInput(input);
  const supabase = await createClient();

  const replace = async (
    kind: "registration" | "microchip",
    value: string | null,
    issuer: string | null,
  ): Promise<string | null> => {
    await supabase
      .from("dog_identifiers")
      .update({ deleted_at: new Date().toISOString() })
      .eq("dog_id", dogId)
      .eq("kind", kind)
      .eq("is_primary", true)
      .is("deleted_at", null);

    if (!value) return null; // campo limpo: só remove, sem inserir de novo.

    const { error } = await supabase.from("dog_identifiers").insert({
      dog_id: dogId,
      kind,
      value,
      issuer,
      is_primary: true,
      created_by: user.id,
    });

    return error ? translateDogError(error).message : null;
  };

  const registrationError = await replace(
    "registration",
    values.registration_value,
    values.registration_issuer,
  );
  if (registrationError) return { formError: registrationError, values: input };

  const microchipError = await replace("microchip", values.microchip_value, null);
  if (microchipError) return { formError: microchipError, values: input };

  revalidatePath(`/painel/caes/${dogId}`);
  return { ok: true, values: input };
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
