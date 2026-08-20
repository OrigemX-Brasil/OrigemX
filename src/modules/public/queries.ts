import { cache } from "react";

import {
  decodeCursor,
  encodeCursor,
  resolveLimit,
  type Page,
  type PageParams,
} from "@/lib/pagination";
import { createPublicClient } from "@/lib/supabase/public";
import { BUCKET_PUBLIC } from "@/modules/media/constraints";
import {
  getDogCovers,
  getTestimonialAvatars,
  resolveMediaUrls,
  type MediaItem,
  type ResolvedMedia,
} from "@/modules/media/queries";

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
 * microchip, e-mail e endereço NÃO estão em nenhuma lista abaixo.
 *
 * UMA EXCEÇÃO, deliberada: `kennels.whatsapp`. É telefone, mas é o telefone
 * COMERCIAL que o dono do canil cadastra para ser encontrado — ele alimenta o
 * botão de contato da página da ninhada, e o formulário avisa na tela que o
 * campo é público. Nasce nulo: quem não preencher não expõe nada. O telefone
 * PESSOAL (`profiles.phone`) continua fora de toda lista deste arquivo, e é
 * outra coluna, em outra tabela.
 */

const KENNEL_PUBLIC_COLUMNS =
  "id, name, slug, city, state, description, website_url, instagram_handle, registration_number, founder_number, whatsapp, published_at";

const DOG_PUBLIC_COLUMNS =
  "id, public_id, slug, name, sex, born_on, breed, color, coat, titles, weight_kg, withers_height_cm, kennel_id, owner_id, sire_id, dam_id, published_at";

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
  whatsapp: string | null;
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
  titles: string[] | null;
  weight_kg: number | null;
  withers_height_cm: number | null;
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
 *
 * FILHOTE DE NINHADA FICA DE FORA (`litter_id is null`), pelo mesmo motivo de
 * `listMyDogs`: ele aparece na seção de ninhadas, com foto, sexo, status e
 * preço, e repeti-lo aqui faria o visitante ver o mesmo cão duas vezes na
 * mesma página — a segunda sem nada daquilo.
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
      .is("litter_id", null)
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
  "id, bucket_id, storage_path, thumb_path, kennel_id, dog_id, litter_id, testimonial_id, role, mime, size_bytes, width, height, thumb_bytes, alt, caption, position, owner_id, created_at";

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

export type PublicLitter = {
  id: string;
  /** Endereço da página própria da ninhada — `/n/[public_id]`. */
  public_id: string;
  description: string | null;
  born_on: string | null;
  mated_on: string | null;
  /** Ordenadas por posição (1-4). `photos[0]`, quando existe, é a capa —
   * mesma extração `[principal, ...resto]` que `/d/[public_id]` já faz para
   * o mosaico do cão. */
  photos: ResolvedMedia[];
};

/**
 * Ninhadas publicadas do canil, com TODAS as fotos vivas resolvidas (não só
 * a capa) — o modal em `KennelProfile` precisa das até 4 para navegar.
 *
 * SEM filtro explícito de `published_at` — quem decide isso é
 * `kennel_litters_select`, a REGRA DUPLA (a ninhada e o canil publicados os
 * dois). Rederivar a regra aqui em TypeScript é exatamente o tipo de
 * duplicação que diverge no primeiro ajuste; o client anônimo já só enxerga
 * o que a policy deixa passar.
 *
 * NUNCA LEVANTA, como `getPublicMedia`. Foto e descrição de ninhada são tão
 * dispensáveis quanto o resto desta página: quem escaneou o QR precisa do
 * nome, da raça e do pedigree.
 */
export const getPublicLitters = cache(async (kennelId: string): Promise<PublicLitter[]> => {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("kennel_litters")
      .select("id, public_id, description, born_on, mated_on")
      .eq("kennel_id", kennelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    const litters = data ?? [];
    if (litters.length === 0) return [];

    // Uma consulta em lote para TODAS as ninhadas da página, não uma por
    // ninhada — mesmo princípio que já evita N+1 no resto do arquivo.
    const litterIds = litters.map((l) => l.id);
    const { data: media } = await supabase
      .from("media")
      .select(MEDIA_COLUMNS)
      .in("litter_id", litterIds)
      .eq("role", "litter_gallery")
      .is("deleted_at", null)
      .order("position", { ascending: true });

    const resolved = await resolveMediaUrls((media ?? []) as MediaItem[], supabase);
    const photosByLitter = new Map<string, ResolvedMedia[]>();
    for (const item of resolved) {
      if (!item.litter_id) continue;
      const list = photosByLitter.get(item.litter_id) ?? [];
      list.push(item);
      photosByLitter.set(item.litter_id, list);
    }

    return litters.map((litter) => ({ ...litter, photos: photosByLitter.get(litter.id) ?? [] }));
  } catch {
    return [];
  }
});

