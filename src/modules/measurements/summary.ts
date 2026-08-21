import type { Measurement } from "./queries";

/**
 * ============================================================================
 * A medição mais recente de um tipo — o que substitui a antiga coluna única.
 * ============================================================================
 *
 * PURO, sem banco. O painel mostra o histórico INTEIRO
 * (`MeasurementsSection`); o resumo do perfil público mostra só a mais
 * recente. Mesmo raciocínio de `health/summary.ts`: derivar do log garante
 * que o resumo nunca discorde da lista que o criador vê.
 *
 * Não confia na ordem em que os registros chegaram — mesmo motivo de
 * `health/summary.ts`: uma função pura que depende de um `ORDER BY` externo
 * quebra em silêncio no dia em que alguém mexe na consulta.
 */

/**
 * Compara duas medições do mesmo tipo: a "maior" é a mais recente.
 *
 * `measured_on` é ISO `yyyy-mm-dd`, comparação de string é cronológica. Empate
 * de data desempata por `id` — duas pesagens no mesmo dia são plausíveis, e
 * sem o desempate o render alternaria entre elas conforme a ordem que o
 * Postgres devolvesse.
 */
function isMoreRecent(candidate: Measurement, current: Measurement): boolean {
  if (candidate.measured_on !== current.measured_on) {
    return candidate.measured_on > current.measured_on;
  }
  return candidate.id > current.id;
}

/** A medição mais recente de `kind`, ou `null` sem nenhuma registrada. */
export function latestMeasurement(
  records: readonly Measurement[],
  kind: string,
): Measurement | null {
  let best: Measurement | null = null;

  for (const record of records) {
    if (record.kind !== kind) continue;
    if (!best || isMoreRecent(record, best)) best = record;
  }

  return best;
}
