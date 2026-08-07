/**
 * ============================================================================
 * Conversão pt-BR ⇄ ISO para o campo de nascimento. Puro, sem DOM.
 * ============================================================================
 *
 * Só checagem ESTRUTURAL aqui: dia e mês existem de verdade num calendário
 * real (rejeita 31/02, que o `Date` do JS "corrigiria" em silêncio para 3 de
 * março), e o ano tem 4 dígitos. A decisão de NEGÓCIO — data no futuro,
 * anterior a 1900 — continua exclusivamente em `validateBirthDate`
 * (`./validation.ts`), chamada do mesmo jeito que antes. Este arquivo não
 * repete nem se aproxima dessa regra.
 */

const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * "dd/mm/aaaa" → "yyyy-mm-dd", ou `null` se não for uma data real.
 *
 * O round-trip pelo `Date` é o que pega dia inexistente no mês: `new
 * Date(2020, 1, 31)` normaliza sozinho para 3 de março, e comparar os
 * componentes de volta é como isso é detectado — sem essa comparação, 31/02
 * viraria silenciosamente 03/03.
 */
export function parseBrDate(text: string): string | null {
  const m = BR_DATE.exec(text.trim());
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const pad = (n: number, len: number) => String(n).padStart(len, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** "yyyy-mm-dd" → "dd/mm/aaaa", para preencher o campo a partir do banco. */
export function isoToBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Máscara "enquanto digita". Só dígito entra; a barra é inserida sozinha
 * depois do dia e depois do mês. Corta em 8 dígitos — não dá para digitar um
 * nono.
 *
 * Aceita colar um valor com barras também: `\D` remove tudo que não é
 * dígito antes de remontar, então colar "05/03/2020" passa pelo mesmo
 * caminho que digitar os oito números um a um.
 */
export function maskBrDateDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter((part) => part.length > 0).join("/");
}
