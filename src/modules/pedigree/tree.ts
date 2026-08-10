/**
 * ============================================================================
 * Montagem da árvore genealógica — lógica pura.
 * ============================================================================
 *
 * NUMERAÇÃO DE AHNENTAFEL (Sosa-Stradonitz): o sujeito é 1, o pai de N é 2N e a
 * mãe de N é 2N+1. As gerações 1 a 5 ocupam as posições 2 a 63.
 *
 * A POSIÇÃO É O CAMINHO. Escrito em binário, o número da posição é literalmente
 * a sequência de viradas pai/mãe feitas a partir do sujeito. É por isso que
 * "renderizar por CAMINHO, não por nó" não vira uma regra que alguém precisa
 * lembrar: aqui a chave de tudo é a posição, e o `dog_id` é só um atributo dela.
 * Um ancestral que aparece em quatro posições é lido, montado e desenhado quatro
 * vezes, sem nenhum código especial para isso.
 *
 * Nada aqui fala com banco. Recebe as linhas que `public.dog_pedigree` devolveu
 * e devolve estrutura pronta para desenhar.
 */

/** Gerações além do sujeito. O banco impõe o mesmo teto. */
export const MAX_GENERATIONS = 5;

/** Última posição de uma árvore de 5 gerações: 2^6 - 1. */
export const MAX_POSITION = 2 ** (MAX_GENERATIONS + 1) - 1;

/** Uma linha de `public.dog_pedigree`, exatamente como o banco devolve. */
export type PedigreeRow = {
  pos: number;
  generation: number;
  dog_id: string;
  /**
   * O nome sai SEMPRE, inclusive de rascunho de terceiro — decisão de produto
   * registrada em supabase/README.md. Os campos abaixo, não.
   */
  name: string;
  is_public: boolean;
  public_id: string | null;
  sex: string | null;
  breed: string | null;
  born_on: string | null;
  kennel_name: string | null;
};

export type PedigreeNode = PedigreeRow & {
  /** "mãe do pai" — derivado da posição, não armazenado. */
  path: string;
  /** "Pai" ou "Mãe": a relação com a posição imediatamente abaixo. */
  relation: string;
  /** O mesmo cão ocupa outra posição da árvore. Linebreeding. */
  repeated: boolean;
};

export type Pedigree = {
  subject: PedigreeNode | null;
  /** Chave é a posição, nunca o `dog_id`. */
  byPosition: ReadonlyMap<number, PedigreeNode>;
  /** Gerações preenchidas. O índice é a geração; 0 é o sujeito sozinho. */
  generations: readonly (readonly PedigreeNode[])[];
  /** Geração mais profunda que tem ao menos um ancestral. */
  depth: number;
  /** `dog_id` → posições que ele ocupa, apenas para quem ocupa mais de uma. */
  repeated: ReadonlyMap<string, readonly number[]>;
  /** Ancestrais conhecidos, sem contar o sujeito. Conta POSIÇÕES. */
  knownAncestors: number;
  /** Posições que existiriam se a árvore fosse cheia até `depth`. */
  possibleAncestors: number;
};

/** Geração da posição: o comprimento em bits menos um, sem passar por float. */
export function generationOf(pos: number): number {
  return 31 - Math.clz32(pos);
}

/** `[posição do pai, posição da mãe]`. */
export function parentPositions(pos: number): [number, number] {
  return [pos * 2, pos * 2 + 1];
}

/** Posição par é pai; ímpar é mãe. O sujeito não tem relação. */
export function relationOf(pos: number): string {
  if (pos <= 1) return "";
  return pos % 2 === 0 ? "Pai" : "Mãe";
}

/**
 * Termos do caminho, do mais próximo da posição para o mais próximo do sujeito.
 *
 * Dividir por 2 recolhendo o resto lê os bits da direita para a esquerda, que é
 * justamente a ordem em que o português enuncia o parentesco: a posição 5
 * (`101`) dá `[mãe, pai]` — a mãe DO pai.
 */
function pathTerms(pos: number): ("pai" | "mãe")[] {
  const terms: ("pai" | "mãe")[] = [];
  for (let p = pos; p > 1; p = Math.floor(p / 2)) {
    terms.push(p % 2 === 0 ? "pai" : "mãe");
  }
  return terms;
}

/**
 * O caminho por extenso: posição 5 → "mãe do pai", posição 11 → "mãe da mãe do
 * pai".
 *
 * É o que vai no `title` e no rótulo acessível de cada nó. Numa árvore aninhada
 * e recolhida, saber que aquele quadro é "o pai da mãe do pai" é a diferença
 * entre entender e chutar — e é a única leitura possível para quem navega por
 * leitor de tela, onde o aninhamento visual não existe.
 *
 * A concordância do conector segue o termo SEGUINTE: "mãe DO pai", "pai DA mãe".
 */
export function pathLabel(pos: number): string {
  const terms = pathTerms(pos);
  if (terms.length === 0) return "";

  let label: string = terms[0]!;
  for (let i = 1; i < terms.length; i += 1) {
    const term = terms[i]!;
    label += `${term === "pai" ? " do " : " da "}${term}`;
  }
  return label;
}

