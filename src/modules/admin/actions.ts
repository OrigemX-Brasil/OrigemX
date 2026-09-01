"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/auth/queries";
import { DOG_FIELDS } from "@/modules/dogs/fields";
import {
  normalizeDogInput,
  validateDog,
  type DogFieldErrors,
  type DogInput,
} from "@/modules/dogs/validation";
import { LITTER_FIELDS } from "@/modules/litters/fields";
import {
  normalizeLitterInput,
  validateLitter,
  type FieldErrors as LitterFieldErrors,
  type LitterInput,
} from "@/modules/litters/validation";

import { resolveHideReason, resolveSuspendReason } from "./format";

/**
 * Server Actions do painel administrativo — a primeira mutação real do
 * módulo. Toda função aqui abre chamando `requireAdmin()`, mesmo contrato já
 * registrado em `src/modules/README.md`: o layout de `/admin` já é o portão,
 * mas nenhuma Server Action deste projeto confia nisso sozinha — é o mesmo
 * padrão que `createDog`/`createKennel`/`publishKennel` já seguem com
 * `requireUser()`.
 */

export type SuspendState = {
  error?: string;
  ok?: boolean;
};

/**
 * Suspende ou reativa um usuário. A REGRA fica inteira em
 * `admin_set_profile_suspended` (RLS + `auth.users.banned_until` +
 * `audit_log`, tudo numa transação só) — este Server Action só chama a RPC
 * com sessão de admin e traduz o resultado para a tela.
 *
 * Auto-suspensão nem chega aqui: a UI não oferece o botão na própria linha
 * (mesma filosofia de `getManageableDogById` — "oferecer o controle já é
 * erro"). Se mesmo assim a chamada chegar, a RPC recusa e `error.message` já
 * vem em português, pronto para a tela.
 */
