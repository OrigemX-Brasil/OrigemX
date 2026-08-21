import { describe, expect, it } from "vitest";

import { normalizeMeasurement, validateMeasurement } from "./validation";

const HOJE = new Date("2026-08-20T12:00:00Z");

describe("normalizeMeasurement", () => {
  it("apara espaço, converte valor em número e transforma observação vazia em null", () => {
    expect(
      normalizeMeasurement({
        kind: "weight",
        value: " 4.5 ",
        measured_on: "2026-08-15",
        notes: "   ",
      }),
    ).toEqual({ kind: "weight", value: 4.5, measured_on: "2026-08-15", notes: null });
  });

  it("valor não numérico vira null", () => {
    expect(normalizeMeasurement({ kind: "weight", value: "abc" }).value).toBeNull();
  });

  it("valor vazio vira null", () => {
    expect(normalizeMeasurement({ kind: "weight", value: "" }).value).toBeNull();
  });
});

describe("validateMeasurement", () => {
  it("peso com data e valor positivo é válido", () => {
    expect(
      validateMeasurement({ kind: "weight", value: "4.5", measured_on: "2026-08-15" }, HOJE),
    ).toEqual({});
  });

  it("cernelha com data e valor positivo é válido", () => {
    expect(
      validateMeasurement(
        { kind: "withers_height", value: "45", measured_on: "2026-08-15" },
        HOJE,
      ),
    ).toEqual({});
  });

  it("tipo fora do CHECK falha", () => {
    const errors = validateMeasurement(
      { kind: "altura_total", value: "45", measured_on: "2026-08-15" },
      HOJE,
    );
    expect(errors.kind).toBeDefined();
  });

  it("valor ausente falha", () => {
    expect(validateMeasurement({ kind: "weight", measured_on: "2026-08-15" }, HOJE).value).toBeDefined();
  });

  it("valor não numérico falha", () => {
    const errors = validateMeasurement(
      { kind: "weight", value: "abc", measured_on: "2026-08-15" },
      HOJE,
    );
    expect(errors.value).toBeDefined();
  });

  it("zero e negativo falham — espelha dog_measurements_value_positive", () => {
    expect(
      validateMeasurement({ kind: "weight", value: "0", measured_on: "2026-08-15" }, HOJE).value,
    ).toBeDefined();
    expect(
      validateMeasurement({ kind: "weight", value: "-2", measured_on: "2026-08-15" }, HOJE).value,
    ).toBeDefined();
  });

  it("data é obrigatória", () => {
    expect(validateMeasurement({ kind: "weight", value: "4.5" }, HOJE).measured_on).toBeDefined();
  });

  it("data no futuro falha — pesagem não pode ser 'de amanhã'", () => {
    const errors = validateMeasurement(
      { kind: "weight", value: "4.5", measured_on: "2026-08-21" },
      HOJE,
    );
    expect(errors.measured_on).toBeDefined();
  });

  it("data que não existe no calendário falha", () => {
    const errors = validateMeasurement(
      { kind: "weight", value: "4.5", measured_on: "2026-02-31" },
      HOJE,
    );
    expect(errors.measured_on).toBeDefined();
  });
});
