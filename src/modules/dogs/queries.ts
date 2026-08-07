import {
  decodeCursor,
  encodeCursor,
  resolveLimit,
  type Page,
  type PageParams,
} from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

import {
  isSearchable,
  normalizeSearchTerm,
  rankCandidates,
  SLOT_SEX,
  type AncestorCandidate,
  type ParentSlot,
} from "./ancestors";

/**
 * Acesso a dados de cão. Todo `.from("dogs")` do app passa por aqui.
 * Filtro é para a consulta estar certa; quem protege é a RLS.
 */

const LIST_COLUMNS =
  "id, public_id, slug, name, sex, born_on, breed, color, coat, kennel_id, owner_id, sire_id, dam_id, published_at, created_at, updated_at";

export type DogListItem = {
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
  created_at: string;
  updated_at: string;
};

export type DogListFilters = {
  kennelId?: string | null;
  search?: string | null;
};

/**
 * Cães do usuário, paginados, com busca por nome e filtro por canil.
 *
 * `created_by` além de `owner_id`: o criador precisa reencontrar o ancestral
 * fantasma que cadastrou, e fantasma não tem dono por definição. Sem isso ele
 * cria o mesmo ancestral de novo — o duplicado que este módulo existe para
 * evitar.
 */
export async function listMyDogs(
  userId: string,
  filters: DogListFilters = {},
  params: PageParams = {},
): Promise<Page<DogListItem>> {
  const limit = resolveLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  const supabase = await createClient();
  let query = supabase
    .from("dogs")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .or(`owner_id.eq.${userId},created_by.eq.${userId}`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (filters.kennelId) query = query.eq("kennel_id", filters.kennelId);

  // Busca por nome usa o índice GIN trigram criado na migration do núcleo.
  if (filters.search && isSearchable(filters.search)) {
    query = query.ilike("name", `%${escapeLike(filters.search.trim())}%`);
  }

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return { items: [], nextCursor: null };

  const rows = (data ?? []) as DogListItem[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

/** `%` e `_` são curingas no LIKE; sem escapar, "100%" viraria busca aberta. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (m) => `\\${m}`);
}

export async function getDogById(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dogs")
    .select(`${LIST_COLUMNS}, created_by, deleted_at`)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return data;
}

/**
 * O cão, só se este usuário puder GERENCIÁ-LO.
 *
 * `getDogById` não serve para a tela de edição, e isso não era óbvio: a policy
 * `dogs_select` devolve também cão PUBLICADO de terceiro, porque o perfil
 * público é aberto. A tela do painel usava aquela função e, para um cão
 * publicado de outra pessoa, montava o formulário de edição inteiro — com
 * galeria, botão de publicar e botão de excluir.
 *
 * Nada era gravado de fato: a policy de UPDATE recusava e o `delete` não tem
 * grant para ninguém. Mas oferecer o controle é errado por si só — o usuário
 * clica, não acontece nada, e ele não entende se o produto quebrou ou se aquilo
 * não era dele. Achado pelo teste E2E de isolamento.
 *
 * O critério espelha `private.can_manage_dog` no banco: dono, quem cadastrou,
 * ou dono do canil onde o cão está.
 */
export async function getManageableDogById(id: string, userId: string) {
  const dog = await getDogById(id);
  if (!dog) return null;

  if (dog.owner_id === userId || dog.created_by === userId) return dog;

  // Dono do canil gerencia o que está nele, mesmo sem ser dono do animal.
  // Filtra por `owner_id` na consulta, e não depois: `getKennelById` também
  // devolveria canil publicado de terceiro.
  if (dog.kennel_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("kennels")
      .select("id")
      .eq("id", dog.kennel_id)
      .eq("owner_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (data) return dog;
  }

  return null;
}

export type DogIdentifiers = {
  registration: { id: string; value: string; issuer: string | null } | null;
  microchip: { id: string; value: string } | null;
};

/**
 * RG e microchip PRINCIPAIS do cão, para a tela de edição.
 *
 * Filtra por `is_primary`: o schema permite mais de um identificador do mesmo
 * tipo (cão rechipado, reregistrado), mas esta tela só gerencia o principal de
 * cada tipo — o resto do histórico, se um dia existir tela para isso, não
 * desaparece, só não é tocado aqui.
 *
 * Nunca chamar isto a partir de um client anônimo: a tabela não tem grant
 * nenhum para `anon`, então nem chegaria a ler — mas a intenção é que este
 * dado não circule fora do painel do dono.
 */
export async function getDogIdentifiers(dogId: string): Promise<DogIdentifiers> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dog_identifiers")
    .select("id, kind, issuer, value")
    .eq("dog_id", dogId)
    .eq("is_primary", true)
    .is("deleted_at", null)
    .limit(2);

  const rows = data ?? [];
  const registration = rows.find((r) => r.kind === "registration");
  const microchip = rows.find((r) => r.kind === "microchip");

  return {
    registration: registration
      ? { id: registration.id, value: registration.value, issuer: registration.issuer }
      : null,
    microchip: microchip ? { id: microchip.id, value: microchip.value } : null,
  };
}

/**
 * Vários cães de uma vez — usado para mostrar pai e mãe já selecionados.
 *
 * O teto existe mesmo o único chamador passando dois ids. Sem ele a função é
 * segura só por sorte do chamador, e o próximo que passar uma lista grande não
 * encontra limite nenhum — que é exatamente como a invariante de "nenhuma
 * listagem sem limite" costuma ser furada.
 */
const BY_IDS_LIMIT = 100;

export async function getDogsByIds(ids: readonly string[]): Promise<DogListItem[]> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, BY_IDS_LIMIT);
  if (unique.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("dogs")
    .select(LIST_COLUMNS)
    .in("id", unique)
    .is("deleted_at", null)
    .limit(BY_IDS_LIMIT);

  return (data ?? []) as DogListItem[];
}

/**
 * Descendentes do cão, em qualquer profundidade.
 *
 * Vem da função `dog_descendant_ids` porque percorrer a árvore com PostgREST
 * custaria uma consulta por geração.
 */
export async function getDescendantIds(dogId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dog_descendant_ids", { p_dog_id: dogId });
  if (error || !data) return new Set();
  return new Set(data as string[]);
}

export type AncestorSearchResult = {
  candidates: AncestorCandidate[];
  truncated: boolean;
};

const CANDIDATE_LIMIT = 20;

/**
 * Candidatos a progenitor.
 *
 * Filtra por sexo no BANCO — metade dos cães nunca serve para a posição, e
 * trazê-los para descartar no cliente desperdiça a consulta. O ranking fino
 * fica em `rankCandidates`, que é puro e testado.
 *
 * Busca em toda a base, não só nos cães do usuário: reaproveitar o ancestral
 * que outro criador já cadastrou é exatamente o ponto. A RLS decide o que fica
 * visível — publicado, ou fantasma, ou do próprio usuário.
 */
export async function searchAncestorCandidates(
  rawTerm: string,
  slot: ParentSlot,
): Promise<AncestorSearchResult> {
  if (!isSearchable(rawTerm)) return { candidates: [], truncated: false };

  const term = rawTerm.trim();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dogs")
    .select("id, name, sex, born_on, breed, kennel_id, owner_id, kennels(name)")
    .eq("sex", SLOT_SEX[slot])
    .is("deleted_at", null)
    .ilike("name", `%${escapeLike(term)}%`)
    .limit(CANDIDATE_LIMIT + 1);

  if (error || !data) return { candidates: [], truncated: false };

  const mapped: AncestorCandidate[] = data.map((row) => {
    const kennel = row.kennels as { name: string } | { name: string }[] | null;
    const kennelName = Array.isArray(kennel) ? (kennel[0]?.name ?? null) : (kennel?.name ?? null);
    return {
      id: row.id,
      name: row.name,
      sex: row.sex as "male" | "female",
      born_on: row.born_on,
      breed: row.breed,
      kennel_id: row.kennel_id,
      owner_id: row.owner_id,
      kennel_name: kennelName,
    };
  });

  const truncated = mapped.length > CANDIDATE_LIMIT;
  const ranked = rankCandidates(mapped, normalizeSearchTerm(term)).slice(0, CANDIDATE_LIMIT);

  return { candidates: ranked, truncated };
}
