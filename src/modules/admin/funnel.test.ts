import { describe, expect, it } from "vitest";

import { formatRate } from "@/modules/capture/events";

import { buildFunnel, type FunnelCounts } from "./funnel";

/**
 * A regra que mais importa aqui é a do DENOMINADOR ZERO: taxa sem base é
 * `null`, nunca 0. É a mesma convenção de `SourceRollup.rate`, e é o que faz a
 * tela imprimir "—" em vez de afirmar 0% num sistema onde ninguém se cadastrou
 * ainda.
 */

const base: FunnelCounts = {
  total: 100,
  withKennel: 80,
  withDog: 60,
  withPublishedDog: 30,
  withKennelNoDog: 25,
};

describe("buildFunnel", () => {
  it("mede cada etapa contra o TOTAL, não contra a etapa anterior", () => {
    const f = buildFunnel(base);
    const porChave = Object.fromEntries(f.stages.map((s) => [s.key, s.rate]));

    expect(porChave.total).toBe(1);
    expect(porChave.kennel).toBeCloseTo(0.8);
    // 60/100, e NÃO 60/80: o funil não é aninhado, então medir contra "com
    // canil" contaria como conversão quem nunca teve canil.
    expect(porChave.dog).toBeCloseTo(0.6);
    expect(porChave.published).toBeCloseTo(0.3);
  });

  it("a métrica principal é a fatia de criadores com o primeiro cão", () => {
    expect(buildFunnel(base).activationRate).toBeCloseTo(0.6);
  });

  it("a única taxa em cadeia é cão → cão publicado", () => {
    // 30 de 60 = 50%, e esta SIM é aninhada: todo cão publicado é um cão.
    expect(buildFunnel(base).publishedOfWithDog).toBeCloseTo(0.5);
  });

  describe("denominador zero", () => {
    const vazio: FunnelCounts = {
      total: 0,
      withKennel: 0,
      withDog: 0,
      withPublishedDog: 0,
      withKennelNoDog: 0,
    };

    it("sem criador nenhum, toda taxa é null — nunca 0", () => {
      const f = buildFunnel(vazio);

      for (const stage of f.stages) expect(stage.rate, stage.key).toBeNull();
      expect(f.activationRate).toBeNull();
      expect(f.publishedOfWithDog).toBeNull();
    });

    it("com criadores mas nenhum cão, a taxa aninhada é null e a principal é 0", () => {
      // A distinção importa: "0% cadastrou cão" é um fato medido; "publicaram
      // de zero que têm cão" não é fato nenhum, é divisão sem base.
      const f = buildFunnel({ ...vazio, total: 10 });

      expect(f.activationRate).toBe(0);
      expect(f.publishedOfWithDog).toBeNull();
    });

    it("null vira travessão na tela, não 0%", () => {
      expect(formatRate(buildFunnel(vazio).activationRate)).toBe("—");
      expect(formatRate(buildFunnel({ ...vazio, total: 10 }).activationRate)).toBe("0.0%");
    });
  });

  it("toda taxa fica entre 0 e 1 em qualquer combinação plausível", () => {
    const combinacoes: FunnelCounts[] = [
      base,
      { total: 1, withKennel: 1, withDog: 1, withPublishedDog: 1, withKennelNoDog: 0 },
      { total: 7, withKennel: 0, withDog: 3, withPublishedDog: 0, withKennelNoDog: 0 },
      { total: 1000, withKennel: 999, withDog: 1, withPublishedDog: 1, withKennelNoDog: 998 },
    ];

    for (const counts of combinacoes) {
      const f = buildFunnel(counts);
      for (const stage of f.stages) {
        if (stage.rate === null) continue;
        expect(stage.rate, stage.key).toBeGreaterThanOrEqual(0);
        expect(stage.rate, stage.key).toBeLessThanOrEqual(1);
      }
    }
  });

  it("cão sem canil não quebra a conta — o funil não supõe aninhamento", () => {
    // 3 criadores com cão, nenhum com canil. Num funil clássico isto seria
    // 3/0 e estouraria; aqui cada etapa tem o total como base.
    const f = buildFunnel({
      total: 10,
      withKennel: 0,
      withDog: 3,
      withPublishedDog: 2,
      withKennelNoDog: 0,
    });

    expect(f.activationRate).toBeCloseTo(0.3);
    expect(f.publishedOfWithDog).toBeCloseTo(2 / 3);
    expect(f.stages.find((s) => s.key === "kennel")!.rate).toBe(0);
  });

  it("repassa a evasão acionável sem recalcular", () => {
    // Vem contada do banco: derivá-la aqui (`withKennel - withDog`) daria
    // número errado justamente porque os dois conjuntos se sobrepõem sem se
    // conterem.
    expect(buildFunnel(base).withKennelNoDog).toBe(25);
  });
});
