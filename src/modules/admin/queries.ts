import {
  decodeCursor,
  encodeCursor,
  resolveLimit,
  type Page,
  type PageParams,
} from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import {
  rollupBySource,
  totals,
  type CaptureTotals,
  type SourceRollup,
} from "@/modules/capture/events";

import { endOfDaySaoPaulo, startOfDaySaoPaulo } from "./format";
import type { FunnelCounts } from "./funnel";

/**
 * Acesso a dados do painel administrativo. Todo `.from()` cross-usuário do
 * app passa por aqui — é o primeiro módulo do projeto que lista fora do
 * escopo "meu" ou "público".
 *
 * NENHUMA consulta aqui usa a chave secreta. A RLS já libera uma sessão
 * admin para ler qualquer linha de `profiles`, `kennels` e `dogs` (ramo
 * `or private.is_admin()` nas três policies de SELECT), então o
 * `createClient()` de sempre basta — autorização continua decidida no
 * banco, não aqui. Ver src/modules/README.md.
 *
 * Filtro é para a consulta estar certa; quem protege é a RLS.
 */

const MIN_SEARCH_LENGTH = 2;

/** `%` e `_` são curingas no LIKE; sem escapar, "100%" viraria busca aberta. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (m) => `\\${m}`);
}

function isSearchable(term: string | null | undefined): term is string {
  return typeof term === "string" && term.trim().length >= MIN_SEARCH_LENGTH;
}

// -----------------------------------------------------------------------------
// Contagens — Visão geral. count:'exact', head:true, mesmo padrão de
// countKennelDogs em kennels/queries.ts: sem baixar linha nenhuma.
// -----------------------------------------------------------------------------

export async function countProfiles(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  return count ?? 0;
}

export async function countSuspendedProfiles(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("suspended_at", "is", null);
  return count ?? 0;
}

export async function countKennels(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("kennels")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  return count ?? 0;
}

export async function countPublishedKennels(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("kennels")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .not("published_at", "is", null);
  return count ?? 0;
}

export async function countHiddenKennels(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("kennels")
    .select("id", { count: "exact", head: true })
    .not("hidden_at", "is", null);
  return count ?? 0;
}

export async function countFounderKennels(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("kennels")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .not("founder_number", "is", null);
  return count ?? 0;
}

export async function countDogs(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("dogs")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  return count ?? 0;
}

export async function countHiddenDogs(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("dogs")
    .select("id", { count: "exact", head: true })
    .not("hidden_at", "is", null);
  return count ?? 0;
}

// -----------------------------------------------------------------------------
// Usuários
// -----------------------------------------------------------------------------

const PROFILE_LIST_COLUMNS =
  "id, full_name, role, city, state, suspended_at, deleted_at, created_at";

export type ProfileListItem = {
  id: string;
  full_name: string | null;
  role: string;
  city: string | null;
  state: string | null;
  suspended_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

/** Perfil único, para a tela de detalhe. */
export async function getProfileById(id: string): Promise<ProfileListItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_LIST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data;
}

/**
 * E-mail do usuário, só na tela de detalhe — `profiles` não tem a coluna.
 * `null` de volta é "sem permissão OU sem e-mail"; a função no banco distingue
 * os dois casos (levanta em vez de devolver null para "sem permissão"), então
 * um `null` aqui só acontece se a chamada em si falhar de um jeito inesperado
 * — não deveria, já que o layout de `/admin` já garante sessão admin.
 */
export async function getProfileEmail(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_profile_email", { p_profile_id: id });
  if (error) return null;
  return data;
}

/** Quantos canis o usuário tem — mesmo `count:'exact', head:true` de sempre. */
export async function countKennelsByOwner(id: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("kennels")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", id)
    .is("deleted_at", null);
  return count ?? 0;
}

export async function countDogsByOwner(id: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("dogs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", id)
    .is("deleted_at", null);
  return count ?? 0;
}

