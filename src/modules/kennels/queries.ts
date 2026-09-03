import { assistingProfileId } from "@/lib/assist";
import { createClient } from "@/lib/supabase/server";

import { KENNEL_COLUMNS } from "./fields";

/**
 * Acesso a dados de canil. Todo `.from("kennels")` do app passa por aqui.
 *
 * Os filtros abaixo são para a CONSULTA estar certa, não para proteger: quem
 * decide o que cada um enxerga é a RLS. Ver src/modules/README.md.
 *
 * NÃO EXISTE FUNÇÃO DE LISTA AQUI, e é invariante, não esquecimento: um criador
 * tem no máximo UM canil vivo, garantido pelo índice `kennels_owner_uk`. Um
 * `listMyKennels` que reapareça é sinal de que alguém reintroduziu o 1:N na
 * cabeça antes de reintroduzir no banco.
 */

// As colunas vêm de `fields.ts`, junto da definição dos campos: foi manter as
// duas listas em arquivos diferentes que deixou `breeds` de fora e fez o
// criador ver o formulário recarregar vazio depois de salvar.
const LIST_COLUMNS = KENNEL_COLUMNS;

export type KennelListItem = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  instagram_handle: string | null;
  whatsapp: string | null;
  registration_number: string | null;
  /** Raças criadas. `text[]` na coluna; o formulário entrega texto separado por vírgula. */
  breeds: string[] | null;
  published_at: string | null;
  /** Selo Criador Fundador, 1 a 100. NULL quando não há selo. */
  founder_number: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * O canil do usuário. Singular por invariante: `kennels_owner_uk` garante no
 * máximo um vivo por dono.
 *
 * Filtra por `owner_id` de propósito, mesmo com RLS: a policy de leitura também
 * libera canil publicado de terceiro, porque o diretório é público. Sem este
 * filtro, o painel do criador enxergaria a plataforma inteira.
 *
 * O `.limit(1)` antes do `.maybeSingle()` não é redundância: `maybeSingle`
 * LEVANTA se vierem duas linhas, e num banco onde a migration ainda não rodou
 * isso derrubaria o painel em vez de mostrar um canil. Com o limite, o pior
 * caso é mostrar o mais recente.
 */
export async function getMyKennel(ownerId: string): Promise<KennelListItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennels")
    .select(LIST_COLUMNS)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Canil por id.
 *
 * ⚠️ ISTO NÃO BASTA PARA A TELA DE EDIÇÃO. A policy `kennels_select` também
 * devolve canil PUBLICADO de terceiro — o diretório é público. Para o painel,
 * use `getManageableKennelById`.
 */
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

/**
 * O canil, só se for deste usuário.
 *
 * Filtra por `owner_id` NA CONSULTA. Buscar e conferir depois daria no mesmo
 * resultado hoje, mas deixa a checagem solta num `if` que a próxima tela pode
 * esquecer de copiar — que foi exatamente o que aconteceu com o cão publicado
 * de terceiro, achado pelo teste E2E de isolamento.
 */
export async function getManageableKennelById(id: string, userId: string) {
  // O alvo de um cadastro assistido é resolvido AQUI DENTRO, e não recebido por
  // parâmetro: são doze pontos de chamada, e um parâmetro esquecido num deles
  // seria uma tela que abre vazia sem explicar por quê. Espelha o ramo de
  // assistência de `private.owns_kennel` no banco.
  const assistindo = await assistingProfileId();

  const supabase = await createClient();
  const { data } = await supabase
    .from("kennels")
    .select(`${LIST_COLUMNS}, owner_id, deleted_at`)
    .eq("id", id)
    .in("owner_id", [userId, ...(assistindo ? [assistindo] : [])])
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
