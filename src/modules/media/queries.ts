import { createClient } from "@/lib/supabase/server";

import { BUCKET_PRIVATE, type MediaRole } from "./constraints";

/** Acesso a dados de mídia. Todo `.from("media")` do app passa por aqui. */

const COLUMNS =
  "id, bucket_id, storage_path, thumb_path, kennel_id, dog_id, role, mime, size_bytes, width, height, thumb_bytes, alt, position, owner_id, created_at";

export type MediaItem = {
  id: string;
  bucket_id: string;
  storage_path: string;
  thumb_path: string | null;
  kennel_id: string | null;
  dog_id: string | null;
  role: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  thumb_bytes: number | null;
  alt: string | null;
  position: number;
  owner_id: string;
  created_at: string;
};

/** Assinatura curta para tela autenticada. Perfil público terá outro caminho. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type ResolvedMedia = MediaItem & {
  url: string | null;
  thumbUrl: string | null;
};

/**
 * Resolve URLs de exibição.
 *
 * Hoje o bucket é privado, então a entrega usa URL assinada. Este é o ÚNICO
 * lugar que sabe disso: quando a mídia publicada migrar para bucket público ou
 * para uma rota de proxy com cache, muda aqui e nenhuma tela é tocada.
 *
 * Assina em lote, não uma por vez — uma galeria de 12 fotos faria 24 chamadas.
 */
export async function resolveMediaUrls(items: MediaItem[]): Promise<ResolvedMedia[]> {
  if (items.length === 0) return [];

  const supabase = await createClient();
  const byBucket = new Map<string, string[]>();

  for (const item of items) {
    const paths = byBucket.get(item.bucket_id) ?? [];
    paths.push(item.storage_path);
    if (item.thumb_path) paths.push(item.thumb_path);
    byBucket.set(item.bucket_id, paths);
  }

  const signed = new Map<string, string>();
  for (const [bucket, paths] of byBucket) {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) signed.set(`${bucket}/${entry.path}`, entry.signedUrl);
    }
  }

  return items.map((item) => ({
    ...item,
    url: signed.get(`${item.bucket_id}/${item.storage_path}`) ?? null,
    thumbUrl: item.thumb_path ? (signed.get(`${item.bucket_id}/${item.thumb_path}`) ?? null) : null,
  }));
}

export async function getKennelLogo(kennelId: string): Promise<ResolvedMedia | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media")
    .select(COLUMNS)
    .eq("kennel_id", kennelId)
    .eq("role", "kennel_logo")
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  const [resolved] = await resolveMediaUrls([data as MediaItem]);
  return resolved ?? null;
}

export async function getDogGallery(dogId: string): Promise<ResolvedMedia[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media")
    .select(COLUMNS)
    .eq("dog_id", dogId)
    .eq("role", "dog_gallery")
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(50);

  return resolveMediaUrls((data ?? []) as MediaItem[]);
}

export async function countDogGallery(dogId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("media")
    .select("id", { count: "exact", head: true })
    .eq("dog_id", dogId)
    .eq("role", "dog_gallery")
    .is("deleted_at", null);

  return count ?? 0;
}

/** Bytes já ocupados pelo usuário. Alimenta a checagem de quota. */
export async function getUsedBytes(ownerId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("media_used_bytes", { p_owner_id: ownerId });
  return typeof data === "number" ? data : 0;
}

/**
 * O que o Storage REALMENTE tem naquele caminho.
 *
 * O servidor não pode acreditar no tamanho e no mime que o client declara —
 * ele é a parte não confiável desta transação. Isto lê do próprio Storage.
 */
export async function statStorageObject(
  bucket: string,
  storagePath: string,
): Promise<{ size: number; mime: string } | null> {
  const supabase = await createClient();

  const slash = storagePath.lastIndexOf("/");
  const folder = slash === -1 ? "" : storagePath.slice(0, slash);
  const name = slash === -1 ? storagePath : storagePath.slice(slash + 1);

  const { data } = await supabase.storage.from(bucket).list(folder, { search: name, limit: 100 });
  const entry = data?.find((f) => f.name === name);
  if (!entry?.metadata) return null;

  const meta = entry.metadata as { size?: number; mimetype?: string };
  if (typeof meta.size !== "number" || typeof meta.mimetype !== "string") return null;

  return { size: meta.size, mime: meta.mimetype };
}

export { BUCKET_PRIVATE };
export type { MediaRole };
