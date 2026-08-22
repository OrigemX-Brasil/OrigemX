import { createClient } from "@/lib/supabase/server";
import type { AncestorCandidate } from "@/modules/dogs/ancestors";
import { countDogGalleries, getDogCovers, getLitterCovers } from "@/modules/media/queries";
import type { ResolvedMedia } from "@/modules/media/queries";

import { MAX_PUPPIES_PER_LITTER } from "./constraints";

/**
 * Acesso a dados de ninhada. Todo `.from("kennel_litters")` do painel passa
 * por aqui — mesmo princípio de `modules/kennels/queries.ts`/`modules/dogs/queries.ts`.
 *
 * Os filtros abaixo são para a CONSULTA estar certa, não para proteger: quem
 * decide o que cada um enxerga é a RLS.
 */

/** Quantos filhotes a ninhada tem, e como estão distribuídos. Tudo CONTADO —
 *  nenhum desses números tem coluna no banco, e é de propósito: total que
 *  discorda das linhas é o pior tipo de bug de relatório. */
export type PuppyTally = {
  total: number;
  males: number;
  females: number;
  available: number;
};

const EMPTY_TALLY: PuppyTally = { total: 0, males: 0, females: 0, available: 0 };

export type LitterListItem = {
  id: string;
  kennel_id: string;
  public_id: string;
  description: string | null;
  mated_on: string | null;
  born_on: string | null;
  published_at: string | null;
  created_at: string;
  cover: ResolvedMedia | null;
  tally: PuppyTally;
};

/**
 * Contagem de filhotes de várias ninhadas de uma vez.
 *
 * Uma consulta para a página inteira, não uma por ninhada. Traz as linhas em
 * vez de usar `count: exact` porque são QUATRO números por ninhada (total,
 * machos, fêmeas, disponíveis) e cada um seria um `head: true` separado — o
 * volume é pequeno e limitado pelo teto de filhotes por ninhada.
 */
async function tallyPuppies(litterIds: readonly string[]): Promise<Map<string, PuppyTally>> {
  const tallies = new Map<string, PuppyTally>();
  if (litterIds.length === 0) return tallies;

  const supabase = await createClient();
  const { data } = await supabase
    .from("dogs")
    .select("litter_id, sex, litter_status")
    .in("litter_id", litterIds)
    .is("deleted_at", null)
    .limit(litterIds.length * MAX_PUPPIES_PER_LITTER);

  for (const row of data ?? []) {
    if (!row.litter_id) continue;

    const tally = tallies.get(row.litter_id) ?? { ...EMPTY_TALLY };
    tally.total += 1;
    if (row.sex === "male") tally.males += 1;
    if (row.sex === "female") tally.females += 1;
    if (row.litter_status === "available") tally.available += 1;
    tallies.set(row.litter_id, tally);
  }

  return tallies;
}

/**
 * Id da ninhada mais recente do canil, ou `null` sem nenhuma.
 *
 * Deliberadamente mais barata que `getKennelLitters`: o atalho "Ver minhas
 * ninhadas" do painel só precisa decidir ENTRE editar a ninhada existente ou
 * cair na lista — não precisa de capa nem de contagem de filhotes, que
 * `getKennelLitters` paga e aqui não serviriam pra nada.
 */
export async function getLatestLitterId(kennelId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennel_litters")
    .select("id")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Ninhadas do canil, mais recente primeiro, com a capa (posição 1) já resolvida. */
export async function getKennelLitters(kennelId: string): Promise<LitterListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennel_litters")
    .select("id, kennel_id, public_id, description, mated_on, born_on, published_at, created_at")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const litters = data ?? [];
  if (litters.length === 0) return [];

  const ids = litters.map((l) => l.id);
  const [covers, tallies] = await Promise.all([getLitterCovers(ids), tallyPuppies(ids)]);

  return litters.map((litter) => ({
    ...litter,
    cover: covers.get(litter.id) ?? null,
    tally: tallies.get(litter.id) ?? { ...EMPTY_TALLY },
  }));
}

/**
 * Progenitor da ninhada.
 *
 * A forma é a de `AncestorCandidate` (`modules/dogs/ancestors.ts`) MAIS
 * `public_id`, e não é coincidência: é o que permite entregar o progenitor
 * direto ao `ParentPicker` que o formulário de cão já usa, sem adaptador. O
 * `public_id` extra é para o link do card na página pública.
 */
export type LitterParent = AncestorCandidate & { public_id: string };

