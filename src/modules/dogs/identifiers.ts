/**
 * ============================================================================
 * Identificação do cão — RG (registro) e microchip.
 * ============================================================================
 *
 * Vive em `dog_identifiers`, tabela à parte de `dogs`: um cão pode ter mais de
 * um identificador do mesmo tipo ao longo da vida (reregistrado, rechipado), e
 * o schema já suporta isso com `is_primary`. Esta tela gerencia só o principal
 * de cada tipo — é o que o pedido cobre por enquanto.
 *
 * NUNCA aparece no perfil público: `dog_identifiers` não tem grant para `anon`
 * (ver migration `20260731194105_rls_policies.sql`), então isso é garantido no
 * banco, antes mesmo da RLS — não depende de nenhuma query aqui filtrar certo.
 *
 * O emissor é OBRIGATÓRIO junto com o número de registro porque o banco já
 * exige isso (`dog_identifiers_issuer_required`): "123456" da CBKC e "123456"
 * da FCI são cães diferentes, e sem emissor a deduplicação não tem como
 * distinguir um do outro. Esta validação só adianta no client o que o INSERT
 * recusaria de qualquer forma.
 */

export type IdentifierInput = {
  registration_value?: string;
  registration_issuer?: string;
  microchip_value?: string;
};

export type IdentifierErrors = Partial<Record<keyof IdentifierInput, string>>;

export type NormalizedIdentifiers = {
  registration_value: string | null;
  registration_issuer: string | null;
  microchip_value: string | null;
};

const MAX_VALUE_LENGTH = 60;
const MAX_ISSUER_LENGTH = 60;

/** Espaço nas pontas some; campo vazio vira null explícito. */
export function normalizeIdentifierInput(raw: IdentifierInput): NormalizedIdentifiers {
  const clean = (value: string | undefined): string | null => {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    registration_value: clean(raw.registration_value),
    registration_issuer: clean(raw.registration_issuer),
    microchip_value: clean(raw.microchip_value),
  };
}

export function validateIdentifiers(raw: IdentifierInput): IdentifierErrors {
  const errors: IdentifierErrors = {};
  const values = normalizeIdentifierInput(raw);

  if (values.registration_value && values.registration_value.length > MAX_VALUE_LENGTH) {
    errors.registration_value = `O número de registro deve ter no máximo ${MAX_VALUE_LENGTH} caracteres.`;
  }

  // Espelha o CHECK do banco: número sem emissor não identifica nada.
  if (values.registration_value && !values.registration_issuer) {
    errors.registration_issuer =
      "Informe a entidade emissora (CBKC, FCI...) junto com o número de registro.";
  }

  if (values.registration_issuer && values.registration_issuer.length > MAX_ISSUER_LENGTH) {
    errors.registration_issuer = `A entidade emissora deve ter no máximo ${MAX_ISSUER_LENGTH} caracteres.`;
  }

  if (values.microchip_value && values.microchip_value.length > MAX_VALUE_LENGTH) {
    errors.microchip_value = `O número do microchip deve ter no máximo ${MAX_VALUE_LENGTH} caracteres.`;
  }

  return errors;
}
