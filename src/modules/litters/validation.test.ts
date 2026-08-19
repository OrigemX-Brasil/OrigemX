import { describe, expect, it } from "vitest";

import { MAX_LITTER_DESCRIPTION_LENGTH } from "./constraints";
import { normalizeLitterInput, validateLitter } from "./validation";

/** Relógio fixo: teste que depende do dia de hoje quebra sozinho amanhã. */
const HOJE = new Date("2026-08-18T12:00:00Z");

describe("normalizeLitterInput", () => {
  it("apara espaço nas pontas", () => {
    expect(normalizeLitterInput({ description: "  Quatro filhotes.  " })).toEqual({
      description: "Quatro filhotes.",
    });
  });

  it("vazio (ou só espaço) vira null explícito — é assim que o criador APAGA", () => {
    expect(normalizeLitterInput({ description: "" })).toEqual({ description: null });
    expect(normalizeLitterInput({ mated_on: "   " })).toEqual({ mated_on: null });
  });

  it("campo AUSENTE não entra no patch — ausente não é o mesmo que apagado", () => {
    // Sem isto, um formulário que não renderiza `born_on` apagaria a data de
    // nascimento já gravada só por existir.
    expect(normalizeLitterInput({})).toEqual({});
    expect(normalizeLitterInput({ description: "x" })).toEqual({ description: "x" });
  });
});

describe("validateLitter", () => {
  it("tudo ausente é válido — os três campos são opcionais", () => {
    expect(validateLitter({}, HOJE)).toEqual({});
  });

  it("descrição no limite passa; acima falha, espelhando o CHECK", () => {
    expect(
      validateLitter({ description: "a".repeat(MAX_LITTER_DESCRIPTION_LENGTH) }, HOJE),
    ).toEqual({});

    const errors = validateLitter(
      { description: "a".repeat(MAX_LITTER_DESCRIPTION_LENGTH + 1) },
      HOJE,
    );
    expect(errors.description).toBeDefined();
  });

  it("datas reais no passado passam", () => {
    expect(validateLitter({ mated_on: "2026-06-01", born_on: "2026-08-03" }, HOJE)).toEqual({});
  });

  it("data que não existe no calendário falha", () => {
    // 31/02 é o caso que `new Date()` normalizaria em silêncio para 03/03.
    expect(validateLitter({ mated_on: "2026-02-31" }, HOJE).mated_on).toBeDefined();
    expect(validateLitter({ born_on: "2026-13-01" }, HOJE).born_on).toBeDefined();
  });

  it("data no futuro falha nas duas — as duas registram algo que já aconteceu", () => {
    expect(validateLitter({ mated_on: "2026-09-01" }, HOJE).mated_on).toBeDefined();
    expect(validateLitter({ born_on: "2026-09-01" }, HOJE).born_on).toBeDefined();
  });

  it("hoje é aceito — não é futuro", () => {
    expect(validateLitter({ mated_on: "2026-08-18" }, HOJE)).toEqual({});
  });

  it("nascimento antes da cobrição falha, espelhando kennel_litters_born_after_mated", () => {
    const errors = validateLitter({ mated_on: "2026-06-01", born_on: "2026-05-01" }, HOJE);
    expect(errors.born_on).toBeDefined();
  });

  it("mesma data nas duas passa — o CHECK do banco é >=, não >", () => {
    expect(validateLitter({ mated_on: "2026-06-01", born_on: "2026-06-01" }, HOJE)).toEqual({});
  });

  it("ordenação não é acusada sobre data que nem existe", () => {
    // Duas mensagens no mesmo campo confundiriam: a de formato tem precedência.
    const errors = validateLitter({ mated_on: "2026-02-31", born_on: "2026-01-01" }, HOJE);
    expect(errors.mated_on).toBeDefined();
    expect(errors.born_on).toBeUndefined();
  });
});
