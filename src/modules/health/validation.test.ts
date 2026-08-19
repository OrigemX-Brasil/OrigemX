import { describe, expect, it } from "vitest";

import { MAX_TEST_RESULT_LENGTH } from "./constraints";
import {
  normalizeGeneticTest,
  normalizeHealthRecord,
  validateGeneticTest,
  validateHealthRecord,
} from "./validation";

const HOJE = new Date("2026-08-18T12:00:00Z");

describe("normalizeHealthRecord", () => {
  it("apara espaço e transforma campo vazio em null", () => {
    expect(
      normalizeHealthRecord({
        kind: "vaccine",
        applied_on: "2026-08-12",
        product: "  V10  ",
        notes: "   ",
      }),
    ).toEqual({ kind: "vaccine", applied_on: "2026-08-12", product: "V10", notes: null });
  });
});

describe("validateHealthRecord", () => {
  it("vermífugo com data e sem marca é válido — a marca é opcional", () => {
    expect(validateHealthRecord({ kind: "deworming", applied_on: "2026-08-10" }, HOJE)).toEqual({});
  });

  it("vacina SEM tipo falha, espelhando dog_health_records_vaccine_needs_product", () => {
    const errors = validateHealthRecord({ kind: "vaccine", applied_on: "2026-08-12" }, HOJE);
    expect(errors.product).toBeDefined();
  });

  it("vacina com tipo passa", () => {
    expect(
      validateHealthRecord({ kind: "vaccine", applied_on: "2026-08-12", product: "V10" }, HOJE),
    ).toEqual({});
  });

  it("tipo fora do CHECK falha", () => {
    const errors = validateHealthRecord({ kind: "cirurgia", applied_on: "2026-08-12" }, HOJE);
    expect(errors.kind).toBeDefined();
  });

  it("data é obrigatória", () => {
    expect(validateHealthRecord({ kind: "deworming" }, HOJE).applied_on).toBeDefined();
  });

  it("data no futuro falha", () => {
    const errors = validateHealthRecord({ kind: "deworming", applied_on: "2026-09-01" }, HOJE);
    expect(errors.applied_on).toBeDefined();
  });

  it("data que não existe no calendário falha", () => {
    const errors = validateHealthRecord({ kind: "deworming", applied_on: "2026-02-31" }, HOJE);
    expect(errors.applied_on).toBeDefined();
  });
});

describe("validateGeneticTest", () => {
  it("exame com nome e resultado é válido; data e laboratório são opcionais", () => {
    expect(validateGeneticTest({ name: "L2HGA", result: "Livre" }, HOJE)).toEqual({});
  });

  it("exame sem resultado falha — a coluna é NOT NULL por esta razão", () => {
    expect(validateGeneticTest({ name: "L2HGA" }, HOJE).result).toBeDefined();
  });

  it("exame sem nome falha", () => {
    expect(validateGeneticTest({ result: "Livre" }, HOJE).name).toBeDefined();
  });

  it("resultado acima do limite falha", () => {
    const errors = validateGeneticTest(
      { name: "Displasia", result: "a".repeat(MAX_TEST_RESULT_LENGTH + 1) },
      HOJE,
    );
    expect(errors.result).toBeDefined();
  });

  it("aceita grau e estado — o formato varia por exame, e o banco é texto livre", () => {
    expect(validateGeneticTest({ name: "Displasia coxofemoral", result: "A/A" }, HOJE)).toEqual({});
    expect(validateGeneticTest({ name: "HC", result: "Portador" }, HOJE)).toEqual({});
  });

  it("data do exame no futuro falha", () => {
    const errors = validateGeneticTest(
      { name: "L2HGA", result: "Livre", tested_on: "2027-01-01" },
      HOJE,
    );
    expect(errors.tested_on).toBeDefined();
  });
});

describe("normalizeGeneticTest", () => {
  it("laboratório em branco vira null, não string vazia", () => {
    expect(normalizeGeneticTest({ name: "L2HGA", result: "Livre", lab: "  " }).lab).toBeNull();
  });
});
