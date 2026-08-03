import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";
import { resolveMediaUrls, type MediaItem, type ResolvedMedia } from "@/modules/media/queries";

/**
 * ============================================================================
 * Consultas das páginas públicas. Sempre com o client ANÔNIMO.
 * ============================================================================
 *
 * Toda função aqui é envolvida em `cache()` do React, que deduplica chamadas
 * idênticas dentro do MESMO render — é o que elimina a consulta repetida entre
 * `generateMetadata` e o corpo da página.
 *
 * A colunas são listadas explicitamente, nunca `select *`. É o que garante que
 * campo sensível não vaze por descuido quando alguém adicionar uma coluna:
 * microchip, telefone, e-mail e endereço NÃO estão em nenhuma lista abaixo.
 */

const KENNEL_PUBLIC_COLUMNS =
  "id, name, slug, city, state, description, website_url, founder_number, published_at";

const DOG_PUBLIC_COLUMNS =
  "id, public_id, slug, name, sex, born_on, breed, color, coat, kennel_id, owner_id, sire_id, dam_id, published_at";

export type PublicKennel = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  description: string | null;
  website_url: string | null;
  founder_number: number | null;
  published_at: string | null;
};

export type PublicDog = {
  id: string;
  public_id: string;
  slug: string | null;
  name: string;
  sex: string;
  born_on: string | null;
  breed: string | null;
  color: string | null;
  coat: string | null;
  kennel_id: string | null;
  owner_id: string | null;
  sire_id: string | null;
  dam_id: string | null;
  published_at: string | null;
};

export const getPublicKennelBySlug = cache(async (slug: string): Promise<PublicKennel | null> => {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("kennels")
    .select(KENNEL_PUBLIC_COLUMNS)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  // A policy `kennels_select` só devolve canil publicado para quem não gerencia.
  // Como o client é anônimo, "achou" já significa "é público" — não repetimos o
  // filtro aqui, senão as duas regras divergiriam.
  return (data as PublicKennel | null) ?? null;
});

export const getPublicDogByPublicId = cache(async (publicId: string): Promise<PublicDog | null> => {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("dogs")
    .select(DOG_PUBLIC_COLUMNS)
    .eq("public_id", publicId)
    .is("deleted_at", null)
    .maybeSingle();

  return (data as PublicDog | null) ?? null;
});

export const getPublicDogById = cache(async (id: string): Promise<PublicDog | null> => {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("dogs")
    .select(DOG_PUBLIC_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return (data as PublicDog | null) ?? null;
});

export const getPublicKennelById = cache(async (id: string): Promise<PublicKennel | null> => {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("kennels")
    .select(KENNEL_PUBLIC_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return (data as PublicKennel | null) ?? null;
});

export const listPublicDogsOfKennel = cache(async (kennelId: string): Promise<PublicDog[]> => {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("dogs")
    .select(DOG_PUBLIC_COLUMNS)
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(48);

  return (data ?? []) as PublicDog[];
});

/**
 * Número de registro APENAS. Microchip nem é lido.
 *
 * A policy de `dog_identifiers` já barra o anônimo por completo, então isto
 * hoje devolve vazio — a lista explícita de `kind` é a segunda camada, para o
 * dia em que a policy for afrouxada para expor registro publicamente.
 */
export const getPublicRegistrations = cache(async (dogId: string) => {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("dog_identifiers")
    .select("id, issuer, value")
    .eq("dog_id", dogId)
    .eq("kind", "registration")
    .is("deleted_at", null)
    .limit(5);

  return data ?? [];
});

const MEDIA_COLUMNS =
  "id, bucket_id, storage_path, thumb_path, kennel_id, dog_id, role, mime, size_bytes, width, height, thumb_bytes, alt, position, owner_id, created_at";

/**
 * Mídia pública. NUNCA levanta: se falhar, a página renderiza sem imagem.
 *
 * A foto é o item mais dispensável desta página. Quem escaneou o QR na feira
 * precisa do nome, da raça, do registro e do pedigree.
 */
export const getPublicMedia = cache(
  async (filter: { kennelId?: string; dogId?: string }): Promise<ResolvedMedia[]> => {
    try {
      const supabase = createPublicClient();
      let query = supabase.from("media").select(MEDIA_COLUMNS).is("deleted_at", null);

      if (filter.kennelId) query = query.eq("kennel_id", filter.kennelId).eq("role", "kennel_logo");
      else if (filter.dogId) query = query.eq("dog_id", filter.dogId).eq("role", "dog_gallery");
      else return [];

      const { data } = await query.order("position", { ascending: true }).limit(20);
      if (!data || data.length === 0) return [];

      return await resolveMediaUrls(data as MediaItem[], supabase);
    } catch {
      return [];
    }
  },
);
