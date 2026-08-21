import { describe, expect, it } from "vitest";

import { DOG_FIELDS } from "./fields";
import { normalizeDogInput, validateDog } from "./validation";

/**
 * `titles` (input "list") é o único campo cujo `DogPatch` não é string — o
 * resto da suíte de `dogs` já cobre a cadeia inteiramente string-based.
 *
 * Peso e cernelha saíram de `DOG_FIELDS` (viraram histórico datado em
 * `modules/measurements/`) — a cobertura de campo numérico genérico continua
 * em `dog-form.tsx`/`validation.ts` via este mesmo mecanismo, só sem um
 * campo real de `dogs` para exercitá-lo hoje.
 */
const LIST_FIELDS = DOG_FIELDS.filter((f) => f.input === "list");

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
