import { describe, expect, it } from "vitest";

import { ELBOW, GENERATIONS, MAX_PHOTO_GENERATION, PREVIEW_GENERATIONS, treeWidth } from "./layout";

describe("layout — geometria da árvore em colunas", () => {
  it("a faixa de cada geração (exceto a 0) é o card mais o cotovelo", () => {
    GENERATIONS.forEach((gen, g) => {
      if (g === 0) {
        expect(gen.band).toBe(gen.card);
      } else {
        expect(gen.band).toBe(gen.card + ELBOW);
      }
    });
  });

  it("treeWidth soma exatamente as faixas até a profundidade pedida", () => {
    const somaManual = (depth: number) =>
      GENERATIONS.slice(0, depth + 1).reduce((acc, gen) => acc + gen.band, 0);

    for (let depth = 0; depth < GENERATIONS.length; depth += 1) {
      expect(treeWidth(depth)).toBe(somaManual(depth));
    }
  });

  it("treeWidth da árvore cheia (5 gerações) é a soma de todas as faixas", () => {
    const total = GENERATIONS.reduce((acc, gen) => acc + gen.band, 0);
    expect(treeWidth(5)).toBe(total);
  });

  it("profundidade além do array não estoura — soma só o que existe", () => {
    expect(treeWidth(99)).toBe(treeWidth(GENERATIONS.length - 1));
  });

  it("há um rótulo para toda geração de 0 a 5", () => {
    expect(GENERATIONS).toHaveLength(6);
    for (const gen of GENERATIONS) expect(gen.label.length).toBeGreaterThan(0);
  });

  it("foto só até MAX_PHOTO_GENERATION", () => {
    GENERATIONS.forEach((gen, g) => {
      expect(gen.photo).toBe(g <= MAX_PHOTO_GENERATION);
    });
  });

  it("a variante preview tem a mesma regra de faixa, escala menor", () => {
    expect(PREVIEW_GENERATIONS).toHaveLength(2);
    expect(PREVIEW_GENERATIONS[0]!.band).toBe(PREVIEW_GENERATIONS[0]!.card);
    expect(PREVIEW_GENERATIONS[1]!.band).toBeGreaterThan(PREVIEW_GENERATIONS[1]!.card);
  });
});
