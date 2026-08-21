import { describe, expect, it } from "vitest";

import type { Measurement } from "./queries";
import { latestMeasurement } from "./summary";

/** Fábrica curta — só os campos que o resumo lê. */
function m(id: string, kind: string, measured_on: string, value = 1): Measurement {
  return { id, dog_id: "d1", kind, value, measured_on, notes: null };
}

describe("latestMeasurement", () => {
  it("devolve a mais recente do tipo pedido", () => {
    const result = latestMeasurement(
      [
        m("1", "weight", "2026-08-01", 1.2),
        m("2", "weight", "2026-08-15", 2.4),
        m("3", "withers_height", "2026-08-10", 20),
      ],
      "weight",
    );

    expect(result).toEqual({
      id: "2",
      dog_id: "d1",
      kind: "weight",
      value: 2.4,
      measured_on: "2026-08-15",
      notes: null,
    });
  });

  it("NÃO depende da ordem da entrada", () => {
    const registros = [
      m("1", "weight", "2026-08-01", 1.2),
      m("2", "weight", "2026-08-15", 2.4),
      m("3", "weight", "2026-07-05", 0.8),
    ];

    const asc = latestMeasurement(
      [...registros].sort((a, b) => a.measured_on.localeCompare(b.measured_on)),
      "weight",
    );
    const desc = latestMeasurement(
      [...registros].sort((a, b) => b.measured_on.localeCompare(a.measured_on)),
      "weight",
    );

    expect(asc).toEqual(desc);
    expect(asc?.measured_on).toBe("2026-08-15");
  });

  it("empate de data é estável, desempatado por id", () => {
    const a = latestMeasurement(
      [m("aaa", "weight", "2026-08-12", 4), m("zzz", "weight", "2026-08-12", 5)],
      "weight",
    );
    const b = latestMeasurement(
      [m("zzz", "weight", "2026-08-12", 5), m("aaa", "weight", "2026-08-12", 4)],
      "weight",
    );

    expect(a).toEqual(b);
  });

  it("tipo sem nenhum registro devolve null", () => {
    expect(latestMeasurement([m("1", "weight", "2026-08-10")], "withers_height")).toBeNull();
  });

  it("lista vazia devolve null", () => {
    expect(latestMeasurement([], "weight")).toBeNull();
  });

  it("peso e cernelha são independentes — a mais recente de um não afeta o outro", () => {
    const registros = [
      m("1", "weight", "2026-08-20", 5),
      m("2", "withers_height", "2026-08-01", 30),
    ];

    expect(latestMeasurement(registros, "weight")?.value).toBe(5);
    expect(latestMeasurement(registros, "withers_height")?.value).toBe(30);
  });
});
