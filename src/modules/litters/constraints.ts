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

/**
 * Status do filhote dentro da ninhada. Espelha o CHECK
 * `dogs_litter_status_valid`. Valor em inglês no banco (como `dogs.sex` e
 * `dog_identifiers.kind`), rótulo em português na tela.
 */
export const LITTER_STATUS_OPTIONS = [
  { value: "available", label: "Disponível" },
  { value: "reserved", label: "Reservado" },
  { value: "sold", label: "Vendido" },
] as const;

export type LitterStatus = (typeof LITTER_STATUS_OPTIONS)[number]["value"];

export function litterStatusLabel(status: string | null): string | null {
  return LITTER_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? null;
}

export function isLitterStatus(value: string): value is LitterStatus {
  return LITTER_STATUS_OPTIONS.some((o) => o.value === value);
}

/**
 * Teto do preço. `dogs.price_brl` é `numeric(10,2)`, que comportaria oito
 * dígitos inteiros; o limite aqui é MENOR de propósito — um filhote de R$ 10
 * milhões é dedo escorregando no teclado, não venda. O CHECK do banco garante
 * só o que é impossível (zero ou negativo); este número é julgamento de
 * produto e por isso mora na aplicação.
 */
export const MAX_PUPPY_PRICE_BRL = 999_999.99;

/**
 * Teto de filhotes por ninhada. NÃO existe constraint equivalente no banco: ao
 * contrário do limite de 4 fotos (que é índice único parcial), aqui não há
 * coluna de posição para prender, e ninhada canina não tem número máximo
 * biológico redondo. É guarda contra cadastro em loop, checada na action.
 */
export const MAX_PUPPIES_PER_LITTER = 20;

/** Resumo para o card: corta no espaço mais próximo do limite, sem quebrar palavra ao meio. */
export function previewDescription(description: string | null): string | null {
  if (!description) return null;
  if (description.length <= DESCRIPTION_PREVIEW_LENGTH) return description;

  const cut = description.slice(0, DESCRIPTION_PREVIEW_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
