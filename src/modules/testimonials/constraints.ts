/**
 * ============================================================================
 * Limites de depoimento. Espelham os CHECKs da migration `depoimentos_do_canil`.
 * ============================================================================
 *
 * Mudar um número aqui sem mudar o banco quebra o salvamento num ponto que só
 * aparece em produção — mesmo aviso que abre `litters/constraints.ts` e
 * `health/constraints.ts`.
 */

/** Espelha `testimonials_author_name_len`. */
export const MAX_AUTHOR_NAME_LENGTH = 80;
/** Espelha `testimonials_text_len`. */
export const MAX_TESTIMONIAL_TEXT_LENGTH = 600;

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/**
 * Teto de depoimentos por canil. NÃO existe constraint equivalente no banco:
 * é guarda contra cadastro em loop e serve de `limit` da consulta — nenhuma
 * listagem do projeto vai ao banco sem um.
 */
export const MAX_TESTIMONIALS_PER_KENNEL = 30;
