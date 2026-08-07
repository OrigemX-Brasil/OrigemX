import { describe, expect, it } from "vitest";

import { normalizeIdentifierInput, validateIdentifiers } from "./identifiers";

describe("normalizeIdentifierInput", () => {
  it("apara espaço e vira null quando vazio", () => {
    expect(normalizeIdentifierInput({ registration_value: "  123456  " }).registration_value).toBe(
      "123456",
    );
    expect(normalizeIdentifierInput({ registration_value: "   " }).registration_value).toBeNull();
    expect(normalizeIdentifierInput({}).microchip_value).toBeNull();
  });
});

describe("validateIdentifiers", () => {
  it("aceita tudo em branco — os dois identificadores são opcionais", () => {
    expect(validateIdentifiers({})).toEqual({});
  });

  it("aceita registro completo, com emissor", () => {
    expect(
      validateIdentifiers({ registration_value: "123456", registration_issuer: "CBKC" }),
    ).toEqual({});
  });

  it("exige emissor quando o número de registro é informado", () => {
    const errors = validateIdentifiers({ registration_value: "123456" });
    expect(errors.registration_issuer).toBeDefined();
  });

  it("não exige número quando só o emissor foi digitado por engano", () => {
    // Emissor sem número não aciona a regra do banco (que só olha o par
    // completo do lado do número) — não há nada para deduplicar ainda.
    const errors = validateIdentifiers({ registration_issuer: "CBKC" });
    expect(errors.registration_issuer).toBeUndefined();
  });

  it("aceita microchip sozinho, sem registro", () => {
    expect(validateIdentifiers({ microchip_value: "981000000000000" })).toEqual({});
  });

  it("recusa campos acima do limite de tamanho", () => {
    expect(validateIdentifiers({ registration_value: "1".repeat(61) }).registration_value).toBeDefined();
    expect(
      validateIdentifiers({
        registration_value: "1",
        registration_issuer: "a".repeat(61),
      }).registration_issuer,
    ).toBeDefined();
    expect(validateIdentifiers({ microchip_value: "9".repeat(61) }).microchip_value).toBeDefined();
  });
});
