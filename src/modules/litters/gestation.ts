/**
 * ============================================================================
 * Gestação canina — previsão de parto a partir da cobrição.
 * ============================================================================
 *
 * 63 dias é a média da espécie (a faixa real é 58-68). O criador usa isto para
 * se organizar, não como data clínica — a UI apresenta como "previsão", nunca
 * como fato.
 *
 * NÃO EXISTE COLUNA `expected_birth`, e é decisão: valor derivado guardado ao
 * lado da origem vira segunda fonte de verdade e diverge na primeira correção
 * de data. O banco guarda `mated_on`; a previsão é calculada aqui, sempre.
 *
 * Tudo em UTC. Data de calendário processada no fuso local muda de dia
 * dependendo de onde o servidor está — o mesmo cuidado que `validateBirthDate`
 * já toma com `T00:00:00Z`.
 */

/** Média da espécie, em dias. */
export const GESTATION_DAYS = 63;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "yyyy-mm-dd" → `Date` em UTC, ou `null` se a data não existe no calendário.
 *
 * `Number.isNaN(getTime())` NÃO basta, e o teste pegou isto: `new
 * Date("2026-02-31T00:00:00Z")` não é inválido — o JS normaliza em silêncio
 * para 3 de março, e a previsão sairia calculada a partir de um dia que nunca
 * existiu. O round-trip pelos componentes é o que detecta, exatamente como
 * `parseBrDate` (`modules/dogs/br-date.ts`) já faz para o campo digitado; aqui
 * a entrada vem do banco em ISO, então é a mesma armadilha por outra porta.
 */
function parseIsoDate(iso: string): Date | null {
  const m = ISO_DATE.exec(iso);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * A previsão de parto (`mated_on` + 63 dias) em ISO `yyyy-mm-dd`, ou `null`
 * quando não há cobrição registrada ou a data é inválida.
 *
 * `setUTCDate` além do fim do mês transborda sozinho para o mês seguinte, então
 * virada de mês, de ano e ano bissexto saem de graça — sem aritmética manual de
 * calendário, que é onde esse tipo de função costuma errar.
 */
export function expectedWhelpingDate(matedOn: string | null | undefined): string | null {
  if (!matedOn) return null;

  const parsed = parseIsoDate(matedOn);
  if (!parsed) return null;

  parsed.setUTCDate(parsed.getUTCDate() + GESTATION_DAYS);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Quantos dias faltam para a previsão, a partir de hoje. Negativo quando a
 * data já passou — a ninhada atrasou, ou o criador esqueceu de registrar o
 * nascimento, e a tela precisa saber a diferença para escolher a frase.
 *
 * `today` é injetável porque teste que depende do relógio da máquina é teste
 * que quebra sozinho em algum fuso.
 */
export function daysUntilWhelping(
  matedOn: string | null | undefined,
  today: Date = new Date(),
): number | null {
  const expected = expectedWhelpingDate(matedOn);
  if (!expected) return null;

  const target = new Date(`${expected}T00:00:00Z`).getTime();
  const reference = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  return Math.round((target - reference) / 86_400_000);
}
