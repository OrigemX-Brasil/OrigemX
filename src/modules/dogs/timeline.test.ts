import { describe, expect, it } from "vitest";

import type { GeneticTest, HealthRecord } from "@/modules/health/queries";

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

describe("buildDogTimeline", () => {
  it("sem nada, devolve lista vazia — a seção some por inteiro", () => {
    expect(buildDogTimeline({ bornOn: null, health: [], genetics: [] })).toEqual([]);
  });

  it("nascimento vira o primeiro evento", () => {
    const linha = buildDogTimeline({ bornOn: "2026-08-15", health: [], genetics: [] });
    expect(linha).toHaveLength(1);
    expect(linha[0]).toMatchObject({ date: "2026-08-15", label: "Nascimento", kind: "birth" });
  });

  it("ordena cronologicamente, misturando as três origens", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [
        health({ id: "h2", kind: "vaccine", applied_on: "2026-09-20" }),
        health({ id: "h1", kind: "deworming", applied_on: "2026-08-25" }),
      ],
      genetics: [genetic({ id: "g1", tested_on: "2026-09-05" })],
    });

    expect(linha.map((e) => e.date)).toEqual([
      "2026-08-15",
      "2026-08-25",
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

    const direto = buildDogTimeline({ bornOn: "2026-08-15", health: registros, genetics: [] });
    const invertido = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [...registros].reverse(),
      genetics: [],
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
    });

    expect(linha).toHaveLength(1);
    expect(linha[0].id).toBe("genetic-g2");
  });

  it("leva o rótulo traduzido e o detalhe de cada origem", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [health({ id: "h1", kind: "deworming", product: "Drontal" })],
      genetics: [genetic({ id: "g1", name: "L2HGA", result: "Livre" })],
    });

    expect(linha[0]).toMatchObject({ label: "Vermífugo", detail: "Drontal" });
    expect(linha[1]).toMatchObject({ label: "L2HGA", detail: "Livre" });
  });

  it("os ids são únicos entre origens — servem de key no React", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [health({ id: "x" })],
      genetics: [genetic({ id: "x" })],
    });

    expect(new Set(linha.map((e) => e.id)).size).toBe(linha.length);
  });
});
