/**
 * Limites da ninhada. Espelham os CHECKs/índices da migration
 * `ninhadas_do_canil.sql` — mudar um número aqui sem mudar o banco quebra o
 * upload/salvamento num ponto que só aparece em produção.
 */

/** Teto de fotos por ninhada. Espelha o índice único parcial `media_litter_position_uk`. */
export const MAX_LITTER_PHOTOS = 4;

/** Espelha o CHECK `kennel_litters_description_len`. */
export const MAX_LITTER_DESCRIPTION_LENGTH = 500;

/** Quantos caracteres do texto aparecem no card da lista, no painel. */
export const DESCRIPTION_PREVIEW_LENGTH = 140;

/** Resumo para o card: corta no espaço mais próximo do limite, sem quebrar palavra ao meio. */
export function previewDescription(description: string | null): string | null {
  if (!description) return null;
  if (description.length <= DESCRIPTION_PREVIEW_LENGTH) return description;

  const cut = description.slice(0, DESCRIPTION_PREVIEW_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