export async function setProfileSuspended(formData: FormData): Promise<SuspendState> {
  await requireAdmin();

  const profileId = String(formData.get("profileId") ?? "");
  const suspend = formData.get("suspend") === "true";
  const reason = resolveSuspendReason(String(formData.get("reason") ?? ""), suspend);

  if (!profileId) return { error: "Usuário não identificado." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_profile_suspended", {
    p_profile_id: profileId,
    p_suspended: suspend,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  revalidatePath(`/admin/usuarios/${profileId}`);
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export type HideState = {
  error?: string;
  ok?: boolean;
};

/**
 * Oculta ou reativa um canil ou cão. Mesma forma de `setProfileSuspended`,
 * generalizada sobre as duas RPCs (`admin_set_kennel_hidden` /
 * `admin_set_dog_hidden`) — ambas seguem o molde idêntico de
 * `admin_set_profile_suspended`: checam admin, são idempotentes, e auditam
 * `{de, para}` na mesma transação.
 *
 * Também é o mecanismo de "corrigir duplicidade": não existe ação separada
 * para isso — o admin oculta o registro duplicado por aqui, escrevendo no
 * motivo qual é o outro registro. Fica em `audit_log`, aparece no Histórico,
 * sem tabela nem tela novas.
 */
export async function setEntityHidden(formData: FormData): Promise<HideState> {
  await requireAdmin();

  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const hide = formData.get("hide") === "true";
  const reason = resolveHideReason(String(formData.get("reason") ?? ""), hide);

  if (!entityId) return { error: "Registro não identificado." };

  const supabase = await createClient();
  const { error } =
    entityType === "dog"
      ? await supabase.rpc("admin_set_dog_hidden", {
          p_dog_id: entityId,
          p_hidden: hide,
          p_reason: reason,
        })
      : await supabase.rpc("admin_set_kennel_hidden", {
          p_kennel_id: entityId,
          p_hidden: hide,
          p_reason: reason,
        });

  if (error) return { error: error.message };

  const base = entityType === "dog" ? "/admin/caes" : "/admin/canis";
  revalidatePath(`${base}/${entityId}`);
  revalidatePath(base);
  return { ok: true };
}

export type FounderNumberState = {
  error?: string;
  ok?: boolean;
};

/**
 * Corrige o número do selo Fundador de um canil. Diferente de suspender/
 * ocultar, o motivo é OBRIGATÓRIO aqui — sem `resolveXReason`, sem padrão:
 * o campo é `required` na tela, e se algo escapar disso `private.audit()`
 * já recusa motivo curto com mensagem em português.
 *
 * A regra fica inteira em `admin_set_founder_number` — unicidade pelo
 * índice (mensagem pronta quando o número já pertence a outro canil),
 * escotilha do trigger de imutabilidade aberta e fechada num só statement,
 * auditoria `{de, para}` na mesma transação.
 */
export async function setFounderNumber(formData: FormData): Promise<FounderNumberState> {
  await requireAdmin();

  const kennelId = String(formData.get("kennelId") ?? "");
  const number = Number(formData.get("number"));
  const reason = String(formData.get("reason") ?? "");

  if (!kennelId) return { error: "Canil não identificado." };
  if (!Number.isInteger(number)) return { error: "Número inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_founder_number", {
    p_kennel_id: kennelId,
    p_number: number,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  revalidatePath(`/admin/canis/${kennelId}`);
  revalidatePath("/admin/canis");
  revalidatePath("/admin/selo-fundador");
  return { ok: true };
}

/**
 * ============================================================================
 * Cadastro EM NOME DE OUTRO USUÁRIO
 * ============================================================================
 *
 * Mesma divisão de trabalho das ações acima, e por um motivo mais forte aqui: a
 * regra inteira (dono vindo do canil, autoria do admin, herança de publicação,
 * teto de filhotes e a linha de `audit_log`) vive dentro de
 * `admin_create_dog_for_kennel` / `admin_create_litter_for_kennel`, NUMA SÓ
 * TRANSAÇÃO. Não dá para fazer isso daqui: `audit_log` não tem GRANT de INSERT
 * para ninguém, e o PostgREST não abre transação entre duas chamadas.
 *
 * O que sobra para este arquivo é o que ele sempre fez — `requireAdmin()`, ler o
 * formulário, validar para a mensagem sair decente, chamar a RPC e traduzir.
 *
 * A validação reusa `validateDog`/`validateLitter` de propósito: é a MESMA
 * regra que o dono enfrenta no painel dele. Um cadastro feito pelo admin que
 * aceitasse o que o formulário do dono recusa produziria registro que ele não
 * consegue nem reeditar.
 */

export type AdminCreateDogState = {
  errors?: DogFieldErrors;
  formError?: string;
  values?: DogInput;
};

function readDogForm(formData: FormData): DogInput {
  const input: DogInput = {};
  for (const field of DOG_FIELDS) {
    const raw = formData.get(field.name);
    if (typeof raw === "string") input[field.name] = raw;
  }
  return input;
}

/** Campo de id vazio é ausência, não string vazia — o banco espera NULL. */
function readId(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Cadastra um cão (ou um filhote, com `litter_id`) no canil de outra pessoa.
 *
 * O motivo é OBRIGATÓRIO, como em `setFounderNumber` e pela mesma razão: é o
 * único lugar onde o porquê desta criação vai existir. Sem `resolveXReason` —
 * aqui não há padrão razoável a inventar.
 */
export async function createDogForUser(
  _prev: AdminCreateDogState,
  formData: FormData,
): Promise<AdminCreateDogState> {
  await requireAdmin();

  const kennelId = readId(formData, "kennel_id");
  const reason = String(formData.get("reason") ?? "").trim();
  const input = readDogForm(formData);

  if (!kennelId) return { formError: "Canil de destino não identificado.", values: input };
  if (reason.length < 3) {
    return { formError: "Descreva o motivo do cadastro (mínimo 3 caracteres).", values: input };
  }

  const errors = validateDog(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeDogInput(input);
  const name = values.name;
  const sex = values.sex;
  if (!name || !sex) return { formError: "Nome e sexo são obrigatórios.", values: input };

  const litterId = readId(formData, "litter_id");
  const priceRaw = String(formData.get("price_brl") ?? "").trim();

  // Os três só existem DENTRO de ninhada — os CHECKs do banco são
  // bicondicionais e a RPC recusa a combinação. Mandar null quando não há
  // ninhada é o que mantém a chamada válida.
  const price = litterId && priceRaw.length > 0 ? Number(priceRaw) : null;
  if (price !== null && (!Number.isFinite(price) || price <= 0)) {
    return { formError: "Preço deve ser um número maior que zero.", values: input };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_dog_for_kennel", {
    p_kennel_id: kennelId,
    p_name: name,
    p_sex: sex,
    p_reason: reason,
    p_born_on: values.born_on ?? null,
    p_breed: values.breed ?? null,
    p_color: values.color ?? null,
    p_coat: values.coat ?? null,
    p_titles: values.titles ?? null,
    p_slug: values.slug ?? null,
    // Progenitores: no caminho do filhote a RPC IGNORA estes e copia os da
    // ninhada — o trigger `dogs_check_litter_parents` recusaria qualquer outra
    // coisa. O formulário nem mostra os campos quando há ninhada escolhida.
    p_sire_id: readId(formData, "sire_id"),
    p_dam_id: readId(formData, "dam_id"),
    p_litter_id: litterId,
    p_litter_status: litterId ? (String(formData.get("litter_status") ?? "") || null) : null,
    p_price_brl: price,
    p_accepts_offer: litterId ? formData.get("accepts_offer") === "on" : false,
  });

  // O banco levanta em português — mensagem de RPC vai direto para a tela, mesmo
  // contrato das ações acima.
  if (error || !data) {
    return { formError: error?.message ?? "Não foi possível cadastrar o cão.", values: input };
  }

  revalidatePath(`/admin/canis/${kennelId}`);
  revalidatePath("/admin/caes");
  revalidatePath("/admin/selo-fundador");
  // A criação escreveu uma linha de auditoria: o Histórico mudou.
  revalidatePath("/admin/historico");
  // Segmento `criado`, e NÃO `pronto`: `/painel/caes/[id]/pronto` renderiza
  // `DogCreated`, que traz o botão de PUBLICAR — que é do dono, não do admin.
  // Rotas distintas tornam as duas telas impossíveis de confundir num link.
  redirect(`/admin/caes/${data}/criado`);
}

export type AdminCreateLitterState = {
  errors?: LitterFieldErrors;
  formError?: string;
  values?: LitterInput;
};

function readLitterForm(formData: FormData): LitterInput {
  const input: LitterInput = {};
  for (const field of LITTER_FIELDS) {
    const raw = formData.get(field.name);
    if (typeof raw === "string") input[field.name] = raw;
  }
  return input;
}

/**
 * Cadastra uma ninhada no canil de outra pessoa. Nasce SEMPRE rascunho — a RPC
 * não aceita `published_at` e publicar continua sendo decisão do dono.
 */
export async function createLitterForUser(
  _prev: AdminCreateLitterState,
  formData: FormData,
): Promise<AdminCreateLitterState> {
  await requireAdmin();

  const kennelId = readId(formData, "kennel_id");
  const reason = String(formData.get("reason") ?? "").trim();
  const input = readLitterForm(formData);

  if (!kennelId) return { formError: "Canil de destino não identificado.", values: input };
  if (reason.length < 3) {
    return { formError: "Descreva o motivo do cadastro (mínimo 3 caracteres).", values: input };
  }

  const errors = validateLitter(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeLitterInput(input);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_litter_for_kennel", {
    p_kennel_id: kennelId,
    p_reason: reason,
    p_sire_id: readId(formData, "sire_id"),
    p_dam_id: readId(formData, "dam_id"),
    p_mated_on: values.mated_on ?? null,
    p_born_on: values.born_on ?? null,
    p_description: values.description ?? null,
  });

  if (error || !data) {
    return { formError: error?.message ?? "Não foi possível cadastrar a ninhada.", values: input };
  }

  revalidatePath(`/admin/canis/${kennelId}`);
  revalidatePath("/admin/historico");
  // Não existe `/admin/ninhadas/[id]`, e não vale inventar uma tela cujo único
  // link útil apontaria de volta para a lista do canil. O id vai na query e a
  // tela do canil confirma a criação destacando a linha nova.
  redirect(`/admin/canis/${kennelId}?criada=${data}`);
}
