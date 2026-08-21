import { describe, expect, it } from "vitest";

import type { GeneticTest, HealthRecord } from "@/modules/health/queries";
import type { Measurement } from "@/modules/measurements/queries";

import { buildDogTimeline } from "./timeline";

function health(over: Partial<HealthRecord> & { id: string }): HealthRecord {
  return {
    dog_id: "d1",
    kind: "vaccine",
    applied_on: "2026-08-20",
    product: null,
    notes: null,
    ...over,
  };
}

function genetic(over: Partial<GeneticTest> & { id: string }): GeneticTest {
  return {
    dog_id: "d1",
    name: "Displasia coxofemoral",
    result: "A/A",
    tested_on: "2026-09-01",
    lab: null,
    ...over,
  };
}

function measurement(over: Partial<Measurement> & { id: string }): Measurement {
  return {
    dog_id: "d1",
    kind: "weight",
    value: 4.5,
    measured_on: "2026-08-20",
    notes: null,
    ...over,
  };
}

describe("buildDogTimeline", () => {
  it("sem nada, devolve lista vazia — a seção some por inteiro", () => {
    expect(
      buildDogTimeline({ bornOn: null, health: [], genetics: [], measurements: [] }),
    ).toEqual([]);
  });

  it("nascimento vira o primeiro evento", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [],
      genetics: [],
      measurements: [],
    });
    expect(linha).toHaveLength(1);
    expect(linha[0]).toMatchObject({ date: "2026-08-15", label: "Nascimento", kind: "birth" });
  });

  it("ordena cronologicamente, misturando as quatro origens", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [
        health({ id: "h2", kind: "vaccine", applied_on: "2026-09-20" }),
        health({ id: "h1", kind: "deworming", applied_on: "2026-08-25" }),
      ],
      genetics: [genetic({ id: "g1", tested_on: "2026-09-05" })],
      measurements: [measurement({ id: "m1", measured_on: "2026-08-30" })],
    });

    expect(linha.map((e) => e.date)).toEqual([
      "2026-08-15",
      "2026-08-25",
      "2026-08-30",
      "2026-09-05",
      "2026-09-20",
    ]);
  });

  it("não depende da ordem de entrada — embaralhar dá o mesmo resultado", () => {
    const registros = [
      health({ id: "h1", applied_on: "2026-09-01" }),
      health({ id: "h2", applied_on: "2026-08-20" }),
      health({ id: "h3", applied_on: "2026-10-05" }),
    ];

    const direto = buildDogTimeline({
      bornOn: "2026-08-15",
      health: registros,
      genetics: [],
      measurements: [],
    });
    const invertido = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [...registros].reverse(),
      genetics: [],
      measurements: [],
    });

    expect(direto.map((e) => e.id)).toEqual(invertido.map((e) => e.id));
  });

  it("empate de data é estável, desempatado por id", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [
        health({ id: "hb", applied_on: "2026-08-20" }),
        health({ id: "ha", applied_on: "2026-08-20" }),
      ],
      genetics: [],
      measurements: [],
    });

    expect(linha.map((e) => e.id)).toEqual(["health-ha", "health-hb"]);
  });

  /**
   * A regra central: nada entra sem data real. Laudo sem `tested_on` fica de
   * fora em vez de aparecer com uma data inventada.
   */
  it("exame SEM tested_on não entra na linha", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [],
      genetics: [genetic({ id: "g1", tested_on: null }), genetic({ id: "g2" })],
      measurements: [],
    });

    expect(linha).toHaveLength(1);
    expect(linha[0].id).toBe("genetic-g2");
  });

  it("leva o rótulo traduzido e o detalhe de cada origem", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [health({ id: "h1", kind: "deworming", product: "Drontal" })],
      genetics: [genetic({ id: "g1", name: "L2HGA", result: "Livre" })],
      measurements: [measurement({ id: "m1", kind: "weight", value: 4.5, measured_on: "2026-09-02" })],
    });

    expect(linha[0]).toMatchObject({ label: "Vermífugo", detail: "Drontal" });
    expect(linha[1]).toMatchObject({ label: "L2HGA", detail: "Livre" });
    expect(linha[2]).toMatchObject({ label: "Peso", detail: "4.5 kg" });
  });

  it("os ids são únicos entre origens — servem de key no React", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [health({ id: "x" })],
      genetics: [genetic({ id: "x" })],
      measurements: [measurement({ id: "x" })],
    });

    expect(new Set(linha.map((e) => e.id)).size).toBe(linha.length);
  });

  /**
   * "Evolução", não "valor mais recente": TODA medição entra na linha do
   * tempo, mesmo várias do mesmo tipo — é o resumo da ficha
   * (`latestMeasurement`) que mostra só a última, não a timeline.
   */
  it("toda medição do mesmo tipo entra — a evolução, não só a mais recente", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [],
      genetics: [],
      measurements: [
        measurement({ id: "m1", kind: "weight", value: 1.2, measured_on: "2026-08-01" }),
        measurement({ id: "m2", kind: "weight", value: 2.4, measured_on: "2026-08-15" }),
        measurement({ id: "m3", kind: "weight", value: 3.6, measured_on: "2026-08-29" }),
      ],
    });

    expect(linha).toHaveLength(3);
    expect(linha.map((e) => e.detail)).toEqual(["1.2 kg", "2.4 kg", "3.6 kg"]);
  });

  it("cernelha usa a unidade cm", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [],
      genetics: [],
      measurements: [
        measurement({ id: "m1", kind: "withers_height", value: 45, measured_on: "2026-08-20" }),
      ],
    });

    expect(linha[0]).toMatchObject({ label: "Cernelha", detail: "45 cm" });
  });
});
