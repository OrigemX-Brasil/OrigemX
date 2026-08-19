import { HEALTH_KIND_OPTIONS } from "./constraints";
import type { HealthRecord } from "./queries";

/**
 * ============================================================================
 * Resumo público de saúde — o "mais recente de cada tipo", com checkmark.
 * ============================================================================
 *
 * PURO, sem banco. O painel mostra o histórico INTEIRO (`HealthSection`); o
 * público mostra só o último de cada tipo. São duas leituras dos MESMOS dados,
 * e é por isso que nada aqui persiste nada: derivar do log é o que garante que
 * o resumo nunca discorde da lista que o criador vê.
 *
 * Não confia na ordem em que os registros chegaram. `getHealthRecordsByDog` já
 * faz `order("applied_on", desc)`, mas função pura que depende de um `ORDER BY`
 * externo quebra em silêncio no dia em que alguém mexe na consulta — e o bug
 * resultante ("a data mostrada é de uma dose antiga") é invisível em review.
 */

/** Rótulo público por tipo. Frase inteira, não só o substantivo.
 *
 *  A referência visual do cliente escreve "Primeira vacina", mas o que
 *  exibimos é o registro MAIS RECENTE de uma lista que cresce — "Primeira"
 *  passaria a ser falso a partir da segunda dose. A especificação escrita do
 *  dono do produto pede "última vacina", que é o rótulo correto. */
const PUBLIC_LABEL: Record<string, string> = {
  deworming: "Vermífugo aplicado em",
  vaccine: "Última vacina em",
};

/** Ordem de exibição — a mesma da referência: vermífugo antes de vacina. */
const KIND_ORDER: readonly string[] = HEALTH_KIND_OPTIONS.map((o) => o.value);

export function publicHealthLabel(kind: string): string {
  return PUBLIC_LABEL[kind] ?? kind;
}

export type LatestHealth = {
  kind: string;
  applied_on: string;
  product: string | null;
};

/**
 * Compara dois registros do mesmo tipo: o "maior" é o mais recente.
 *
 * `applied_on` é ISO `yyyy-mm-dd`, então comparação de string é cronológica —
 * sem `new Date()`, sem fuso, sem a armadilha de `2026-02-31` (que aqui nem
 * chega: `validateHealthRecord` já barrou na escrita).
 *
 * Empate de data desempata por `id`. Duas vacinas no mesmo dia são plausíveis
 * (V10 + antirrábica), e sem o desempate o render alternaria entre as duas
 * conforme a ordem que o Postgres devolvesse — uma diferença invisível que
 * faria a página "piscar" entre deploys.
 */
function isMoreRecent(candidate: HealthRecord, current: LatestHealth & { id: string }): boolean {
  if (candidate.applied_on !== current.applied_on) {
    return candidate.applied_on > current.applied_on;
  }
  return candidate.id > current.id;
}

/**
 * O registro mais recente de CADA tipo, na ordem de `HEALTH_KIND_OPTIONS`.
 *
 * Tipo sem nenhum registro simplesmente não aparece — quem chama não precisa
 * filtrar "existe?" antes de renderizar, e a seção pública fica com 1 item, 2
 * ou nenhum sem nenhum ramo especial.
 */
export function latestByKind(records: readonly HealthRecord[]): LatestHealth[] {
  const best = new Map<string, LatestHealth & { id: string }>();

  for (const record of records) {
    const current = best.get(record.kind);
    if (!current || isMoreRecent(record, current)) {
      best.set(record.kind, {
        id: record.id,
        kind: record.kind,
        applied_on: record.applied_on,
        product: record.product,
      });
    }
  }

  // O `id` fica FORA do que sai daqui: ele existe só para desempatar acima, e
  // exportá-lo convidaria a tela a usá-lo como chave de React — que passaria a
  // mudar sozinha quando o critério de desempate mudasse. A chave estável é o
  // `kind`, que é único no resultado por construção.
  return KIND_ORDER.filter((kind) => best.has(kind)).map((kind) => {
    const entry = best.get(kind)!;
    return { kind: entry.kind, applied_on: entry.applied_on, product: entry.product };
  });
}

export type LitterHealthCoverage = {
  kind: string;
  /** A data mais recente entre os filhotes — quando a ninhada ficou coberta. */
  applied_on: string;
  /** Quantos filhotes VISÍVEIS têm este tipo registrado. */
  covered: number;
  /** Quantos filhotes o visitante vê. */
  total: number;
  /** `covered === total`. É isto, e só isto, que autoriza o checkmark verde. */
  complete: boolean;
};

/**
 * Cobertura da ninhada por tipo de registro.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `complete` EXISTE
 * ---------------------------------------------------------------------------
 * A referência visual mostra um checkmark único no nível da ninhada, como se
 * valesse para todos os filhotes. Mas o registro é por CÃO: numa ninhada de
 * seis, dois podem estar vacinados e quatro não. Exibir "Última vacina em
 * 12/08" com check verde nesse caso é uma afirmação FALSA para alguém que está
 * decidindo uma compra de milhares de reais.
 *
 * Então o check verde só sai quando `complete`. Cobertura parcial vira texto
 * neutro com o número real ("2 de 6 filhotes"), sem check. A estrutura visual
 * da referência é preservada; a afirmação enganosa, não.
 *
 * ---------------------------------------------------------------------------
 * O DENOMINADOR É O QUE O VISITANTE VÊ
 * ---------------------------------------------------------------------------
 * `puppyIds` tem de ser a lista de filhotes que a PÁGINA renderizou —
 * `getPublicLitterPuppies` já filtra `published_at not null`. Passar todos os
 * filhotes do banco produziria "2 de 6" numa página que mostra 2 cards, e o
 * visitante não teria como reconciliar os números.
 */
export function litterHealthCoverage(
  puppyIds: readonly string[],
  byDog: ReadonlyMap<string, readonly HealthRecord[]>,
): LitterHealthCoverage[] {
  const total = puppyIds.length;
  if (total === 0) return [];

  const acc = new Map<string, { applied_on: string; covered: number }>();

  for (const puppyId of puppyIds) {
    // `latestByKind` por filhote, não sobre a lista achatada: o que interessa
    // é QUANTOS FILHOTES têm o tipo, e três vacinas do mesmo filhote não
    // podem contar como três filhotes cobertos.
    for (const entry of latestByKind(byDog.get(puppyId) ?? [])) {
      const current = acc.get(entry.kind);
      if (!current) {
        acc.set(entry.kind, { applied_on: entry.applied_on, covered: 1 });
        continue;
      }
      current.covered += 1;
      if (entry.applied_on > current.applied_on) current.applied_on = entry.applied_on;
    }
  }

  return KIND_ORDER.filter((kind) => acc.has(kind)).map((kind) => {
    const { applied_on, covered } = acc.get(kind)!;
    return { kind, applied_on, covered, total, complete: covered === total };
  });
}
