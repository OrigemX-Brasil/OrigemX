/**
 * ============================================================================
 * Limites de saúde e exames. Espelham os CHECKs da migration
 * `ninhada_saude_e_exames_geneticos.sql`.
 * ============================================================================
 *
 * Mudar um número aqui sem mudar o banco quebra o salvamento num ponto que só
 * aparece em produção — mesmo aviso que abre `litters/constraints.ts`.
 */

/** Espelha o CHECK `dog_health_records_kind_valid`. */
export const HEALTH_KIND_OPTIONS = [
  { value: "deworming", label: "Vermífugo" },
  { value: "vaccine", label: "Vacina" },
] as const;

export type HealthKind = (typeof HEALTH_KIND_OPTIONS)[number]["value"];

export function isHealthKind(value: string): value is HealthKind {
  return HEALTH_KIND_OPTIONS.some((o) => o.value === value);
}

export function healthKindLabel(kind: string): string {
  return HEALTH_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

/**
 * SUGESTÕES, não domínio fechado. Vão para um `<datalist>`: o criador escolhe
 * uma ou digita a dele.
 *
 * O banco aceita qualquer texto de propósito — um CHECK fechado erraria na
 * primeira vacina nova e travaria quem não tem como contornar. Ver o cabeçalho
 * da migration.
 */
export const VACCINE_SUGGESTIONS = [
  "Puppy",
  "V8",
  "V10",
  "Antirrábica",
  "Giárdia",
  "Gripe canina",
] as const;

export const GENETIC_TEST_SUGGESTIONS = [
  "Displasia coxofemoral",
  "Displasia de cotovelo",
  "L2HGA",
  "HC (Catarata Hereditária)",
  "PRA (Atrofia Progressiva de Retina)",
  "Ataxia Cerebelar",
  "DM (Mielopatia Degenerativa)",
] as const;

export const GENETIC_RESULT_SUGGESTIONS = [
  "Livre",
  "Portador",
  "Afetado",
  "A/A",
  "A/B",
  "B/B",
  "C/C",
] as const;

/** Espelha `dog_health_records_product_len`. */
export const MAX_PRODUCT_LENGTH = 80;
/** Espelha `dog_health_records_notes_len`. */
export const MAX_NOTES_LENGTH = 280;
/** Espelha `dog_genetic_tests_name_len` e `dog_genetic_tests_lab_len`. */
export const MAX_TEST_NAME_LENGTH = 80;
/** Espelha `dog_genetic_tests_result_len`. */
export const MAX_TEST_RESULT_LENGTH = 40;

/**
 * Teto de linhas por cão em cada lista. NÃO existe constraint equivalente no
 * banco: é guarda contra cadastro em loop e serve de `limit` da consulta —
 * nenhuma listagem do projeto vai ao banco sem um.
 */
export const MAX_HEALTH_RECORDS_PER_DOG = 60;
export const MAX_GENETIC_TESTS_PER_DOG = 30;
