"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ASSIST_COOKIE } from "@/lib/assist-cookie";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/auth/queries";
import { DOG_FIELDS } from "@/modules/dogs/fields";
import {
  normalizeDogInput,
  validateDog,
  type DogFieldErrors,
  type DogInput,
} from "@/modules/dogs/validation";
import type { KennelFormState } from "@/modules/kennels/actions";
import { KENNEL_FORM_FIELDS } from "@/modules/kennels/fields";
import { isSlugTaken } from "@/modules/kennels/queries";
import {
  normalizeKennelInput,
  validateKennel,
  type KennelInput,
} from "@/modules/kennels/validation";
import { LITTER_FIELDS } from "@/modules/litters/fields";
import {
  normalizeLitterInput,
  validateLitter,
  type FieldErrors as LitterFieldErrors,
  type LitterInput,
} from "@/modules/litters/validation";
import { parentPublishState, type MediaActionState } from "@/modules/media/actions";
import {
  BUCKET_PRIVATE,
  BUCKET_PUBLIC,
  MAX_GALLERY_ITEMS,
  pathBelongsTo,
  targetBucketFor,
  validateQuota,
  validateStoredFile,
} from "@/modules/media/constraints";
import {
  kennelSlugOf,
  publishedLitterPublicIds,
  revalidateDogPaths,
  revalidateKennelPaths,
} from "@/modules/media/publish-targets";
import type { PublishState } from "@/modules/media/publish";
import { countDogGallery, getUsedBytes, statStorageObject } from "@/modules/media/queries";
import {
  dogMediaRows,
  kennelMediaRows,
  litterMediaRowsForKennel,
  reconcileMediaBucket,
  testimonialMediaRowsForKennel,
} from "@/modules/media/sync";

import { resolveHideReason, resolveSuspendReason } from "./format";
import { getKennelByOwner } from "./queries";

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

/**
 * Campo de id vazio é ausência, não string vazia.
 *
 * Devolve `undefined`, não `null`, porque é assim que o PostgREST expressa
 * "não mandei este argumento" — e aí o DEFAULT declarado na função SQL entra
 * (que é `null` em todos estes). Mandar `null` explícito é erro de tipo: os
 * parâmetros com default aparecem nos tipos gerados como `string | undefined`.
 */
