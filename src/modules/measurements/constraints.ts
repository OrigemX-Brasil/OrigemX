/**
 * ============================================================================
 * Limites de medição. Espelham os CHECKs da migration `medidas_do_cao`.
 * ============================================================================
 *
 * Mudar um número aqui sem mudar o banco quebra o salvamento num ponto que só
 * aparece em produção — mesmo aviso que abre `health/constraints.ts`.
 */

/** Espelha o CHECK `dog_measurements_kind_valid`. A unidade é implícita no tipo. */
export const MEASUREMENT_KIND_OPTIONS = [
  { value: "weight", label: "Peso (kg)" },
  { value: "withers_height", label: "Cernelha (cm)" },
] as const;

export type MeasurementKind = (typeof MEASUREMENT_KIND_OPTIONS)[number]["value"];

export function isMeasurementKind(value: string): value is MeasurementKind {
  return MEASUREMENT_KIND_OPTIONS.some((o) => o.value === value);
}

export function measurementKindLabel(kind: string): string {
  return MEASUREMENT_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

/** "Peso" ou "Cernelha", sem a unidade entre parênteses — para rótulo de evento
 *  da timeline e da história, onde a unidade já vai junto no detalhe. */
export function measurementKindName(kind: string): string {
  return kind === "weight" ? "Peso" : kind === "withers_height" ? "Cernelha" : kind;
}

export function measurementUnit(kind: string): string {
  return kind === "weight" ? "kg" : kind === "withers_height" ? "cm" : "";
}

/** Espelha `dog_measurements_notes_len`. */
export const MAX_NOTES_LENGTH = 280;

/**
 * Teto de linhas por cão, somando os dois tipos — mesmo desenho de
 * `MAX_HEALTH_RECORDS_PER_DOG`: guarda contra cadastro em loop, sem constraint
 * equivalente no banco.
 */
export const MAX_MEASUREMENTS_PER_DOG = 60;
