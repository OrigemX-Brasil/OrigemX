"use client";

import { createClient } from "@/lib/supabase/client";

import { registerMedia } from "./actions";
import {
  BUCKET_PRIVATE,
  buildStoragePath,
  buildThumbPath,
  extensionForMime,
  validateInputFile,
  type MediaRole,
} from "./constraints";
import { compressImage } from "./resize";

/**
 * ============================================================================
 * Os três passos que todo upload de imagem segue, extraídos para reúso.
 * ============================================================================
 *
 * `image-uploader.tsx` (logo do canil, 1:1, sem seleção múltipla) tem a
 * própria cópia desta sequência e não foi tocado — está fora do que este
 * ajuste pediu. Esta função é usada pelo upload em lote da galeria do cão.
 *
 *   1. comprimir NO CLIENT — decide se o plano de armazenamento dura;
 *   2. subir os dois blobs no bucket privado, com a sessão do usuário;
 *   3. registrar a metadata numa Server Action, que reconfere tamanho e mime
 *      lendo o Storage — nunca acreditando no que o client afirma.
 *
 * O binário nunca vira base64 e nunca passa pelo servidor Next: sempre Blob,
 * do navegador direto ao Storage.
 */

export type UploadOneParams = {
  file: File;
  role: MediaRole;
  entityId: string;
  ownerId: string;
  onStatus?: (status: string) => void;
};

export type UploadOneResult = { ok: true; mediaId: string } | { ok: false; error: string };

export async function uploadOneImage({
  file,
  role,
  entityId,
  ownerId,
  onStatus,
}: UploadOneParams): Promise<UploadOneResult> {
  const check = validateInputFile(file);
  if (!check.ok) return { ok: false, error: check.reason };

  onStatus?.("Comprimindo…");

  let compressed;
  try {
    compressed = await compressImage(file);
  } catch {
    return { ok: false, error: "Não foi possível processar esta imagem. Tente outro arquivo." };
  }

  const { full, thumb } = compressed;
  const extension = extensionForMime(full.mime);
  const fileId = crypto.randomUUID();
  const storagePath = buildStoragePath({ ownerId, role, entityId, fileId, extension });
  const thumbPath = buildThumbPath(storagePath);

  onStatus?.("Enviando…");

  const supabase = createClient();
  const upload = async (path: string, blob: Blob) =>
    supabase.storage.from(BUCKET_PRIVATE).upload(path, blob, {
      contentType: full.mime,
      // Caminho carrega uuid, nunca colide — sobrescrever silencioso
      // esconderia um bug de geração de id.
      upsert: false,
      // 1 hora, não "imutável": o CONTEÚDO nunca muda, mas a AUTORIZAÇÃO para
      // vê-lo muda ao despublicar. Ver image-uploader.tsx para o raciocínio
      // completo — a mesma regra vale aqui, sem repetir a explicação toda.
      cacheControl: "3600",
    });

  const [fullUp, thumbUp] = await Promise.all([
    upload(storagePath, full.blob),
    upload(thumbPath, thumb.blob),
  ]);

  if (fullUp.error || thumbUp.error) {
    // Não deixa metade subida ocupando plano.
    await supabase.storage.from(BUCKET_PRIVATE).remove([storagePath, thumbPath]);
    return { ok: false, error: "Falha no envio. Verifique a conexão e tente de novo." };
  }

  onStatus?.("Registrando…");

  const fd = new FormData();
  fd.set("role", role);
  fd.set("entity_id", entityId);
  fd.set("storage_path", storagePath);
  fd.set("thumb_path", thumbPath);
  fd.set("width", String(full.width));
  fd.set("height", String(full.height));

  const result = await registerMedia({}, fd);
  if (result.error || !result.mediaId) {
    return { ok: false, error: result.error ?? "Não foi possível registrar a imagem." };
  }

  return { ok: true, mediaId: result.mediaId };
}
