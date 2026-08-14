import { describe, expect, it } from "vitest";

import {
  ELBOW,
  GENERATIONS,
  MAX_PHOTO_GENERATION,
  PREVIEW_GENERATIONS,
  TREE_VIEWPORT,
  treeOverflow,
  treeWidth,
} from "./layout";

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

describe("layout — quando a árvore transborda o scroller", () => {
  it("NO DESKTOP a árvore de 5 gerações cabe inteira, sem rolagem lateral", () => {
    // O ganho principal do layout de desktop, travado contra regressão: se
    // alguém aumentar um card ou o cotovelo, ou estreitar o container, este
    // teste cai antes de a rolagem voltar sem ninguém notar.
    expect(treeWidth(5)).toBeLessThanOrEqual(TREE_VIEWPORT.xl);
    expect(treeOverflow(5).xl).toBe(false);
  });

  it("no layout base a árvore funda continua rolando — é o que a affordance anuncia", () => {
    expect(treeOverflow(5).base).toBe(true);
    expect(treeOverflow(4).base).toBe(true);
    expect(treeOverflow(3).base).toBe(true);
  });

  it("árvore rasa não rola em lugar nenhum", () => {
    for (const depth of [0, 1, 2]) {
      expect(treeOverflow(depth)).toEqual({ base: false, xl: false });
    }
  });

  /**
   * A prova de que trocar o antigo `CONTAINER_WIDTH = 672` por
   * `TREE_VIEWPORT.base = 606` NÃO mudou o comportamento em nenhum celular ou
   * tablet: não existe degrau de `treeWidth` entre os dois valores, então o
   * booleano é idêntico para toda profundidade.
   *
   * É a asserção que sustenta a regra "nada muda abaixo de xl". Se um card
   * mudar de largura e algum degrau cair nessa faixa, este teste avisa.
   */
  it("606 e 672 classificam TODA profundidade do mesmo jeito", () => {
    for (let depth = 0; depth < GENERATIONS.length; depth += 1) {
      expect(treeWidth(depth) > TREE_VIEWPORT.base).toBe(treeWidth(depth) > 672);
    }
  });
});
