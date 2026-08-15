import { describe, expect, it } from "vitest";

import { DOG_FIELDS } from "./fields";
import { normalizeDogInput, validateDog } from "./validation";

/**
 * `weight_kg`, `withers_height_cm` (input "number") e `titles` (input "list")
 * são os únicos campos cujo `DogPatch` não é string — o resto da suíte de
 * `dogs` já cobre a cadeia inteiramente string-based.
 */
const NUMERIC_FIELDS = DOG_FIELDS.filter((f) => f.input === "number");
const LIST_FIELDS = DOG_FIELDS.filter((f) => f.input === "list");

describe("normalizeDogInput — campos numéricos", () => {
  it("converte string em número", () => {
    const out = normalizeDogInput({ weight_kg: "4.5" }, NUMERIC_FIELDS);
    expect(out.weight_kg).toBe(4.5);
  });

  it("string vazia vira null, campo é opcional", () => {
    const out = normalizeDogInput({ weight_kg: "" }, NUMERIC_FIELDS);
    expect(out.weight_kg).toBeNull();
  });
});

describe("normalizeDogInput — campo de lista (titles)", () => {
  it("quebra por linha, descartando linha em branco", () => {
    const out = normalizeDogInput(
      { titles: "Campeão Nacional\n\nCampeão Internacional\n" },
      LIST_FIELDS,
    );
    expect(out.titles).toEqual(["Campeão Nacional", "Campeão Internacional"]);
  });

  it("string vazia vira null", () => {
    const out = normalizeDogInput({ titles: "" }, LIST_FIELDS);
    expect(out.titles).toBeNull();
  });

  it("só linhas em branco também vira null", () => {
    const out = normalizeDogInput({ titles: "\n  \n" }, LIST_FIELDS);
    expect(out.titles).toBeNull();
  });
});

describe("validateDog — campos numéricos", () => {
  it("aceita número positivo", () => {
    expect(validateDog({ weight_kg: "4.5" }, NUMERIC_FIELDS)).toEqual({});
  });

  it("rejeita valor não numérico", () => {
    const errors = validateDog({ weight_kg: "abc" }, NUMERIC_FIELDS);
    expect(errors.weight_kg).toMatch(/número maior que zero/);
  });

  it("rejeita zero e negativo", () => {
    expect(validateDog({ weight_kg: "0" }, NUMERIC_FIELDS).weight_kg).toBeDefined();
    expect(validateDog({ weight_kg: "-2" }, NUMERIC_FIELDS).weight_kg).toBeDefined();
  });

  it("campo vazio não gera erro — é opcional", () => {
    expect(validateDog({ weight_kg: "" }, NUMERIC_FIELDS)).toEqual({});
  });
});

describe("validateDog — campo de lista (titles)", () => {
  it("aceita títulos dentro do limite por item", () => {
    expect(validateDog({ titles: "Campeão Nacional" }, LIST_FIELDS)).toEqual({});
  });

  it("rejeita item individual acima do maxLength", () => {
    const field = LIST_FIELDS[0];
    const longo = "x".repeat((field.maxLength ?? 80) + 1);
    const errors = validateDog({ titles: longo }, LIST_FIELDS);
    expect(errors.titles).toMatch(/no máximo/);
  });

  it("lista vazia não gera erro — é opcional", () => {
    expect(validateDog({ titles: "" }, LIST_FIELDS)).toEqual({});
  });
});
