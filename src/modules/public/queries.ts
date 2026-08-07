import { cache } from "react";

import {
  decodeCursor,
  encodeCursor,
  resolveLimit,
  type Page,
  type PageParams,
} from "@/lib/pagination";
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
  "id, name, slug, city, state, description, website_url, instagram_handle, registration_number, founder_number, published_at";

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
  instagram_handle: string | null;
  registration_number: string | null;
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

/** Cães por página no perfil público. Cabe numa rolagem sem virar lista infinita. */
export const PUBLIC_DOGS_PAGE_SIZE = 24;

/**
 * Cães publicados do canil, PAGINADOS por keyset.
 *
 * Antes tinha `.limit(48)` cravado e nenhum cursor: um canil com 200 cães
 * publicados mostrava 48 e não havia como ver o resto. A invariante do projeto
 * pede "paginação E limite" — só o limite existia.
 *
 * Keyset e não OFFSET, como o resto do projeto: com OFFSET a página 10 custa 10
 * vezes a página 1, e é justamente o canil grande que sofreria.
 *
 * A ordenação `created_at desc, id desc` casa com `dogs_kennel_published_idx`,
 * que foi refeito na migration `20260804022015_perf_indexes` exatamente para
 * isto — antes o índice ordenava por `published_at` e não servia para esta
 * consulta, que levava 1,2 s com 45 mil cães.
 */
export const listPublicDogsOfKennel = cache(
  async (
    kennelId: string,
    params: PageParams = {},
  ): Promise<Page<PublicDog & { created_at: string }>> => {
    const limit = resolveLimit(params.limit ?? PUBLIC_DOGS_PAGE_SIZE);
    const cursor = decodeCursor(params.cursor);

    const supabase = createPublicClient();
    let query = supabase
      .from("dogs")
      .select(`${DOG_PUBLIC_COLUMNS}, created_at`)
      .eq("kennel_id", kennelId)
      .is("deleted_at", null)
      .not("published_at", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      // Um a mais do que o pedido: é assim que se sabe que existe próxima
      // página sem pagar um COUNT sobre o canil inteiro.
      .limit(limit + 1);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) return { items: [], nextCursor: null };

    const rows = (data ?? []) as Array<PublicDog & { created_at: string }>;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
    };
  },
);

/**
 * Número de registro APENAS. Microchip nem é lido.
 *
 * ⚠️ NÃO CHAMAR AINDA — a página pública do cão não usa esta função.
 *
 * A policy de `dog_identifiers` barra o anônimo POR COMPLETO, então o retorno é
 * sempre zero linhas. Enquanto for assim, chamar isto é uma ida ao banco por
 * regeneração de ISR que não pode dar em nada. A auditoria de performance
 * flagrou a chamada na página do cão e ela saiu.
 *
 * A função fica porque a decisão de expor número de registro publicamente está
 * em aberto com o cliente (ver supabase/README.md, "Precisa de confirmação").
 * No dia em que a policy abrir, é só voltar a chamar: a lista explícita de
 * `kind` já é a segunda camada, garantindo que microchip não vaze junto.
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