export type PublicTestimonial = {
  id: string;
  author_name: string;
  text: string;
  rating: number | null;
  dog_id: string | null;
  avatar: ResolvedMedia | null;
};

/**
 * Depoimentos publicados do canil, TODOS (vinculados a um cão ou não) — a
 * página do canil é a vitrine geral. SEM filtro explícito de `published_at`:
 * quem decide é `testimonials_select`, a REGRA DUPLA (o depoimento e o canil
 * publicados os dois) — mesmo raciocínio de `getPublicLitters`.
 *
 * NUNCA LEVANTA, como o resto do arquivo.
 */
export const getPublicTestimonials = cache(
  async (kennelId: string): Promise<PublicTestimonial[]> => {
    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("testimonials")
        .select("id, author_name, text, rating, dog_id")
        .eq("kennel_id", kennelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30);

      const testimonials = data ?? [];
      if (testimonials.length === 0) return [];

      const avatars = await getTestimonialAvatars(
        testimonials.map((t) => t.id),
        supabase,
      );
      return testimonials.map((t) => ({ ...t, avatar: avatars.get(t.id) ?? null }));
    } catch {
      return [];
    }
  },
);

/**
 * Depoimentos publicados vinculados a UM cão/filhote específico — a página
 * dele mostra só os que citam aquele cão, não a vitrine inteira do canil.
 */
export const getPublicTestimonialsForDog = cache(
  async (dogId: string): Promise<PublicTestimonial[]> => {
    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("testimonials")
        .select("id, author_name, text, rating, dog_id")
        .eq("dog_id", dogId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30);

      const testimonials = data ?? [];
      if (testimonials.length === 0) return [];

      const avatars = await getTestimonialAvatars(
        testimonials.map((t) => t.id),
        supabase,
      );
      return testimonials.map((t) => ({ ...t, avatar: avatars.get(t.id) ?? null }));
    } catch {
      return [];
    }
  },
);

/**
 * O vídeo PRONTO do cão, ou `null`.
 *
 * `.eq("status", "ready")` não é redundância com a RLS — é o que separa "existe
 * uma linha" de "dá para assistir". `dog_videos_select` mostra a linha a quem
 * enxerga o cão, inclusive enquanto o Cloudflare ainda transcodifica; renderizar
 * a seção nesse estado produziria um player que não abre.
 *
 * `playback_origin` nulo faz a função devolver `null` mesmo com status `ready`.
 * O CHECK `dog_videos_ready_has_playback` já impede essa combinação no banco;
 * a guarda aqui existe porque este valor vira o `src` de um `<iframe>`, e o
 * tipo gerado do Postgres continua dizendo `string | null`.
 *
 * NUNCA LEVANTA, como `getPublicMedia`. O vídeo é o item mais dispensável desta
 * página: quem escaneou o QR na feira precisa do nome, da raça e do pedigree.
 * E note que ela NÃO fala com o Cloudflare — só com o nosso banco. É por isso
 * que o serviço de vídeo fora do ar não tem efeito nenhum aqui.
 */
export type PublicPuppy = PublicDog & {
  litter_status: string | null;
  price_brl: number | null;
};

export type PublicLitterPage = {
  id: string;
  public_id: string;
  description: string | null;
  mated_on: string | null;
  born_on: string | null;
  sire_id: string | null;
  dam_id: string | null;
  photos: ResolvedMedia[];
  kennel: PublicKennel;
};

