"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";
import {
  parentPublishState,
  type MediaActionState,
} from "@/modules/media/actions";
import {
  BUCKET_PRIVATE,
  BUCKET_PUBLIC,
  pathBelongsTo,
  targetBucketFor,
  validateQuota,
  validateStoredFile,
} from "@/modules/media/constraints";
import { getUsedBytes, litterPhotoPositions, statStorageObject } from "@/modules/media/queries";
import { litterMediaRows, reconcileMediaBucket } from "@/modules/media/sync";
import type { PublishState } from "@/modules/media/publish";

import { MAX_LITTER_PHOTOS } from "./constraints";
import { getManageableLitterById } from "./queries";
import {
  normalizeLitterInput,
  validateLitter,
  type FieldErrors,
  type LitterInput,
} from "./validation";

export type LitterFormState = {
  errors?: FieldErrors;
  formError?: string;
  values?: LitterInput;
  ok?: boolean;
};

function readInput(formData: FormData): LitterInput {
  return { description: String(formData.get("description") ?? "") };
}

/**
 * Revalida a página pública do canil a partir do id — `updateLitter` e
 * `softDeleteLitter` só recebem `kennel_id`, não o slug. Sem isto, editar ou
 * excluir uma ninhada JÁ PUBLICADA deixava `/c/[slug]` com a versão antiga
 * por até 300s (o ISR da rota) — a mesma classe de bug que `registerMedia`/
 * `deleteMedia` já tratam do lado da foto, só que faltando aqui do lado do
 * texto e da exclusão.
 */
async function revalidateKennelPublicPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kennelId: string,
) {
  const { data: kennel } = await supabase
    .from("kennels")
    .select("slug")
    .eq("id", kennelId)
    .maybeSingle();
  if (kennel?.slug) revalidatePath(`/c/${kennel.slug}`);
}

export async function createLitter(
  _prev: LitterFormState,
  formData: FormData,
): Promise<LitterFormState> {
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!kennelId) return { formError: "Canil não identificado." };

  const user = await requireUser(`/painel/canis/${kennelId}/ninhadas/novo`);
  const input = readInput(formData);

  const errors = validateLitter(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  // Consulta antes de gravar só para dar mensagem decente — quem garante a
  // posse é a RLS (`private.owns_kennel`), mesmo raciocínio de `isSlugTaken`
  // em kennels/actions.ts.
  const supabase = await createClient();
  const { data: kennel } = await supabase
    .from("kennels")
    .select("id")
    .eq("id", kennelId)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!kennel) return { formError: "Canil não encontrado." };

  const { description } = normalizeLitterInput(input);
  const { data, error } = await supabase
    .from("kennel_litters")
    .insert({ kennel_id: kennelId, description, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { formError: "Não foi possível cadastrar a ninhada.", values: input };
  }

  revalidatePath(`/painel/canis/${kennelId}`);
  // Sem foto ainda: `litter_id` só existe a partir daqui. Mesma restrição que
  // já vale para logo de canil e galeria de cão.
  redirect(`/painel/canis/${kennelId}/ninhadas/${data.id}`);
}

export async function updateLitter(
  _prev: LitterFormState,
  formData: FormData,
): Promise<LitterFormState> {
  const id = String(formData.get("id") ?? "");
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!id || !kennelId) return { formError: "Ninhada não identificada." };

  await requireUser(`/painel/canis/${kennelId}/ninhadas/${id}`);
  const input = readInput(formData);

  const errors = validateLitter(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const { description } = normalizeLitterInput(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kennel_litters")
    .update({ description })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) return { formError: "Não foi possível salvar a ninhada.", values: input };

  // Zero linhas sem erro é a assinatura de RLS negando — mesmo raciocínio de
  // `updateKennel`.
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar esta ninhada.", values: input };
  }

  revalidatePath(`/painel/canis/${kennelId}`);
  revalidatePath(`/painel/canis/${kennelId}/ninhadas/${id}`);
  await revalidateKennelPublicPath(supabase, kennelId);
  return { ok: true, values: input };
}

/**
 * Exclusão LÓGICA. `kennel_litters` não concede DELETE a `authenticated` —
 * mesma invariante do resto do projeto.
 */
export async function softDeleteLitter(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!id || !kennelId) return;

  await requireUser(`/painel/canis/${kennelId}/ninhadas/${id}`);

  const supabase = await createClient();
  await supabase
    .from("kennel_litters")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  revalidatePath(`/painel/canis/${kennelId}`);
  await revalidateKennelPublicPath(supabase, kennelId);
  redirect(`/painel/canis/${kennelId}`);
}

/** O join do PostgREST vem como objeto ou array conforme a cardinalidade. */
function kennelOf<T extends { owner_id: string }>(
  k: T | T[] | null | undefined,
): T | null {
  if (!k) return null;
  return Array.isArray(k) ? (k[0] ?? null) : k;
}

