import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

import { BUCKET_PRIVATE, isPubliclyServable, type MediaRole } from "./constraints";

/**
 * As consultas aceitam um client externo para que a página pública possa passar
 * o client ANÔNIMO — sem cookies, sem sessão. Ver src/lib/supabase/public.ts.
 */
export type SupabaseClientLike = SupabaseClient<Database>;

/** Acesso a dados de mídia. Todo `.from("media")` do app passa por aqui. */

const COLUMNS =
  "id, bucket_id, storage_path, thumb_path, kennel_id, dog_id, litter_id, role, mime, size_bytes, width, height, thumb_bytes, alt, caption, position, owner_id, created_at";

export type MediaItem = {
  id: string;
  bucket_id: string;
  storage_path: string;
  thumb_path: string | null;
  kennel_id: string | null;
  dog_id: string | null;
  litter_id: string | null;
  role: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  thumb_bytes: number | null;
  alt: string | null;
  /** Texto visível escrito pelo dono. Distinto de `alt` — ver comment da coluna. */
  caption: string | null;
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
 * Resolve URLs de exibição. ÚNICO lugar que sabe como cada bucket é servido.
 *
 * Duas ramificações:
 *
 *   público  → `getPublicUrl`: URL estável, sem token e sem expiração, servida
 *              pelo CDN. É o que torna cache e QR impresso viáveis.
 *   privado  → URL assinada de 1h, para as telas autenticadas.
 *
 * NUNCA LEVANTA. Se a resolução falhar por qualquer motivo, devolve os itens
 * com `url` e `thumbUrl` nulos e a tela renderiza placeholder. A página pública
 * não pode cair porque o Storage teve um soluço — nome, raça, registro e
 * pedigree valem mais que a foto.
 *
 * Assina em lote, não uma por vez: uma galeria de 30 fotos faria 60 chamadas.
 */
export async function resolveMediaUrls(
  items: MediaItem[],
  client?: SupabaseClientLike,
): Promise<ResolvedMedia[]> {
  if (items.length === 0) return [];

  const semUrl = (): ResolvedMedia[] => items.map((i) => ({ ...i, url: null, thumbUrl: null }));

  try {
    const supabase = client ?? (await createClient());
    const resolved = new Map<string, string>();

    const byBucket = new Map<string, string[]>();
    for (const item of items) {
      const paths = byBucket.get(item.bucket_id) ?? [];
      paths.push(item.storage_path);
      if (item.thumb_path) paths.push(item.thumb_path);
      byBucket.set(item.bucket_id, paths);
    }

    for (const [bucket, paths] of byBucket) {
      if (isPubliclyServable({ bucket_id: bucket, storage_path: "" })) {
        // Síncrono e sem rede: o CDN resolve.
        for (const path of paths) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(path);
          if (data?.publicUrl) resolved.set(`${bucket}/${path}`, data.publicUrl);
        }
        continue;
      }

      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl) resolved.set(`${bucket}/${entry.path}`, entry.signedUrl);
      }
    }

    return items.map((item) => ({
      ...item,
      url: resolved.get(`${item.bucket_id}/${item.storage_path}`) ?? null,
      thumbUrl: item.thumb_path
        ? (resolved.get(`${item.bucket_id}/${item.thumb_path}`) ?? null)
        : null,
    }));
  } catch {
    return semUrl();
  }
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

/**
 * Fotos da ninhada, ordenadas por posição — a MESMA coluna que o índice único
 * `media_litter_position_uk` usa para garantir o teto de 4. Sem `.limit`
 * explícito: o próprio banco nunca deixa passar de 4 linhas vivas.
 */
export async function getLitterGallery(litterId: string): Promise<ResolvedMedia[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media")
    .select(COLUMNS)
    .eq("litter_id", litterId)
    .eq("role", "litter_gallery")
    .is("deleted_at", null)
    .order("position", { ascending: true });

  return resolveMediaUrls((data ?? []) as MediaItem[]);
}

/**
 * A capa de cada ninhada em `litterIds` — a foto de `position = 1`, mesma
 * convenção de "capa = posição mais baixa" que a galeria do cão já usa.
 * Devolve um Map por não garantir que toda ninhada tenha foto.
 */
export async function getLitterCovers(
  litterIds: readonly string[],
): Promise<Map<string, ResolvedMedia>> {
  if (litterIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from("media")
    .select(COLUMNS)
    .in("litter_id", litterIds)
    .eq("role", "litter_gallery")
    .eq("position", 1)
    .is("deleted_at", null);

  const resolved = await resolveMediaUrls((data ?? []) as MediaItem[]);
  return new Map(resolved.filter((m) => m.litter_id).map((m) => [m.litter_id as string, m]));
}

/** As posições (1-4) já ocupadas por foto viva — usada para achar o menor slot livre. */
export async function litterPhotoPositions(litterId: string): Promise<number[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media")
    .select("position")
    .eq("litter_id", litterId)
    .eq("role", "litter_gallery")
    .is("deleted_at", null);

  return (data ?? []).map((row) => row.position);
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
