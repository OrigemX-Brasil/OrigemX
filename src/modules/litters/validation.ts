import type { Database } from "@/lib/types/database";

import { MAX_LITTER_DESCRIPTION_LENGTH } from "./constraints";
import { LITTER_FIELDS, LITTER_STATUS_OPTIONS, type LitterFieldName } from "./fields";

/**
 * Validação da ninhada. Roda no client (feedback imediato) e de novo na Server
 * Action — a do client é conveniência, quem vale é a do servidor, e os CHECKs
 * do banco são a última linha.
 *
 * As regras de FORMA vêm de `fields.ts`; as de NEGÓCIO (data no futuro,
 * nascimento antes da cobrição) ficam aqui, porque não cabem numa descrição de
 * campo — dependem de outro campo ou do relógio.
 */

export type LitterInput = Partial<Record<LitterFieldName, string>>;
export type FieldErrors = Partial<Record<LitterFieldName, string>>;
export type LitterPatch = Database["public"]["Tables"]["kennel_litters"]["Update"];

/** Espaço nas pontas some; campo vazio vira `null` explícito — é assim que o
 *  criador APAGA uma data que preencheu antes. */
export function normalizeLitterInput(raw: LitterInput): LitterPatch {
  const out: LitterPatch = {};

  for (const field of LITTER_FIELDS) {
    const value = raw[field.name];
    if (value === undefined) continue;

    const trimmed = value.trim();
    (out as Record<string, string | null>)[field.name] = trimmed.length > 0 ? trimmed : null;
  }

  return out;
}

/**
 * Data de calendário que existe de verdade.
 *
 * `Number.isNaN(getTime())` não basta: `new Date("2026-02-31T00:00:00Z")` não é
 * inválido, o JS normaliza para 3 de março em silêncio. O round-trip pelos
 * componentes é o que pega — mesma checagem de `parseBrDate`
 * (`modules/dogs/br-date.ts`) e de `gestation.ts`.
 */
function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
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
 * Data no futuro é erro de digitação, tanto para cobrição quanto para
 * nascimento: as duas registram algo que JÁ aconteceu.
 *
 * Não existe CHECK equivalente no banco, e é deliberado — `current_date` não é
 * imutável e constraint que depende do relógio quebra restauração de dump. O
 * mesmo raciocínio já documentado em `validateBirthDate` (modules/dogs).
 */
function validateEventDate(value: string, label: string, today: Date): string | null {
  const parsed = parseIsoDate(value);
  if (!parsed) return "Data inválida — confira dia e mês.";

  const limite = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (parsed.getTime() > limite) return `${label} não pode estar no futuro.`;

  if (parsed.getUTCFullYear() < 1900) return "Data anterior a 1900.";

  return null;
}

/** `today` é injetável: teste que depende do relógio da máquina quebra sozinho. */
export function validateLitter(raw: LitterInput, today: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  const values = normalizeLitterInput(raw);

  const description = values.description;
  if (description && description.length > MAX_LITTER_DESCRIPTION_LENGTH) {
    errors.description = `A descrição deve ter no máximo ${MAX_LITTER_DESCRIPTION_LENGTH} caracteres.`;
  }

  // Comprimento de `name` e `breed`, espelhando `kennel_litters_name_len` e
  // `kennel_litters_breed_len`. Sem isto o excesso só apareceria como erro cru
  // do Postgres — e o `maxLength` do `<input>` é do CLIENT, que um POST direto
  // pula. Nenhum dos dois é exigido: fazem parte do mínimo, não do schema.
  for (const field of LITTER_FIELDS) {
    if (field.input !== "text" || !field.maxLength) continue;
    const value = values[field.name];
    if (typeof value === "string" && value.length > field.maxLength) {
      errors[field.name] =
        `${field.label} deve ter no máximo ${field.maxLength} caracteres.`;
    }
  }

  // O status é lista fechada no banco (`kennel_litters_status_valid`). O
  // `<select>` só oferece os três, mas quem manda POST direto não passa por ele
  // — e 23514 na cara do criador não explica nada.
  const status = values.status;
  if (status && !LITTER_STATUS_OPTIONS.some((o) => o.value === status)) {
    errors.status = "Status inválido.";
  }

  const matedOn = values.mated_on;
  const bornOn = values.born_on;

  if (matedOn) {
    const error = validateEventDate(matedOn, "A data da cobrição", today);
    if (error) errors.mated_on = error;
  }

  if (bornOn) {
    const error = validateEventDate(bornOn, "A data de nascimento", today);
    if (error) errors.born_on = error;
  }

  // Espelha o CHECK `kennel_litters_born_after_mated`. Só roda quando as duas
  // datas passaram na checagem individual — acusar ordenação de uma data que
  // nem existe confundiria mais do que ajuda.
  if (matedOn && bornOn && !errors.mated_on && !errors.born_on && bornOn < matedOn) {
    errors.born_on = "O nascimento não pode ser anterior à cobrição.";
  }

  return errors;
}