function revalidateLitter(slug: string, kennelId: string, litterId: string) {
  revalidatePath(`/c/${slug}`);
  revalidatePath("/painel/canis");
  revalidatePath(`/painel/canis/${kennelId}`);
  revalidatePath(`/painel/canis/${kennelId}/ninhadas/${litterId}`);
}

/**
 * Publicar e despublicar — mesma ordem de segurança de `publishDog`/
 * `publishKennel` (mover primeiro ao publicar, despublicar primeiro ao
 * tirar do ar), com UMA diferença: a REGRA DUPLA. Ninhada só é pública se
 * ELA e o CANIL dela estiverem publicados (`kennel_litters_select`). Por
 * isso `publishLitter` só move fotos para o bucket público quando o canil
 * JÁ está publicado — senão o arquivo ficaria exposto sem nenhuma página RLS
 * deixando alguém enxergar a linha. Se o canil ainda não está publicado, a
 * ninhada é marcada como publicada mesmo assim (é a intenção do dono) e a
 * resposta avisa que falta o outro lado da regra.
 */
export async function publishLitter(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Ninhada não identificada." };

  const user = await requireUser("/painel");
  const supabase = await createClient();

  const { data: litter } = await supabase
    .from("kennel_litters")
    .select("id, kennel_id, kennels!inner(owner_id, slug, published_at)")
    .eq("id", id)
    .eq("kennels.owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  const kennel = kennelOf(litter?.kennels);
  if (!litter || !kennel) return { error: "Ninhada não encontrada." };

  if (kennel.published_at) {
    const rows = await litterMediaRows(supabase, id);
    const sync = await reconcileMediaBucket(supabase, rows, BUCKET_PUBLIC);
    if (sync.failed.length > 0) {
      return {
        error:
          "Não foi possível preparar as fotos para o acesso público. A ninhada NÃO foi publicada — tente de novo.",
      };
    }
  }

  const { data: updated, error } = await supabase
    .from("kennel_litters")
    .update({ published_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível publicar a ninhada." };
  }

  revalidateLitter(kennel.slug, litter.kennel_id, id);

  if (!kennel.published_at) {
    return {
      ok: true,
      warning:
        "A ninhada foi marcada como publicada, mas só aparece no perfil quando o canil TAMBÉM estiver publicado.",
    };
  }
  return { ok: true };
}

export async function unpublishLitter(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Ninhada não identificada." };

  const user = await requireUser("/painel");
  const supabase = await createClient();

  const { data: litter } = await supabase
    .from("kennel_litters")
    .select("id, kennel_id, kennels!inner(owner_id, slug)")
    .eq("id", id)
    .eq("kennels.owner_id", user.id)
    .maybeSingle();
  const kennel = kennelOf(litter?.kennels);
  if (!litter || !kennel) return { error: "Ninhada não encontrada." };

  // 1. Tira do ar primeiro.
  const { data: updated, error } = await supabase
    .from("kennel_litters")
    .update({ published_at: null })
    .eq("id", id)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível despublicar a ninhada." };
  }

  // 2. Purga o cache antes de mexer em arquivo.
  revalidateLitter(kennel.slug, litter.kennel_id, id);

  // 3. Devolve os arquivos ao privado.
  const rows = await litterMediaRows(supabase, id);
  const sync = await reconcileMediaBucket(supabase, rows, BUCKET_PRIVATE);

  if (sync.failed.length > 0) {
    return {
      ok: true,
      warning:
        "A ninhada saiu do ar, mas não foi possível remover as fotos do endereço público. " +
        "Quem tiver o link antigo da imagem ainda consegue abri-la. Rode a reconciliação ou tente despublicar de novo.",
    };
  }

  return { ok: true };
}

/**
 * Registra a metadata de uma foto de ninhada já enviada ao Storage pelo
 * client — mesmo papel de `registerMedia` (media/actions.ts), mas NÃO é uma
 * ramificação nova lá dentro, por um motivo estrutural: `registerMedia`
 * nunca calcula `position` (toda foto de galeria de cão nasce em 0, o
 * default da coluna); só `setDogGalleryCover` escreve posição, ao trocar a
 * capa. O teto de 4 fotos da ninhada é o índice único parcial
 * `media_litter_position_uk` em `(litter_id, position)`, e ele só barra
 * corretamente se quem grava calcular o MENOR SLOT LIVRE (1-4) ANTES do
 * INSERT — sem isso, toda foto tentaria a posição 0, que nem é válida para
 * `litter_gallery` (o CHECK exige 1-4), e o insert falharia sempre, não só
 * na 5ª foto.
 */
export async function registerLitterPhoto(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const user = await requireUser("/painel");

  const litterId = String(formData.get("entity_id") ?? "");
  const storagePath = String(formData.get("storage_path") ?? "");
  const thumbPath = String(formData.get("thumb_path") ?? "") || null;
  const width = Number(formData.get("width") ?? 0) || null;
  const height = Number(formData.get("height") ?? 0) || null;

  if (!litterId || !storagePath) return { error: "Envio incompleto." };

  const supabase = await createClient();
  const cleanup = async () => {
    const paths = [storagePath, thumbPath].filter((p): p is string => Boolean(p));
    await supabase.storage.from(BUCKET_PRIVATE).remove(paths);
  };

  // Mesma checagem de `registerMedia`: a policy do Storage já barra upload
  // fora do prefixo do próprio usuário; isto impede a METADATA apontar para
  // o arquivo de outra pessoa.
  if (!pathBelongsTo(storagePath, user.id) || (thumbPath && !pathBelongsTo(thumbPath, user.id))) {
    return { error: "Caminho de arquivo inválido." };
  }

  const litter = await getManageableLitterById(litterId, user.id);
  if (!litter) {
    await cleanup();
    return { error: "Ninhada não encontrada." };
  }

  const full = await statStorageObject(BUCKET_PRIVATE, storagePath);
  if (!full) {
    return { error: "Arquivo não encontrado no armazenamento. Tente enviar de novo." };
  }

  const check = validateStoredFile({ mime: full.mime, size: full.size });
  if (!check.ok) {
    await cleanup();
    return { error: check.reason };
  }

  const thumb = thumbPath ? await statStorageObject(BUCKET_PRIVATE, thumbPath) : null;

  const used = await getUsedBytes(user.id);
  const quota = validateQuota(used, full.size + (thumb?.size ?? 0));
  if (!quota.ok) {
    await cleanup();
    return { error: quota.reason };
  }

  // O SLOT — ver o comentário do arquivo. Laço curto com retentativa: se dois
  // uploads da mesma ninhada colidirem no mesmo slot (a fila do
  // `GalleryUploader` roda até 3 fotos ao mesmo tempo), o índice único
  // recusa o segundo com 23505, e a retentativa refaz a conta com o retrato
  // atualizado das posições — não é bug, é concorrência normal, e o mesmo
  // raciocínio de tolerância que `moveOne` (media/sync.ts) já usa.
  let mediaId: string | null = null;
  let attempts = 0;
  while (!mediaId && attempts < MAX_LITTER_PHOTOS) {
    attempts += 1;

    const usedPositions = await litterPhotoPositions(litterId);
    const slot = [1, 2, 3, 4].find((p) => !usedPositions.includes(p));
    if (!slot) {
      await cleanup();
      return { error: `A ninhada já tem o máximo de ${MAX_LITTER_PHOTOS} fotos.` };
    }

    const { data, error } = await supabase
      .from("media")
      .insert({
        bucket_id: BUCKET_PRIVATE,
        storage_path: storagePath,
        thumb_path: thumbPath,
        litter_id: litterId,
        role: "litter_gallery",
        position: slot,
        mime: full.mime,
        size_bytes: full.size,
        thumb_bytes: thumb?.size ?? null,
        width,
        height,
        owner_id: user.id,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (data) {
      mediaId = data.id;
      break;
    }

    if (error?.code !== "23505") {
      await cleanup();
      console.error(
        `[litters:registerLitterPhoto] insert falhou para litter=${litterId}:`,
        error?.code,
        error?.message,
      );
      return { error: "Não foi possível registrar a foto." };
    }
    // 23505 em media_litter_position_uk: outra foto ocupou este slot entre a
    // leitura e a gravação — tenta de novo.
  }

  if (!mediaId) {
    await cleanup();
    return { error: "Não foi possível registrar a foto — tente de novo." };
  }

  // Ver `parentPublishState` (media/actions.ts): move para o público SÓ se a
  // dupla ninhada+canil já estiver publicada — senão a foto ficaria presa no
  // privado até a próxima publicação, o mesmo bug que `registerMedia` já
  // trata do lado de canil/cão.
  const parent = await parentPublishState(supabase, "litter_gallery", litterId);
  if (targetBucketFor(parent.isPublished) === BUCKET_PUBLIC) {
    const outcome = await reconcileMediaBucket(
      supabase,
      [{ id: mediaId, bucket_id: BUCKET_PRIVATE, storage_path: storagePath, thumb_path: thumbPath }],
      BUCKET_PUBLIC,
    );
    if (outcome.failed.length > 0) {
      console.error(
        `[litters:registerLitterPhoto] falha ao mover ${mediaId} para o bucket público:`,
        outcome.failed.map((f) => f.reason).join("; "),
      );
    } else if (parent.publicPath) {
      revalidatePath(parent.publicPath);
    }
  }

  revalidatePath(`/painel/canis/${litter.kennel_id}/ninhadas/${litterId}`);
  revalidatePath(`/painel/canis/${litter.kennel_id}`);

  return { mediaId };
}
