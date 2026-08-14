import { describe, expect, it } from "vitest";

import { MAX_LITTER_DESCRIPTION_LENGTH } from "./constraints";
import { normalizeLitterInput, validateLitter } from "./validation";

describe("normalizeLitterInput", () => {
  it("apara espaço nas pontas", () => {
    expect(normalizeLitterInput({ description: "  Quatro filhotes.  " })).toEqual({
      description: "Quatro filhotes.",
    });
  });

  it("vazio (ou só espaço) vira null explícito — não string vazia", () => {
    expect(normalizeLitterInput({ description: "" })).toEqual({ description: null });
    expect(normalizeLitterInput({ description: "   " })).toEqual({ description: null });
    expect(normalizeLitterInput({})).toEqual({ description: null });
  });
});

describe("validateLitter", () => {
  it("descrição ausente é válida — o campo é opcional", () => {
    expect(validateLitter({})).toEqual({});
  });

  it("descrição dentro do limite é válida", () => {
    expect(validateLitter({ description: "a".repeat(MAX_LITTER_DESCRIPTION_LENGTH) })).toEqual({});
  });

  it("descrição acima do limite falha, espelhando o CHECK kennel_litters_description_len", () => {
    const errors = validateLitter({ description: "a".repeat(MAX_LITTER_DESCRIPTION_LENGTH + 1) });
    expect(errors.description).toBeDefined();
  });
});
