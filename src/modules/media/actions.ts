"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";

import {
  BUCKET_PRIVATE,
  MAX_GALLERY_ITEMS,
  pathBelongsTo,
  validateQuota,
  validateStoredFile,
  type MediaRole,
} from "./constraints";
import { countDogGallery, getUsedBytes, statStorageObject } from "./queries";

export type MediaActionState = {
  error?: string;
  mediaId?: string;
};

/**
 * Registra a metadata de um arquivo JÁ enviado ao Storage pelo client.
 *
 * O upload em si vai direto do navegador para o Storage, com a sessão do
 * usuário — a RLS de `storage.objects` decide se o caminho é dele. Passar o
 * binário por aqui só somaria uma cópia em memória do servidor e um limite de
 * body a estourar.
 *
 * O que este passo faz é o que o client NÃO pode fazer por si:
 *   1. conferir tamanho e mime lendo o Storage, não o que o client declarou;
 *   2. conferir a quota do usuário;
 *   3. gravar a metadata sob RLS.
 *
 * Se qualquer checagem falhar, o arquivo órfão é removido — deixá-lo consumiria
 * plano sem nunca aparecer em tela.
 */
export async function registerMedia(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const user = await requireUser("/painel");

  const role = String(formData.get("role") ?? "") as MediaRole;
  const entityId = String(formData.get("entity_id") ?? "");
  const storagePath = String(formData.get("storage_path") ?? "");
  const thumbPath = String(formData.get("thumb_path") ?? "") || null;
  const width = Number(formData.get("width") ?? 0) || null;
  const height = Number(formData.get("height") ?? 0) || null;
  const alt = String(formData.get("alt") ?? "").trim() || null;

  if (role !== "kennel_logo" && role !== "dog_gallery") return { error: "Tipo de mídia inválido." };
  if (!entityId || !storagePath) return { error: "Envio incompleto." };

  const supabase = await createClient();
  const cleanup = async () => {
    const paths = [storagePath, thumbPath].filter((p): p is string => Boolean(p));
    await supabase.storage.from(BUCKET_PRIVATE).remove(paths);
  };

  // O caminho tem de começar pelo uid. A policy do Storage já barra o upload
  // fora do prefixo, mas esta linha impede que a METADATA aponte para o
  // arquivo de outra pessoa.
  if (!pathBelongsTo(storagePath, user.id) || (thumbPath && !pathBelongsTo(thumbPath, user.id))) {
    return { error: "Caminho de arquivo inválido." };
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

  if (role === "dog_gallery") {
    const current = await countDogGallery(entityId);
    if (current >= MAX_GALLERY_ITEMS) {
      await cleanup();
      return { error: `A galeria aceita no máximo ${MAX_GALLERY_ITEMS} imagens.` };
    }
  }

  // Logo é 1:1. O antigo sai antes do novo entrar, senão o índice único
  // parcial recusa a inserção.
  if (role === "kennel_logo") {
    await supabase
      .from("media")
      .update({ deleted_at: new Date().toISOString() })
      .eq("kennel_id", entityId)
      .eq("role", "kennel_logo")
      .is("deleted_at", null);
  }

  const { data, error } = await supabase
    .from("media")
    .insert({
      bucket_id: BUCKET_PRIVATE,
      storage_path: storagePath,
      thumb_path: thumbPath,
      kennel_id: role === "kennel_logo" ? entityId : null,
      dog_id: role === "dog_gallery" ? entityId : null,
      role,
      mime: full.mime,
      size_bytes: full.size,
      thumb_bytes: thumb?.size ?? null,
      width,
      height,
      alt,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    await cleanup();
    return { error: "Não foi possível registrar a imagem." };
  }

  if (role === "kennel_logo") {
    revalidatePath(`/painel/canis/${entityId}`);
    revalidatePath("/painel/canis");
  } else {
    revalidatePath(`/painel/caes/${entityId}`);
  }

  return { mediaId: data.id };
}

/**
 * Remove uma imagem.
 *
 * A LINHA sai por exclusão lógica, como toda tabela do projeto. O ARQUIVO é
 * apagado de verdade: ele não é registro histórico, é conteúdo substituível, e
 * mantê-lo consumiria plano para sempre sem aparecer em lugar nenhum.
 */
export async function deleteMedia(formData: FormData): Promise<void> {
  const user = await requireUser("/painel");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();

  const { data } = await supabase
    .from("media")
    .select("id, bucket_id, storage_path, thumb_path, kennel_id, dog_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return;

  const { data: updated } = await supabase
    .from("media")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  // Só apaga o arquivo se a linha realmente saiu. Na ordem inversa, uma RLS
  // negando deixaria o registro apontando para um arquivo que não existe mais.
  if (updated && updated.length > 0) {
    const paths = [data.storage_path, data.thumb_path].filter((p): p is string => Boolean(p));
    await supabase.storage.from(data.bucket_id).remove(paths);
  }

  if (data.kennel_id) {
    revalidatePath(`/painel/canis/${data.kennel_id}`);
    revalidatePath("/painel/canis");
  }
  if (data.dog_id) revalidatePath(`/painel/caes/${data.dog_id}`);
}