/** Posição válida numa árvore de 5 gerações. */
function isValidPosition(pos: number): boolean {
  return Number.isInteger(pos) && pos >= 1 && pos <= MAX_POSITION;
}

/**
 * Monta a árvore a partir das linhas do banco.
 *
 * Tolera lacuna: uma posição sem linha é um ancestral desconhecido, e as demais
 * posições NÃO se deslocam para tapar o buraco — o avô materno continua no 6
 * mesmo que o avô paterno seja desconhecido. Deslocar destruiria o significado
 * da posição, que é a única coisa que sustenta o resto deste módulo.
 *
 * Tolera também a árvore truncada: quem só tem pai e mãe cadastrados devolve
 * `depth = 1`, e a interface não desenha três gerações vazias.
 */
export function buildPedigree(rows: readonly PedigreeRow[]): Pedigree {
  const positionsByDog = new Map<string, number[]>();
  const valid: PedigreeRow[] = [];

  for (const row of rows) {
    if (!isValidPosition(row.pos)) continue;
    valid.push(row);

    const seen = positionsByDog.get(row.dog_id);
    if (seen) seen.push(row.pos);
    else positionsByDog.set(row.dog_id, [row.pos]);
  }

  const repeated = new Map<string, readonly number[]>();
  for (const [dogId, positions] of positionsByDog) {
    if (positions.length > 1)
      repeated.set(
        dogId,
        [...positions].sort((a, b) => a - b),
      );
  }

  const byPosition = new Map<number, PedigreeNode>();
  for (const row of valid) {
    byPosition.set(row.pos, {
      ...row,
      // Recalculado a partir da posição em vez de confiar na coluna: se as duas
      // discordarem, a posição vence, porque é ela que decide onde o nó é
      // desenhado.
      generation: generationOf(row.pos),
      path: pathLabel(row.pos),
      relation: relationOf(row.pos),
      repeated: repeated.has(row.dog_id),
    });
  }

  const generations: PedigreeNode[][] = [];
  for (const node of byPosition.values()) {
    (generations[node.generation] ??= []).push(node);
  }
  for (const list of generations) {
    list?.sort((a, b) => a.pos - b.pos);
  }
  // Geração sem nenhum nó vira lista vazia, não buraco no array.
  for (let g = 0; g < generations.length; g += 1) generations[g] ??= [];

  const depth = generations.length > 0 ? generations.length - 1 : 0;
  const knownAncestors = byPosition.size - (byPosition.has(1) ? 1 : 0);

  return {
    subject: byPosition.get(1) ?? null,
    byPosition,
    generations,
    depth,
    repeated,
    knownAncestors,
    possibleAncestors: 2 ** (depth + 1) - 2,
  };
}

/** Rótulo curto do ancestral, abaixo do nome. */
export function describeNode(node: PedigreeNode): string {
  const parts = [node.breed, node.born_on?.slice(0, 4), node.kennel_name].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Raça, e só ela — apoio do card COM FOTO (geração 0 até `MAX_PHOTO_GENERATION`
 * em `layout.ts`). `describeNode` (raça + ano + canil) cabia no `<details>` de
 * texto antigo; num card de ~150px de largura, ano e canil junto do nome
 * estourariam a linha. O card compacto (geração 4+) não chama nem esta função:
 * lá só cabe o nome.
 */
export function shortSupport(node: PedigreeNode): string {
  return node.breed ?? "";
}

/**
 * Quais `dog_id` merecem uma consulta de miniatura.
 *
 * Três filtros, nesta ordem:
 *   1. nunca o sujeito (posição 1) — a página do cão já busca a foto dele por
 *      outra consulta; pedir de nono aqui seria a mesma imagem, uma vez a mais.
 *   2. nunca além de `maxGeneration` — ver `MAX_PHOTO_GENERATION`: da quarta
 *      geração em diante o card é só texto, então a foto nunca apareceria.
 *   3. só ancestral que o BANCO já classificou como público (`is_public`,
 *      calculado por `dog_is_public()` dentro de `dog_pedigree`). Não é
 *      re-derivado aqui.
 *
 * ⚠️ `is_public: true` não é sinônimo de "publicado" — o ancestral FANTASMA
 * (sem dono, sem canil) também satisfaz `dog_is_public()` mesmo que
 * `published_at` seja nulo. Ele passa por este filtro e entra na consulta de
 * `getPublicDogThumbs`; é o filtro de bucket lá (mídia pública mora só em
 * `kennel-media-public`) que garante que isso não vaza nem gasta uma
 * assinatura de URL à toa. Ver o comentário completo naquela função.
 *
 * Dedup por `dog_id`: linebreeding faz o mesmo cão ocupar várias posições — a
 * mesma foto não precisa ser pedida duas vezes.
 */
export function thumbnailTargets(pedigree: Pedigree, maxGeneration: number): string[] {
  const ids = new Set<string>();
  for (const node of pedigree.byPosition.values()) {
    if (node.pos === 1) continue;
    if (node.generation > maxGeneration) continue;
    if (!node.is_public) continue;
    ids.add(node.dog_id);
  }
  return [...ids];
}