function readId(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
  const price = litterId && priceRaw.length > 0 ? Number(priceRaw) : undefined;
  if (price !== undefined && (!Number.isFinite(price) || price <= 0)) {
    return { formError: "Preço deve ser um número maior que zero.", values: input };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_dog_for_kennel", {
    p_kennel_id: kennelId,
    p_name: name,
    p_sex: sex,
    p_reason: reason,
    p_born_on: values.born_on ?? undefined,
    p_breed: values.breed ?? undefined,
    p_color: values.color ?? undefined,
    p_coat: values.coat ?? undefined,
    p_titles: values.titles ?? undefined,
    p_slug: values.slug ?? undefined,
    // Progenitores: no caminho do filhote a RPC IGNORA estes e copia os da
    // ninhada — o trigger `dogs_check_litter_parents` recusaria qualquer outra
    // coisa. O formulário nem mostra os campos quando há ninhada escolhida.
    p_sire_id: readId(formData, "sire_id"),
    p_dam_id: readId(formData, "dam_id"),
    p_litter_id: litterId,
    p_litter_status: litterId
      ? String(formData.get("litter_status") ?? "") || undefined
      : undefined,
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
    p_mated_on: values.mated_on ?? undefined,
    p_born_on: values.born_on ?? undefined,
    p_description: values.description ?? undefined,
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

/* ===========================================================================
 * CANIL EM NOME DE OUTRA PESSOA — o primeiro degrau
 * ===========================================================================
 *
 * Sem isto, as duas ações acima não têm onde acontecer para quem acabou de
 * chegar: cão e ninhada exigem canil de destino, e o painel do usuário sem
 * canil não oferecia nada.
 */

function readKennelForm(formData: FormData): KennelInput {
  const input: KennelInput = {};
  for (const field of KENNEL_FORM_FIELDS) {
    const raw = formData.get(field.name);
    if (typeof raw === "string") input[field.name] = raw;
  }
  return input;
}

/**
 * Cadastra o canil de outra pessoa. Nasce SEMPRE rascunho — a RPC não aceita
 * `published_at`.
 *
 * REUSA `KennelFormState` em vez de declarar um estado próprio: todos os
 * membros são opcionais, então o `KennelForm` aceita este retorno sem
 * conversão, e um tipo a mais só criaria duas definições para manter em dia.
 */
export async function createKennelForUser(
  _prev: KennelFormState,
  formData: FormData,
): Promise<KennelFormState> {
  await requireAdmin();

  const ownerId = readId(formData, "owner_id");
  const reason = String(formData.get("reason") ?? "").trim();
  const input = readKennelForm(formData);

  if (!ownerId) return { formError: "Usuário de destino não identificado.", values: input };
  if (reason.length < 3) {
    return { formError: "Descreva o motivo do cadastro (mínimo 3 caracteres).", values: input };
  }

  const errors = validateKennel(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const values = normalizeKennelInput(input);
  const { name, slug } = values;
  if (!name || !slug) {
    return { formError: "Nome e endereço público são obrigatórios.", values: input };
  }

  // Consulta antes de gravar SÓ pela mensagem — é o que faz o erro aparecer no
  // campo do endereço em vez de virar banner acima do formulário. Quem GARANTE
  // continua sendo `kennels_slug_key`, e a RPC traduz o 23505 se a corrida
  // escapar daqui. Mesmo par de defesas de `createKennel`.
  if (await isSlugTaken(slug)) {
    return {
      errors: {
        slug: "Esse endereço já está em uso. O endereço fica reservado mesmo se o canil for excluído.",
      },
      values: input,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_kennel_for_user", {
    p_owner_id: ownerId,
    p_name: name,
    p_slug: slug,
    p_reason: reason,
    p_description: values.description ?? undefined,
    p_city: values.city ?? undefined,
    p_state: values.state ?? undefined,
    p_website_url: values.website_url ?? undefined,
    p_instagram_handle: values.instagram_handle ?? undefined,
    p_whatsapp: values.whatsapp ?? undefined,
    p_registration_number: values.registration_number ?? undefined,
  });

  if (error || !data) {
    return { formError: error?.message ?? "Não foi possível cadastrar o canil.", values: input };
  }

  revalidatePath(`/admin/usuarios/${ownerId}`);
  revalidatePath("/admin/canis");
  revalidatePath("/admin/historico");
  // Vai direto para a tela do canil: é de lá que saem cão e ninhada, então o
  // próximo passo do admin já está na tela onde ele cai.
  redirect(`/admin/canis/${data}`);
}

/* ===========================================================================
 * MÍDIA EM NOME DO DONO
 * ===========================================================================
 */

/**
 * Registra a metadata da imagem que o admin acabou de subir para o prefixo do
 * DONO.
 *
 * A assinatura é a de `RegisterAction` (`media/upload-one.ts`) porque é
 * exatamente ali que ela é injetada: `uploadOneImage` já aceita `ownerId` e
 * `registerAction` como parâmetros — foi desenhado para isto —, então o
 * caminho do dono não muda em nada.
 *
 * QUOTA E TETO DE GALERIA FICAM AQUI, e não na RPC: são limites de PLANO, não
 * invariantes de segurança, e as constantes vivem em `media/constraints.ts`.
 * Duplicá-las em SQL criaria dois números para manter iguais. A quota é cobrada
 * do DONO (`getUsedBytes(ownerId)`), nunca do admin — o arquivo ocupa o plano
 * de quem vai ficar com ele.
 *
 * O `reason` NÃO vem do `uploadOneImage`: quem o injeta no `FormData` é o
 * wrapper client da tela de upload, que o guarda no estado. Sem ele a RPC
 * recusa, porque `private.audit()` exige motivo.
 */
export async function registerMediaForUser(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  await requireAdmin();

  const role = String(formData.get("role") ?? "");
  const entityId = String(formData.get("entity_id") ?? "");
  const storagePath = String(formData.get("storage_path") ?? "");
  const thumbPath = String(formData.get("thumb_path") ?? "") || null;
  const width = Number(formData.get("width") ?? 0) || null;
  const height = Number(formData.get("height") ?? 0) || null;
  const reason = String(formData.get("reason") ?? "").trim();

  if (role !== "kennel_logo" && role !== "dog_gallery") {
    return { error: "Tipo de mídia inválido para envio por admin." };
  }
  if (!entityId || !storagePath) return { error: "Envio incompleto." };
  if (reason.length < 3) return { error: "Descreva o motivo do envio (mínimo 3 caracteres)." };

  const supabase = await createClient();
  const cleanup = async () => {
    const paths = [storagePath, thumbPath].filter((p): p is string => Boolean(p));
    await supabase.storage.from(BUCKET_PRIVATE).remove(paths);
  };

  // O DONO sai da ENTIDADE, aqui e na RPC — a checagem é dupla de propósito:
  // esta dá mensagem decente e permite limpar o arquivo órfão; a de lá é a que
  // vale, porque um POST direto pula esta função inteira.
  const ownerId = await ownerOfMediaTarget(supabase, role, entityId);
  if (!ownerId) {
    await cleanup();
    return { error: "Não foi possível identificar o dono deste registro." };
  }

  // O caminho tem de começar pelo id do DONO, não do admin. A policy de Storage
  // já barra o upload fora de um prefixo válido, mas ela aceita QUALQUER perfil
  // vivo quando quem escreve é admin — então é esta linha que amarra o arquivo
  // ao dono certo.
  if (!pathBelongsTo(storagePath, ownerId) || (thumbPath && !pathBelongsTo(thumbPath, ownerId))) {
    await cleanup();
    return { error: "Caminho de arquivo inválido." };
  }

  // `statStorageObject` faz `storage.list()`, que é SELECT em `storage.objects`
  // — e é por isso que ele precisa da policy de LEITURA alargada para admin
  // (`admin_le_storage_do_dono`). Sem ela, este ramo disparava logo depois de um
  // upload BEM-SUCEDIDO, e cada tentativa deixava dois arquivos órfãos: o
  // `cleanup()` abaixo não existia. Foram 24 num único dia, em produção.
  const full = await statStorageObject(BUCKET_PRIVATE, storagePath);
  if (!full) {
    await cleanup();
    return { error: "Arquivo não encontrado no armazenamento. Tente enviar de novo." };
  }

  const check = validateStoredFile({ mime: full.mime, size: full.size });
  if (!check.ok) {
    await cleanup();
    return { error: check.reason };
  }

  const thumb = thumbPath ? await statStorageObject(BUCKET_PRIVATE, thumbPath) : null;

  const used = await getUsedBytes(ownerId);
  const quota = validateQuota(used, full.size + (thumb?.size ?? 0));
  if (!quota.ok) {
    await cleanup();
    return { error: quota.reason };
  }

  if (role === "dog_gallery") {
    const current = await countDogGallery(entityId);
    if (current >= MAX_GALLERY_ITEMS) {
      await cleanup();
      return { error: `A galeria aceita no máximo ${MAX_GALLERY_ITEMS} imagens.` };
    }
  }

  const { data, error } = await supabase.rpc("admin_register_media_for_user", {
    p_role: role,
    p_entity_id: entityId,
    p_storage_path: storagePath,
    p_reason: reason,
    p_thumb_path: thumbPath ?? undefined,
    p_width: width ?? undefined,
    p_height: height ?? undefined,
  });

  if (error || !data) {
    await cleanup();
    return { error: error?.message ?? "Não foi possível registrar a imagem." };
  }

  // Mesma correção do bug relatado em `registerMedia`: foto adicionada depois de
  // a entidade já estar publicada ficaria presa no bucket privado, invisível na
  // página pública sem erro nenhum.
  const parent = await parentPublishState(supabase, role, entityId);
  if (targetBucketFor(parent.isPublished) === BUCKET_PUBLIC) {
    const outcome = await reconcileMediaBucket(
      supabase,
      [{ id: data, bucket_id: BUCKET_PRIVATE, storage_path: storagePath, thumb_path: thumbPath }],
      BUCKET_PUBLIC,
    );
    if (outcome.failed.length > 0) {
      console.error(
        `[admin:registerMediaForUser] falha ao mover ${data} para o bucket público:`,
        outcome.failed.map((f) => f.reason).join("; "),
      );
    } else if (parent.publicPath) {
      revalidatePath(parent.publicPath);
    }
  }

  if (role === "kennel_logo") {
    revalidatePath(`/admin/canis/${entityId}`);
    revalidatePath(`/painel/canis/${entityId}`);
    // O logo é a peça que costuma FECHAR a elegibilidade do selo Fundador
    // (nome, cidade, estado, logo e ao menos um cão). Se queimou número, foi
    // agora — e a tela do selo precisa refletir isso.
    revalidatePath("/admin/selo-fundador");
  } else {
    revalidatePath(`/admin/caes/${entityId}`);
    revalidatePath(`/painel/caes/${entityId}`);
  }
  revalidatePath("/admin/historico");

  return { mediaId: data };
}

/** O dono do registro que vai receber a mídia. `null` quando não há um. */
async function ownerOfMediaTarget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  role: "kennel_logo" | "dog_gallery",
  entityId: string,
): Promise<string | null> {
  if (role === "kennel_logo") {
    const { data } = await supabase
      .from("kennels")
      .select("owner_id")
      .eq("id", entityId)
      .is("deleted_at", null)
      .maybeSingle();
    return data?.owner_id ?? null;
  }

  const { data } = await supabase
    .from("dogs")
    .select("owner_id")
    .eq("id", entityId)
    .is("deleted_at", null)
    .maybeSingle();
  // `dogs.owner_id` é NULLABLE — ancestral fantasma não tem dono, e portanto não
  // tem prefixo de Storage nem plano a que cobrar o arquivo.
  return data?.owner_id ?? null;
}

/* ===========================================================================
 * PUBLICAR PELO PAINEL ADMINISTRATIVO — a porta que faltava ter rastro
 * ===========================================================================
 *
 * NÃO É PORTA NOVA. `dogs_update` e `kennels_update_own` sempre carregaram
 * `or private.is_admin()`, e `publishDog`/`publishKennel` nunca filtraram
 * posse — um admin já publicava qualquer registro, pelo caminho do dono, sem
 * deixar rastro nenhum. O que muda é que agora existe uma porta que AUDITA, e o
 * caminho do dono passou a recusar quem não é dono (ver `ehDonoDoCao` em
 * `media/publish.ts`).
 *
 * A ORDEM DAS OPERAÇÕES É A MESMA de `media/publish.ts`, e pelo mesmo motivo:
 * ao publicar, move o arquivo PRIMEIRO (entidade pública com mídia privada
 * quebra a imagem de forma permanente, porque a página cacheada não pode usar
 * URL assinada); ao despublicar, tira do ar PRIMEIRO (o passo que importa para
 * privacidade não pode ficar refém de um soluço do Storage).
 *
 * SEM E-MAIL AO DONO, de propósito. O aditivo de e-mail define os quatro
 * disparos como "ação DO USUÁRIO no nosso código", e um admin publicando não é
 * ação dele. Publicar pelo painel do dono continua disparando normalmente.
 */

function readPublishInput(formData: FormData): { id: string; publicar: boolean; reason: string } {
  return {
    id: String(formData.get("id") ?? ""),
    publicar: formData.get("published") === "true",
    reason: String(formData.get("reason") ?? "").trim(),
  };
}

export async function setDogPublishedByAdmin(formData: FormData): Promise<PublishState> {
  await requireAdmin();

  const { id, publicar, reason } = readPublishInput(formData);
  if (!id) return { error: "Cão não identificado." };
  if (reason.length < 3) return { error: "Descreva o motivo (mínimo 3 caracteres)." };

  const supabase = await createClient();
  const { data: dog } = await supabase
    .from("dogs")
    .select("id, public_id, kennels(slug)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!dog) return { error: "Cão não encontrado." };

  if (publicar) {
    const sync = await reconcileMediaBucket(supabase, await dogMediaRows(supabase, id), BUCKET_PUBLIC);
    if (sync.failed.length > 0) {
      return {
        error:
          "Não foi possível preparar as imagens para o acesso público. O cão NÃO foi publicado — tente de novo.",
      };
    }
  }

  const { error } = await supabase.rpc("admin_set_dog_published", {
    p_dog_id: id,
    p_published: publicar,
    p_reason: reason,
  });
  // A RPC levanta em português — mensagem vai direto para a tela.
  if (error) return { error: error.message };

  revalidateDogPaths(dog.public_id, id, kennelSlugOf(dog));
  revalidatePath(`/admin/caes/${id}`);
  revalidatePath("/admin/caes");
  revalidatePath("/admin/historico");

  if (!publicar) {
    const sync = await reconcileMediaBucket(
      supabase,
      await dogMediaRows(supabase, id),
      BUCKET_PRIVATE,
    );
    if (sync.failed.length > 0) {
      return {
        ok: true,
        warning:
          "O cão saiu do ar, mas não foi possível remover as fotos do endereço público. " +
          "Quem tiver o link antigo da imagem ainda consegue abri-la. Rode a reconciliação ou tente de novo.",
      };
    }
  }

  return { ok: true };
}

export async function setKennelPublishedByAdmin(formData: FormData): Promise<PublishState> {
  await requireAdmin();

  const { id, publicar, reason } = readPublishInput(formData);
  if (!id) return { error: "Canil não identificado." };
  if (reason.length < 3) return { error: "Descreva o motivo (mínimo 3 caracteres)." };

  const supabase = await createClient();
  const { data: kennel } = await supabase
    .from("kennels")
    .select("id, slug")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!kennel) return { error: "Canil não encontrado." };

  /**
   * Ao PUBLICAR, só a ninhada e o depoimento JÁ publicados sobem — o que está em
   * rascunho continua invisível pela regra dupla, então o arquivo dele fica no
   * privado. Ao DESPUBLICAR, TUDO desce: a regra dupla esconde o canil inteiro,
   * então nenhum arquivo pode continuar acessível no endereço público.
   */
  const arquivos = async () => {
    const filtro = publicar ? { onlyPublished: true } : undefined;
    const [doCanil, dasNinhadas, dosDepoimentos] = await Promise.all([
      kennelMediaRows(supabase, id),
      litterMediaRowsForKennel(supabase, id, filtro),
      testimonialMediaRowsForKennel(supabase, id, filtro),
    ]);
    return [...doCanil, ...dasNinhadas, ...dosDepoimentos];
  };

  if (publicar) {
    const sync = await reconcileMediaBucket(supabase, await arquivos(), BUCKET_PUBLIC);
    if (sync.failed.length > 0) {
      return {
        error:
          "Não foi possível preparar as imagens para o acesso público. O canil NÃO foi publicado — tente de novo.",
      };
    }
  }

  const { error } = await supabase.rpc("admin_set_kennel_published", {
    p_kennel_id: id,
    p_published: publicar,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  revalidateKennelPaths(kennel.slug, id);
  revalidatePath(`/admin/canis/${id}`);
  revalidatePath("/admin/canis");
  revalidatePath("/admin/historico");

  // A REGRA DUPLA depende do canil: publicar reabre a ninhada que já estava
  // publicada; despublicar fecha TODAS. Sem isto, `/n/[public_id]` fica preso na
  // versão cacheada até os 300s do ISR vencerem sozinhos.
  const ninhadas = await publishedLitterPublicIds(supabase, id, { onlyPublished: publicar });
  for (const publicId of ninhadas) revalidatePath(`/n/${publicId}`);

  if (!publicar) {
    const sync = await reconcileMediaBucket(supabase, await arquivos(), BUCKET_PRIVATE);
    if (sync.failed.length > 0) {
      return {
        ok: true,
        warning:
          "O canil saiu do ar, mas não foi possível remover as imagens do endereço público. " +
          "Quem tiver o link antigo da imagem ainda consegue abri-la. Rode a reconciliação ou tente de novo.",
      };
    }
  }

  return { ok: true };
}

/* ===========================================================================
 * CADASTRO ASSISTIDO — abrir e encerrar
 * ===========================================================================
 *
 * A REGRA está no banco. `admin_start_assist_session` valida o alvo, recusa
 * sessão dupla e grava a linha de `assist.start`; a partir daí
 * `private.assisting_profile()` é o que as policies consultam. Estas duas
 * funções só chamam as RPCs e mandam a tela para o lugar certo.
 */

export type AssistState = { error?: string; ok?: boolean };

/**
 * Abre a sessão e leva o admin direto para onde o trabalho acontece: o painel
 * do canil, se já existir, ou a raiz do painel quando o criador ainda não tem
 * um — e aí o caminho é cadastrar o canil primeiro, pela porta auditada.
 */
export async function startAssistSession(formData: FormData): Promise<AssistState> {
  await requireAdmin();

  const targetId = readId(formData, "target_profile_id");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!targetId) return { error: "Usuário não identificado." };
  if (reason.length < 3) {
    return { error: "Descreva o motivo do cadastro assistido (mínimo 3 caracteres)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_start_assist_session", {
    p_target_profile_id: targetId,
    p_reason: reason,
  });
  // A RPC levanta em português — mensagem vai direto para a tela.
  if (error) return { error: error.message };

  const kennel = await getKennelByOwner(targetId);

  // O cookie é o que faz o proxy servir as telas do criador sob `/admin`. É
  // dica de UI, nunca autorização — ver `lib/assist-cookie.ts`. `httpOnly`
  // porque nenhum código de client precisa lê-lo, e `sameSite: lax` para
  // sobreviver à navegação normal.
  const jar = await cookies();
  jar.set(ASSIST_COOKIE, targetId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  revalidatePath("/admin/historico");
  revalidatePath(`/admin/usuarios/${targetId}`);
  // `layout` e não `page`: a faixa de "assistindo" mora no layout, e sem isto
  // ela só apareceria na navegação seguinte.
  revalidatePath("/painel", "layout");
  revalidatePath("/admin", "layout");

  // Direto no prefixo novo. Mandar para `/painel` funcionaria — o proxy
  // desviaria — mas custaria um salto a mais logo na entrada.
  const base = `/admin/assistir/${targetId}`;
  redirect(kennel ? `${base}/canis/${kennel.id}` : base);
}

/**
 * Encerra a sessão. Devolve `void` para poder ser usada direto num
 * `<form action={...}>` — a faixa fica em todo layout, e uma ilha cliente só
 * para exibir um erro que praticamente não acontece (a RPC é idempotente e
 * não falha para admin) sairia mais caro do que vale.
 */
export async function endAssistSession(): Promise<void> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_end_assist_session");
  if (error) {
    // Não trava a navegação: a sessão continua aberta e a faixa continua na
    // tela, que é o estado honesto.
    console.error("[admin:endAssistSession]", error.message);
    return;
  }

  // O cookie sai DEPOIS da RPC, nunca antes: se a chamada falhasse, apagá-lo
  // deixaria o admin sem o desvio de rota e sem a faixa, mas com a sessão ainda
  // aberta no banco — autorizado a escrever e sem nada na tela dizendo isso.
  (await cookies()).delete(ASSIST_COOKIE);

  revalidatePath("/admin/historico");
  revalidatePath("/painel", "layout");
  revalidatePath("/admin", "layout");

  redirect("/admin/usuarios");
}