/**
 * A ninhada por `public_id` — a rota `/n/[public_id]`.
 *
 * SEM filtro de `published_at` em lugar nenhum: a REGRA DUPLA
 * (`kennel_litters_select` exige a ninhada E o canil publicados) já decide, e o
 * client é o ANÔNIMO. Rederivar a regra aqui em TypeScript é a duplicação que
 * diverge na primeira mudança — mesmo raciocínio de `getPublicLitters`.
 *
 * DUAS CONSULTAS, não um `kennels!inner(...)` embutido — mesmo padrão de TODA
 * outra função deste arquivo (`getPublicDogById`, `getPublicKennelById`...):
 * nenhuma delas faz embed entre duas tabelas com RLS na mesma chamada, e esta
 * também não deveria ter sido a exceção. Uma consulta a mais é o preço de
 * seguir o padrão que já está provado — o embed foi tentado e produziu `null`
 * de dentro do runtime do Next mesmo com a linha comprovadamente visível ao
 * anônimo (confirmado via SQL direto e via um client REST independente, no
 * mesmo instante); não valia perseguir a causa exata dentro de uma versão do
 * Next com mudanças de cache não documentadas (ver `AGENTS.md`) quando o resto
 * do arquivo já mostra o caminho que funciona.
 *
 * NUNCA LEVANTA — devolve `null` e a rota chama `notFound()`.
 */
export const getPublicLitterByPublicId = cache(
  async (publicId: string): Promise<PublicLitterPage | null> => {
    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("kennel_litters")
        .select("id, kennel_id, public_id, description, mated_on, born_on, sire_id, dam_id")
        .eq("public_id", publicId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!data) return null;

      const { data: kennel } = await supabase
        .from("kennels")
        .select(KENNEL_PUBLIC_COLUMNS)
        .eq("id", data.kennel_id)
        .maybeSingle();

      // A REGRA DUPLA vira, na prática, "o `select` de kennels não devolveu
      // linha": `kennels_select` só entrega canil publicado ao anônimo, então
      // canil ainda em rascunho faz a ninhada inteira desaparecer aqui — sem
      // precisar checar `published_at` de novo neste arquivo.
      if (!kennel) return null;

      const { data: media } = await supabase
        .from("media")
        .select(MEDIA_COLUMNS)
        .eq("litter_id", data.id)
        .eq("role", "litter_gallery")
        .is("deleted_at", null)
        .order("position", { ascending: true });

      const photos = await resolveMediaUrls((media ?? []) as MediaItem[], supabase);

      return {
        id: data.id,
        public_id: data.public_id,
        description: data.description,
        mated_on: data.mated_on,
        born_on: data.born_on,
        sire_id: data.sire_id,
        dam_id: data.dam_id,
        photos,
        kennel: kennel as PublicKennel,
      };
    } catch {
      return null;
    }
  },
);

/**
 * Filhotes publicados da ninhada, com foto.
 *
 * `litter_status` e `price_brl` entram aqui e em nenhuma outra consulta
 * pública: são as duas colunas que só existem dentro de ninhada (CHECKs
 * `dogs_litter_status_requires_litter` e `dogs_price_requires_litter`), então
 * o único lugar que as exibe é esta página.
 */
export const getPublicLitterPuppies = cache(
  async (litterId: string): Promise<Array<PublicPuppy & { cover: ResolvedMedia | null }>> => {
    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("dogs")
        .select(`${DOG_PUBLIC_COLUMNS}, litter_status, price_brl`)
        .eq("litter_id", litterId)
        .is("deleted_at", null)
        .not("published_at", "is", null)
        .order("created_at", { ascending: true })
        .limit(30);

      const puppies = (data ?? []) as PublicPuppy[];
      if (puppies.length === 0) return [];

      const covers = await getDogCovers(
        puppies.map((p) => p.id),
        supabase,
      );
      return puppies.map((p) => ({ ...p, cover: covers.get(p.id) ?? null }));
    } catch {
      return [];
    }
  },
);