export type ManageableLitter = {
  id: string;
  kennel_id: string;
  public_id: string;
  description: string | null;
  mated_on: string | null;
  born_on: string | null;
  sire_id: string | null;
  dam_id: string | null;
  sire: LitterParent | null;
  dam: LitterParent | null;
  published_at: string | null;
  created_at: string;
};

/** O join do PostgREST vem como objeto ou array conforme a cardinalidade. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type ParentRow = {
  id: string;
  name: string;
  sex: string;
  public_id: string;
  breed: string | null;
  born_on: string | null;
  kennel_id: string | null;
  owner_id: string | null;
};

/**
 * Converte o progenitor cru em `LitterParent`.
 *
 * O `sex` sai do gerador de tipos como `string` porque a coluna é `text` — o
 * projeto não tem nenhum `CREATE TYPE`, o domínio é o CHECK `dogs_sex_valid`.
 * O estreitamento acontece aqui, na FRONTEIRA, com o mesmo raciocínio que
 * `pedigree/queries.ts` já aplica: o banco é quem garante, e o tipo local diz
 * a verdade a partir deste ponto.
 */
function toParent(raw: ParentRow | ParentRow[] | null | undefined): LitterParent | null {
  const row = one<ParentRow>(raw);
  if (!row) return null;
  return { ...row, sex: row.sex === "female" ? "female" : "male" };
}

/**
 * A ninhada, só se o usuário for dono do CANIL dela — `kennel_litters` não
 * tem `owner_id` próprio (ver a migration), então a posse é sempre via
 * `kennels.owner_id`, filtrada NA CONSULTA (mesmo princípio de
 * `getManageableKennelById`: deixar a checagem solta num `if` é o que a
 * próxima tela esquece de copiar).
 *
 * Os dois joins para `dogs` precisam nomear a CONSTRAINT: com duas FKs para a
 * mesma tabela, `dogs(...)` sozinho é ambíguo e o PostgREST recusa.
 */
export async function getManageableLitterById(
  id: string,
  userId: string,
): Promise<ManageableLitter | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennel_litters")
    .select(
      `id, kennel_id, public_id, description, mated_on, born_on, sire_id, dam_id,
       published_at, created_at,
       kennels!inner(owner_id),
       sire:dogs!kennel_litters_sire_id_fkey(id, name, sex, public_id, breed, born_on, kennel_id, owner_id),
       dam:dogs!kennel_litters_dam_id_fkey(id, name, sex, public_id, breed, born_on, kennel_id, owner_id)`,
    )
    .eq("id", id)
    .eq("kennels.owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    kennel_id: data.kennel_id,
    public_id: data.public_id,
    description: data.description,
    mated_on: data.mated_on,
    born_on: data.born_on,
    sire_id: data.sire_id,
    dam_id: data.dam_id,
    sire: toParent(data.sire),
    dam: toParent(data.dam),
    published_at: data.published_at,
    created_at: data.created_at,
  };
}

export type LitterPuppy = {
  id: string;
  public_id: string;
  name: string;
  sex: string;
  color: string | null;
  litter_status: string | null;
  price_brl: number | null;
  accepts_offer: boolean;
  published_at: string | null;
  created_at: string;
  cover: ResolvedMedia | null;
  /** Fotos vivas na galeria — o `PuppyManager` usa para calcular o `remaining`
   *  do `GalleryUploader` inline sem consultar o banco de novo por linha. */
  photoCount: number;
};

/**
 * Os filhotes da ninhada, em ordem de cadastro.
 *
 * Ordena por `created_at` e não por nome: "Filhote 2" e "Filhote 10" saem
 * trocados em ordem alfabética, e o criador cadastra na ordem em que pega os
 * cães no ninho.
 */
export async function getLitterPuppies(litterId: string): Promise<LitterPuppy[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dogs")
    .select(
      "id, public_id, name, sex, color, litter_status, price_brl, accepts_offer, published_at, created_at",
    )
    .eq("litter_id", litterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_PUPPIES_PER_LITTER);

  const puppies = data ?? [];
  if (puppies.length === 0) return [];

  const ids = puppies.map((p) => p.id);
  const [covers, photoCounts] = await Promise.all([getDogCovers(ids), countDogGalleries(ids)]);

  return puppies.map((puppy) => ({
    ...puppy,
    cover: covers.get(puppy.id) ?? null,
    photoCount: photoCounts.get(puppy.id) ?? 0,
  }));
}

/** Quantos filhotes vivos a ninhada já tem — para o teto em `addPuppy`. */
export async function countLitterPuppies(litterId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("dogs")
    .select("id", { count: "exact", head: true })
    .eq("litter_id", litterId)
    .is("deleted_at", null);

  return count ?? 0;
}