export async function listProfiles(
  filters: { search?: string | null } = {},
  params: PageParams = {},
): Promise<Page<ProfileListItem>> {
  const limit = resolveLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  const supabase = await createClient();
  // SEM `.is("deleted_at", null)`: mesma decisão de Canis e Cães — admin
  // enxerga excluído logicamente também, e `private.is_admin()` já libera
  // isso na policy `profiles_select_public`.
  let query = supabase
    .from("profiles")
    .select(PROFILE_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (isSearchable(filters.search)) {
    query = query.ilike("full_name", `%${escapeLike(filters.search.trim())}%`);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return { items: [], nextCursor: null };

  const rows = (data ?? []) as ProfileListItem[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

// -----------------------------------------------------------------------------
// Canis
// -----------------------------------------------------------------------------

const KENNEL_LIST_COLUMNS =
  "id, name, slug, city, state, founder_number, published_at, hidden_at, deleted_at, created_at, owner:profiles!kennels_owner_id_fkey(full_name)";

/**
 * `owner` vem embutido pela FK do PostgREST — técnica já usada em
 * `dogs/queries.ts::searchAncestorCandidates` (lá para `kennels(name)`).
 * NOVO aqui é a DESAMBIGUAÇÃO: `kennels` tem DUAS FKs para `profiles`
 * (`owner_id` e `created_by`), então o nome da constraint é obrigatório —
 * sem ele o PostgREST recusa com erro claro de ambiguidade, não falha em
 * silêncio. `profiles_select_public` já libera a leitura do dono para
 * sessão admin, então o embutido não precisa de nada além da RLS de sempre.
 */
export type KennelListItem = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  founder_number: number | null;
  published_at: string | null;
  hidden_at: string | null;
  deleted_at: string | null;
  created_at: string;
  owner: { full_name: string | null } | { full_name: string | null }[] | null;
};

export async function listKennels(
  filters: { search?: string | null; onlyFounders?: boolean } = {},
  params: PageParams = {},
): Promise<Page<KennelListItem>> {
  const limit = resolveLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  const supabase = await createClient();
  let query = supabase
    .from("kennels")
    .select(KENNEL_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  // SEM `.is("deleted_at", null)`: o admin precisa enxergar o excluído
  // também — é o oposto das listagens de dono, que existem para
  // fazer, e é o próprio ponto da tela.
  if (filters.onlyFounders) {
    query = query.not("founder_number", "is", null);
  }
  if (isSearchable(filters.search)) {
    query = query.ilike("name", `%${escapeLike(filters.search.trim())}%`);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return { items: [], nextCursor: null };

  const rows = (data ?? []) as unknown as KennelListItem[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

/** `owner` embutido vem como objeto OU array de um item, a depender de como
 * o PostgREST infere a cardinalidade — trata os dois formatos igual. */
export function ownerName(owner: KennelListItem["owner"] | DogListItem["owner"]): string | null {
  const row = Array.isArray(owner) ? owner[0] : owner;
  return row?.full_name ?? null;
}

const KENNEL_DETAIL_COLUMNS =
  "id, name, slug, city, state, description, logo_url, website_url, instagram_handle, registration_number, founder_number, published_at, hidden_at, deleted_at, owner_id, created_at, owner:profiles!kennels_owner_id_fkey(full_name)";

export type KennelDetail = KennelListItem & {
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  instagram_handle: string | null;
  registration_number: string | null;
  owner_id: string;
};

/**
 * Canil único, para a "visão do admin" — sem `.is("deleted_at", null)`,
 * mesma decisão de `listKennels`: o admin precisa enxergar o excluído
 * também, e a RLS já libera pelo ramo `private.is_admin()`.
 *
 * NÃO é `getManageableKennelById` (dono-only, devolveria `null` aqui) nem
 * `getKennelById` (esconde excluído) — o mesmo tipo de engano que o bug de
 * `getDogById` já ensinou, só que invertido: usar o getter errado esconde
 * do admin exatamente o que ele precisa ver.
 */
export async function getAdminKennelById(id: string): Promise<KennelDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennels")
    .select(KENNEL_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data as unknown as KennelDetail | null;
}

const DOG_DETAIL_COLUMNS =
  "id, public_id, slug, name, sex, born_on, breed, color, coat, kennel_id, owner_id, sire_id, dam_id, published_at, hidden_at, deleted_at, created_at, kennel:kennels(name), owner:profiles!dogs_owner_id_fkey(full_name)";

export type DogDetail = DogListItem & {
  slug: string | null;
  born_on: string | null;
  color: string | null;
  coat: string | null;
  sire_id: string | null;
  dam_id: string | null;
};

/** Cão único, para a "visão do admin" — mesma decisão de `getAdminKennelById`. */
export async function getAdminDogById(id: string): Promise<DogDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dogs")
    .select(DOG_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data as unknown as DogDetail | null;
}

// -----------------------------------------------------------------------------
// Cães
// -----------------------------------------------------------------------------

const DOG_LIST_COLUMNS =
  "id, public_id, name, sex, breed, kennel_id, owner_id, published_at, hidden_at, deleted_at, created_at, kennel:kennels(name), owner:profiles!dogs_owner_id_fkey(full_name)";

export type DogListItem = {
  id: string;
  public_id: string;
  name: string;
  sex: string;
  breed: string | null;
  kennel_id: string | null;
  owner_id: string | null;
  published_at: string | null;
  hidden_at: string | null;
  deleted_at: string | null;
  created_at: string;
  kennel: { name: string } | { name: string }[] | null;
  owner: { full_name: string | null } | { full_name: string | null }[] | null;
};

export async function listDogs(
  filters: { search?: string | null } = {},
  params: PageParams = {},
): Promise<Page<DogListItem>> {
  const limit = resolveLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  const supabase = await createClient();
  let query = supabase
    .from("dogs")
    .select(DOG_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (isSearchable(filters.search)) {
    query = query.ilike("name", `%${escapeLike(filters.search.trim())}%`);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return { items: [], nextCursor: null };

  const rows = (data ?? []) as unknown as DogListItem[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

export function kennelName(kennel: DogListItem["kennel"]): string | null {
  const row = Array.isArray(kennel) ? kennel[0] : kennel;
  return row?.name ?? null;
}

// -----------------------------------------------------------------------------
// Histórico (audit_log)
// -----------------------------------------------------------------------------

const AUDIT_LOG_COLUMNS =
  "id, action, entity_type, entity_id, reason, details, created_at, actor:profiles!audit_log_actor_id_fkey(full_name)";

export type AuditLogItem = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  details: unknown;
  created_at: string;
  actor: { full_name: string | null } | { full_name: string | null }[] | null;
};

export function actorName(actor: AuditLogItem["actor"]): string | null {
  const row = Array.isArray(actor) ? actor[0] : actor;
  return row?.full_name ?? null;
}

/**
 * `audit_log.id` é `bigint` — todo outro cursor deste projeto nasce de uuid.
 * `String(row.id)` entra no cursor igual, e o filtro final (`id.lt.123`) é
 * texto que o PostgREST converte para o tipo real da coluna. Verificado, não
 * só suposto: exercitado pela suíte de verificação deste módulo.
 *
 * `dateFrom`/`dateTo` chegam como `YYYY-MM-DD` (valor cru de `<input
 * type="date">`) e viram fronteira de dia em America/Sao_Paulo via
 * `startOfDaySaoPaulo`/`endOfDaySaoPaulo` — não são comparados como texto.
 */
export async function listAuditLog(
  filters: { action?: string | null; dateFrom?: string | null; dateTo?: string | null } = {},
  params: PageParams = {},
): Promise<Page<AuditLogItem>> {
  const limit = resolveLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select(AUDIT_LOG_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (filters.action) {
    query = query.eq("action", filters.action);
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", startOfDaySaoPaulo(filters.dateFrom));
  }
  if (filters.dateTo) {
    query = query.lte("created_at", endOfDaySaoPaulo(filters.dateTo));
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return { items: [], nextCursor: null };

  const rows = (data ?? []) as unknown as AuditLogItem[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ createdAt: last.created_at, id: String(last.id) }) : null,
  };
}

/** Vidraça da Visão geral — últimas N linhas, sem paginação: é widget, não lista. */
export async function recentAuditLog(limit: number): Promise<AuditLogItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select(AUDIT_LOG_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 20));

  return (data ?? []) as unknown as AuditLogItem[];
}

// -----------------------------------------------------------------------------
// Captura (landing_events) — mesma tabela que scripts/metrics.mts lê, mas
// pela sessão admin em vez da chave secreta: `landing_events_select` já
// libera por `private.is_admin()`, e o script usa chave secreta só porque é
// CLI sem sessão nenhuma para carregar. A lógica de agregação é a mesma —
// reusada de `modules/capture/events.ts`, pura e já testada — só a consulta
// é nova.
// -----------------------------------------------------------------------------

const LANDING_EVENTS_PAGE = 1000;

export async function getLandingRollup(
  days: number,
): Promise<{ rollup: SourceRollup[]; totals: CaptureTotals }> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createClient();

  const events: { kind: "view" | "signup"; source: string }[] = [];
  let cursorId = 0;
  for (;;) {
    const { data } = await supabase
      .from("landing_events")
      .select("id, kind, source")
      .gte("created_at", since)
      .gt("id", cursorId)
      .order("id", { ascending: true })
      .limit(LANDING_EVENTS_PAGE);

    if (!data || data.length === 0) break;
    for (const row of data) {
      events.push({ kind: row.kind as "view" | "signup", source: row.source });
    }
    cursorId = data[data.length - 1]!.id;
    if (data.length < LANDING_EVENTS_PAGE) break;
  }

  const rollup = rollupBySource(events);
  return { rollup, totals: totals(rollup) };
}

// -----------------------------------------------------------------------------
// Funil de ativação
// -----------------------------------------------------------------------------

/**
 * As contagens do funil, numa chamada.
 *
 * VIA RPC, e não pelo PostgREST como as outras contagens deste arquivo: três
 * dos cinco números são `count(distinct owner_id)`, que o PostgREST não
 * expressa. A alternativa seria baixar o `owner_id` de todo cão da base e
 * deduplicar aqui — listagem sem teto, contra a invariante de performance.
 *
 * NÃO USA `landing_events`. Aquela tabela é anônima por construção (sem id de
 * usuário, sem IP, sem cookie) e não teria como responder isto; ela continua
 * medindo acesso e conversão da página de captura, que é outra pergunta. Ver o
 * cabeçalho da migration `funil_de_ativacao`.
 *
 * ZEROS EM CASO DE ERRO, nunca exceção: a Visão geral não pode cair porque uma
 * métrica falhou — mesmo princípio de `getAlertsForUser`. A guarda de admin
 * mora DENTRO da função (ela levanta `insufficient_privilege` para não-admin),
 * então um erro aqui é falha de infraestrutura, não vazamento.
 */
export async function getUserFunnel(): Promise<FunnelCounts> {
  const vazio: FunnelCounts = {
    total: 0,
    withKennel: 0,
    withDog: 0,
    withPublishedDog: 0,
    withKennelNoDog: 0,
  };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_user_funnel");
  if (error) return vazio;

  // `returns table` chega como array de uma linha só.
  const row = data?.[0];
  if (!row) return vazio;

  return {
    total: row.total ?? 0,
    withKennel: row.with_kennel ?? 0,
    withDog: row.with_dog ?? 0,
    withPublishedDog: row.with_published_dog ?? 0,
    withKennelNoDog: row.with_kennel_no_dog ?? 0,
  };
}
