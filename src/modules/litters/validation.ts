import { MAX_LITTER_DESCRIPTION_LENGTH } from "./constraints";

/**
 * Validação da ninhada. Um campo só (`description`), então sem a máquina
 * declarativa de `fields.ts` que `kennels`/`dogs` usam para várias — seria
 * abstração que este formulário não precisa.
 *
 * Roda no client (feedback imediato) e de novo na Server Action — a do
 * client é conveniência, quem vale é a do servidor, e o CHECK do banco é a
 * última linha.
 */

export type LitterInput = { description?: string };
export type FieldErrors = { description?: string };

/** Espaço nas pontas some; campo vazio vira `null` — mesma regra de `normalizeKennelInput`. */
export function normalizeLitterInput(raw: LitterInput): { description: string | null } {
  const trimmed = (raw.description ?? "").trim();
  return { description: trimmed.length > 0 ? trimmed : null };
}

export function validateLitter(raw: LitterInput): FieldErrors {
  const { description } = normalizeLitterInput(raw);
  if (description && description.length > MAX_LITTER_DESCRIPTION_LENGTH) {
    return {
      description: `A descrição deve ter no máximo ${MAX_LITTER_DESCRIPTION_LENGTH} caracteres.`,
    };
  }
  return {};
}
