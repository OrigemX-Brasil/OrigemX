/**
 * ============================================================================
 * Busca e reuso de ancestral — lógica pura.
 * ============================================================================
 *
 * O problema que este módulo existe para resolver: se o criador digitasse o
 * nome do pai em campo livre, cada cão teria o "seu" Rex, e o pedigree viraria
 * uma coleção de homônimos desconectados. A plataforma inteira depende de que
 * o MESMO ancestral seja a MESMA linha — é o que faz linebreeding aparecer, o
 * que faz a árvore fechar e o que dá sentido à busca por linhagem.
 *
 * Por isso pai e mãe se definem escolhendo um cão já cadastrado. Quando ele
 * realmente não existe, cria-se um "fantasma": registro mínimo, sem dono e sem
 * canil, que serve só de nó de árvore.
 *
 * Nada aqui fala com banco. A elegibilidade recebe o conjunto de descendentes
 * já calculado, para poder ser testada sem grafo real — e para que a mesma
 * regra rode no servidor e no cliente sem divergir.
 */

export type Sex = "male" | "female";
export type ParentSlot = "sire" | "dam";

export type AncestorCandidate = {
  id: string;
  name: string;
  sex: Sex;
  born_on: string | null;
  breed: string | null;
  kennel_id: string | null;
  owner_id: string | null;
  kennel_name?: string | null;
  registration?: string | null;
  microchip?: string | null;
};

export const SLOT_SEX: Record<ParentSlot, Sex> = {
  sire: "male",
  dam: "female",
};

export const SLOT_LABEL: Record<ParentSlot, string> = {
  sire: "Pai",
  dam: "Mãe",
};

/**
 * Normaliza o termo para comparar: sem acento, sem caixa, sem espaço
 * duplicado.
 *
 * Sem isso, "Ipê" não acha "IPE" e o criador conclui que o cão não está na
 * base — e cria um duplicado, que é exatamente o que este módulo existe para
 * impedir.
 */
export function normalizeSearchTerm(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Busca com menos de 2 caracteres devolveria a base inteira. */
export const MIN_SEARCH_LENGTH = 2;

export function isSearchable(raw: string): boolean {
  return normalizeSearchTerm(raw).length >= MIN_SEARCH_LENGTH;
}

export type EligibilityContext = {
  slot: ParentSlot;
  /** O cão que está recebendo o progenitor. Ausente ao criar um cão novo. */
  dogId?: string | null;
  /** Quem já ocupa a outra posição — pai e mãe não podem ser o mesmo cão. */
  otherParentId?: string | null;
  /**
   * Descendentes do cão, em qualquer profundidade. Escolher um deles como
   * progenitor fecharia um ciclo, e o banco recusaria.
   */
  descendantIds?: ReadonlySet<string>;
};

export type Ineligibility =
  "sexo-incompativel" | "proprio-cao" | "ja-e-o-outro-progenitor" | "criaria-ciclo";

export const INELIGIBILITY_REASON: Record<Ineligibility, string> = {
  "sexo-incompativel": "Sexo incompatível com a posição.",
  "proprio-cao": "Um cão não pode ser progenitor de si mesmo.",
  "ja-e-o-outro-progenitor": "Já está selecionado na outra posição.",
  "criaria-ciclo": "É descendente deste cão — selecioná-lo criaria um ciclo.",
};

/**
 * Por que um candidato não serve, ou `null` se serve.
 *
 * As quatro regras são as mesmas que o banco impõe. Duplicá-las aqui não é
 * redundância inútil: é o que permite mostrar o motivo ANTES de o criador
 * salvar e levar um erro seco.
 */
export function ineligibilityOf(
  candidate: AncestorCandidate,
  ctx: EligibilityContext,
): Ineligibility | null {
  if (ctx.dogId && candidate.id === ctx.dogId) return "proprio-cao";
  if (candidate.sex !== SLOT_SEX[ctx.slot]) return "sexo-incompativel";
  if (ctx.otherParentId && candidate.id === ctx.otherParentId) return "ja-e-o-outro-progenitor";
  if (ctx.descendantIds?.has(candidate.id)) return "criaria-ciclo";
  return null;
}

export function isEligibleParent(candidate: AncestorCandidate, ctx: EligibilityContext): boolean {
  return ineligibilityOf(candidate, ctx) === null;
}

export function filterEligibleParents(
  candidates: readonly AncestorCandidate[],
  ctx: EligibilityContext,
): AncestorCandidate[] {
  return candidates.filter((c) => isEligibleParent(c, ctx));
}

/**
 * Pontuação de relevância. Maior é melhor; 0 significa que não casou.
 *
 * Identificador bate primeiro e vale muito mais que nome: número de registro e
 * microchip são únicos por definição, enquanto "Rex" existe às centenas. Quem
 * digita um número está apontando para UM cão.
 */
export function scoreCandidate(candidate: AncestorCandidate, rawTerm: string): number {
  const term = normalizeSearchTerm(rawTerm);
  if (term.length === 0) return 0;

  const identifiers = [candidate.registration, candidate.microchip]
    .filter((v): v is string => Boolean(v))
    .map(normalizeSearchTerm);

  if (identifiers.some((id) => id === term)) return 1000;
  if (identifiers.some((id) => id.includes(term))) return 500;

  const name = normalizeSearchTerm(candidate.name);
  if (name === term) return 100;
  if (name.startsWith(term)) return 50;

  // Início de palavra vale mais que meio de palavra: quem busca "aurora" quer
  // "Aurora do Vale" antes de "Belaurora".
  if (name.split(" ").some((word) => word.startsWith(term))) return 25;
  if (name.includes(term)) return 10;

  return 0;
}

/**
 * Ordena por relevância e descarta o que não casou.
 *
 * Desempate por nome para a lista não dançar entre carregamentos — resultado
 * instável faz o usuário duvidar do que está vendo.
 */
export function rankCandidates(
  candidates: readonly AncestorCandidate[],
  rawTerm: string,
): AncestorCandidate[] {
  return candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, rawTerm) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name, "pt-BR"))
    .map((entry) => entry.candidate);
}

/**
 * Ancestral fantasma: sem dono E sem canil.
 *
 * A conjunção importa. Cão COM canil e sem dono é comum e legítimo — é o animal
 * que o criador cadastrou e ainda não vendeu. Tratar os dois como a mesma coisa
 * exibiria um rascunho alheio como se fosse registro público, e é a mesma
 * distinção que a policy `dogs_select` faz no banco.
 */
export function isGhostAncestor(dog: {
  owner_id: string | null;
  kennel_id: string | null;
}): boolean {
  return dog.owner_id === null && dog.kennel_id === null;
}

/** Linha de apoio na lista de resultados, para o criador distinguir homônimos. */
export function describeCandidate(candidate: AncestorCandidate): string {
  const parts: string[] = [];
  if (candidate.breed) parts.push(candidate.breed);
  if (candidate.born_on) parts.push(candidate.born_on.slice(0, 4));
  if (candidate.kennel_name) parts.push(candidate.kennel_name);
  if (candidate.registration) parts.push(candidate.registration);
  if (parts.length === 0) parts.push(isGhostAncestor(candidate) ? "Ancestral" : "Sem dados");
  return parts.join(" · ");
}