/** Os dois progenitores, com foto — o cabeçalho da página da ninhada. */
export const getPublicLitterParents = cache(
  async (
    ids: readonly (string | null)[],
  ): Promise<Map<string, PublicDog & { cover: ResolvedMedia | null }>> => {
    const found = new Map<string, PublicDog & { cover: ResolvedMedia | null }>();
    const wanted = ids.filter((id): id is string => Boolean(id));
    if (wanted.length === 0) return found;

    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("dogs")
        .select(DOG_PUBLIC_COLUMNS)
        .in("id", wanted)
        .is("deleted_at", null)
        .limit(2);

      const parents = (data ?? []) as PublicDog[];
      if (parents.length === 0) return found;

      const covers = await getDogCovers(
        parents.map((p) => p.id),
        supabase,
      );
      for (const parent of parents) {
        found.set(parent.id, { ...parent, cover: covers.get(parent.id) ?? null });
      }
    } catch {
      return found;
    }

    return found;
  },
);

export const getPublicDogVideo = cache(
  async (dogId: string): Promise<PublicDogVideo | null> => {
    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("dog_videos")
        .select("provider_uid, playback_origin, thumbnail_url, duration_seconds")
        .eq("dog_id", dogId)
        .eq("status", "ready")
        .is("deleted_at", null)
        .maybeSingle();

      if (!data?.playback_origin) return null;
      return {
        provider_uid: data.provider_uid,
        playback_origin: data.playback_origin,
        thumbnail_url: data.thumbnail_url,
        duration_seconds: data.duration_seconds,
      };
    } catch {
      return null;
    }
  },
);

export type PublicDogVideo = {
  provider_uid: string;
  playback_origin: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
};

/** `%` e `_` são curingas no LIKE; sem escapar, "100%" viraria busca aberta. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (m) => `\\${m}`);
}

const MIN_SEARCH_LENGTH = 2;

/**
 * Busca de canis por nome — lupa do cabeçalho e página `/busca`.
 *
 * Mesmo desenho de `listPublicDogsOfKennel`: keyset por `(published_at, id)`,
 * nunca OFFSET. A ordenação casa com `kennels_published_idx`, que já existe
 * para o mesmo filtro parcial (`deleted_at is null and published_at is not
 * null`); `kennels_name_trgm_idx` cobre o `ilike`. Nenhum índice novo.
 *
 * Só canil publicado: é a mesma visão que a policy `kennels_select` já dá ao
 * client anônimo, então a busca funciona igual pra visitante e pra usuário
 * logado.
 */
