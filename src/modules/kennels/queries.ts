import { createClient } from "@/lib/supabase/server";
import {
  decodeCursor,
  encodeCursor,
  resolveLimit,
  type Page,
  type PageParams,
} from "@/lib/pagination";

/**
 * Acesso a dados de canil. Todo `.from("kennels")` do app passa por aqui.
 *
 * Os filtros abaixo são para a CONSULTA estar certa, não para proteger: quem
 * decide o que cada um enxerga é a RLS. Ver src/modules/README.md.
 */

const LIST_COLUMNS =
  "id, name, slug, city, state, description, logo_url, website_url, published_at, founder_number, created_at, updated_at";

export type KennelListItem = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  published_at: string | null;
  /** Selo Criador Fundador, 1 a 100. NULL quando não há selo. */
  founder_number: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Canis do usuário da sessão, paginados por keyset.
 *
 * Filtra por `owner_id` de propósito, mesmo com RLS: a policy de leitura também
 * libera canil publicado de terceiro, porque o diretório é público. Sem este
 * filtro, o painel do criador listaria a plataforma inteira.
 */
export async function listMyKennels(
  ownerId: string,
  params: PageParams = {},
): Promise<Page<KennelListItem>> {
  const limit = resolveLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  const supabase = await createClient();
  let query = supabase
    .from("kennels")
    .select(LIST_COLUMNS)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    // Um a mais do que o pedido: é assim que se sabe que existe próxima página
    // sem pagar um COUNT, que varreria a tabela toda.
    .limit(limit + 1);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return { items: [], nextCursor: null };

  const rows = (data ?? []) as KennelListItem[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

/** Canil por id, para a tela de edição. A RLS barra o que não é do usuário. */
export async function getKennelById(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennels")
    .select(`${LIST_COLUMNS}, owner_id, deleted_at`)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return data;
}

/** Canil por slug, para o perfil público. Abre sem sessão. */
export async function getKennelBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennels")
    .select(LIST_COLUMNS)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  return data;
}

/** Quantos cães o canil tem. Alimenta o critério do selo na tela. */
export async function countKennelDogs(kennelId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("dogs")
    .select("id", { count: "exact", head: true })
    .eq("kennel_id", kennelId)
    .is("deleted_at", null);

  return count ?? 0;
}

/** Cães publicados do canil, para o perfil público. */
export async function listPublishedDogs(kennelId: string, limit = 24) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dogs")
    .select("id, public_id, slug, name, sex, born_on, breed")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

/**
 * Se o slug já está em uso. Consulta antes de gravar só para dar mensagem
 * decente — quem garante a unicidade é o índice único, e ele cobre a corrida
 * entre duas gravações simultâneas que esta checagem não cobre.
 */
export async function isSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase.from("kennels").select("id").eq("slug", slug).limit(1);
  if (exceptId) query = query.neq("id", exceptId);

  const { data } = await query;
  return (data?.length ?? 0) > 0;
}
