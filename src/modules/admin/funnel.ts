/**
 * ============================================================================
 * Funil de ativação — a aritmética, sem banco.
 * ============================================================================
 *
 * Recebe as contagens cruas de `admin_user_funnel()` e devolve as etapas já com
 * suas taxas. Mesmo desenho de `modules/capture/events.ts`, onde `rollupBySource`
 * e `totals` são puros e testados à parte da consulta: a regra fica verificável
 * sem subir nada.
 *
 * O FUNIL NÃO É ANINHADO, e é o que dita o formato daqui. `dogs.kennel_id` é
 * nullable e o formulário de cão aceita cadastro sem canil, então "tem cão" NÃO
 * é subconjunto de "tem canil" — existe criador com cão e sem canil. Por isso
 * cada etapa é medida contra o TOTAL, e a única taxa em cadeia é
 * `cão → cão publicado`, que é aninhada de verdade.
 *
 * Apresentar isto como funil clássico (cada taxa sobre a etapa anterior) contaria
 * como conversão quem pulou a etapa, e `canil → cão` poderia passar de 100%.
 */

/** O que a RPC devolve, cru. */
export type FunnelCounts = {
  total: number;
  withKennel: number;
  withDog: number;
  withPublishedDog: number;
  withKennelNoDog: number;
};

export type FunnelStage = {
  key: "total" | "kennel" | "dog" | "published";
  label: string;
  count: number;
  /**
   * Fatia do TOTAL de criadores, de 0 a 1. `null` quando não há criador
   * nenhum: conversão sem denominador é indefinida, não zero — escrever 0%
   * afirmaria um fracasso que não foi medido. Mesma convenção de
   * `SourceRollup.rate`, e é o que faz `formatRate` imprimir "—".
   */
  rate: number | null;
};

export type Funnel = {
  stages: FunnelStage[];
  /**
   * A MÉTRICA PRINCIPAL: quantos criadores chegaram a cadastrar o primeiro cão.
   * Duplica a taxa da etapa `dog` de propósito — é o número que a tela mostra em
   * destaque, e nomeá-lo evita que a UI vá pescá-lo do array por índice.
   */
  activationRate: number | null;
  /**
   * Dos que têm cão, quantos publicaram ao menos um. A ÚNICA taxa em cadeia,
   * porque é a única etapa que de fato contém a anterior.
   */
  publishedOfWithDog: number | null;
  /** Cadastrou o canil e parou ali — a evasão acionável. */
  withKennelNoDog: number;
};

/** Divisão que devolve `null` em vez de dividir por zero. */
function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export function buildFunnel(counts: FunnelCounts): Funnel {
  const { total, withKennel, withDog, withPublishedDog, withKennelNoDog } = counts;

  return {
    stages: [
      { key: "total", label: "Criadores", count: total, rate: rate(total, total) },
      { key: "kennel", label: "Com canil", count: withKennel, rate: rate(withKennel, total) },
      { key: "dog", label: "Com ao menos 1 cão", count: withDog, rate: rate(withDog, total) },
      {
        key: "published",
        label: "Com ao menos 1 cão publicado",
        count: withPublishedDog,
        rate: rate(withPublishedDog, total),
      },
    ],
    activationRate: rate(withDog, total),
    publishedOfWithDog: rate(withPublishedDog, withDog),
    withKennelNoDog,
  };
}