export const searchPublicKennels = cache(
  async (params: { q: string } & PageParams): Promise<Page<PublicKennel>> => {
    const term = params.q.trim();
    if (term.length < MIN_SEARCH_LENGTH) return { items: [], nextCursor: null };

    const limit = resolveLimit(params.limit);
    const cursor = decodeCursor(params.cursor);

    const supabase = createPublicClient();
    let query = supabase
      .from("kennels")
      .select(KENNEL_PUBLIC_COLUMNS)
      .is("deleted_at", null)
      .ilike("name", `%${escapeLike(term)}%`)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.or(
        `published_at.lt.${cursor.createdAt},and(published_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) return { items: [], nextCursor: null };

    const rows = (data ?? []) as PublicKennel[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        hasMore && last?.published_at
          ? encodeCursor({ createdAt: last.published_at, id: last.id })
          : null,
    };
  },
);

/**
 * Logo de vários canis de uma vez, para a grade de resultados de busca. Uma
 * consulta só — 24 canis na página não viram 24 idas ao Storage.
 */
export const getPublicKennelLogos = cache(
  async (kennelIds: readonly string[]): Promise<Map<string, ResolvedMedia>> => {
    if (kennelIds.length === 0) return new Map();

    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("media")
        .select(MEDIA_COLUMNS)
        .in("kennel_id", kennelIds)
        .eq("role", "kennel_logo")
        .is("deleted_at", null)
        .order("kennel_id", { ascending: true })
        .order("position", { ascending: true })
        .limit(kennelIds.length * 3);

      if (!data || data.length === 0) return new Map();

      const resolved = await resolveMediaUrls(data as MediaItem[], supabase);

      const byKennel = new Map<string, ResolvedMedia>();
      for (const item of resolved) {
        if (item.kennel_id && !byKennel.has(item.kennel_id)) byKennel.set(item.kennel_id, item);
      }
      return byKennel;
    } catch {
      return new Map();
    }
  },
);

/**
 * Cães publicados por canil, em lote — mesma lógica de `getPublicKennelLogos`,
 * pelo mesmo motivo (sem N+1 na grade de resultados).
 *
 * Sem função agregada no banco de propósito: o volume real de cães por canil
 * hoje é pequeno, e o limite defensivo abaixo cobre isso com folga. Se algum
 * canil crescer muito, isto vira uma função SQL de soma por grupo — uma troca
 * fácil de fazer quando o volume pedir, não antes.
 */
export const countPublishedDogsByKennel = cache(
  async (kennelIds: readonly string[]): Promise<Map<string, number>> => {
    if (kennelIds.length === 0) return new Map();

    const supabase = createPublicClient();
    const { data } = await supabase
      .from("dogs")
      .select("kennel_id")
      .in("kennel_id", kennelIds)
      .is("deleted_at", null)
      // Mesmo recorte de `listPublicDogsOfKennel`: este número aparece ao lado
      // do canil na busca e precisa bater com o que a página dele lista. Contar
      // filhote aqui e não listá-lo lá seria um "12 cães" que abre com 5.
      .is("litter_id", null)
      .not("published_at", "is", null)
      .limit(kennelIds.length * 200);

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      if (row.kennel_id) counts.set(row.kennel_id, (counts.get(row.kennel_id) ?? 0) + 1);
    }
    return counts;
  },
);

/**
 * Miniatura de até N ancestrais da árvore de pedigree, em lote — mesmo padrão
 * de `getPublicKennelLogos`, uma consulta para todos, nunca uma por nó.
 *
 * `dog_id` chega da RPC `dog_pedigree` (SECURITY DEFINER, ver
 * `pedigree/queries.ts`), que atravessa ramos que a RLS do client anônimo não
 * atravessaria sozinha. Devolver aqui `Map<dog_id, string>` — só a URL — e
 * NUNCA `ResolvedMedia` é deliberado: aquele tipo carrega `storage_path` (com
 * o uuid do dono embutido) e `owner_id`, que numa árvore de até 14 ancestrais
 * seriam uuids de pessoas reais passando pelo processo sem uso nenhum. Tipo
 * estreito torna o vazamento estruturalmente impossível, não só improvável.
 *
 * `.eq("bucket_id", BUCKET_PUBLIC)` tem DOIS motivos, nesta ordem de
 * importância:
 *
 *   1. Todo cão publicado tem a mídia em `kennel-media-public` — é
 *      `targetBucketFor` quem garante isso. Então, nesta página, o ramo
 *      privado de `resolveMediaUrls` só produziria `null` mesmo; o filtro
 *      tira do caminho crítico do ISR uma assinatura de URL garantidamente
 *      inútil e deixa a resolução SÍNCRONA (sem rede).
 *   2. Defesa em profundidade: o ancestral FANTASMA (sem dono, sem canil)
 *      satisfaz `dog_is_public()` mesmo sem `published_at`, e por isso passa
 *      pelo filtro de `thumbnailTargets` (`pedigree/tree.ts`) — que já é o
 *      controle primário, porque `dog_id` de ancestral restrito nunca chega
 *      até aqui. A mídia de um fantasma mora no bucket PRIVADO
 *      (`kennel-media`), que não tem policy para `anon`; sem este filtro, a
 *      linha ainda seria lida (metadado, não a imagem) por uma consulta que
 *      não precisava dela.
 *
 * NUNCA LEVANTA: foto de ancestral é o item mais dispensável do pedigree.
 */
export const getPublicDogThumbs = cache(
  async (dogIds: readonly string[]): Promise<ReadonlyMap<string, string>> => {
    if (dogIds.length === 0) return new Map();

    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("media")
        .select(MEDIA_COLUMNS)
        .in("dog_id", dogIds)
        .eq("role", "dog_gallery")
        .eq("bucket_id", BUCKET_PUBLIC)
        .is("deleted_at", null)
        .order("dog_id", { ascending: true })
        .order("position", { ascending: true })
        .limit(dogIds.length * 3);

      if (!data || data.length === 0) return new Map();

      const resolved = await resolveMediaUrls(data as MediaItem[], supabase);

      const thumbs = new Map<string, string>();
      for (const item of resolved) {
        if (item.dog_id && item.url && !thumbs.has(item.dog_id)) thumbs.set(item.dog_id, item.url);
      }
      return thumbs;
    } catch {
      return new Map();
    }
  },
);
