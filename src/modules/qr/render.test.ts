import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import {
  QR_ERROR_CORRECTION,
  clampPngSize,
  qrMatrixToPath,
  qrShape,
  qrSvgFile,
  QR_DARK,
  QR_LIGHT,
  QR_PNG_DEFAULT,
  QR_PNG_MAX,
  QR_PNG_MIN,
  QR_QUIET_ZONE,
} from "./render";

/** Matriz a partir de um desenho, para o teste ser legível. */
function matrixOf(rows: string[]) {
  const size = rows.length;
  const data = new Uint8Array(size * size);
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      data[y * size + x] = cell === "#" ? 1 : 0;
    });
  });
  return { data, size };
}

describe("qrMatrixToPath — conversão pura da matriz", () => {
  it("agrupa módulos vizinhos numa corrida só", () => {
    const m = matrixOf(["##.", ".#.", "#.#"]);

    expect(qrMatrixToPath(m, 0)).toBe(
      "M0 0h2v1h-2z" + // linha 0: dois módulos viram uma corrida
        "M1 1h1v1h-1z" +
        "M0 2h1v1h-1z" +
        "M2 2h1v1h-1z",
    );
  });

  it("linha cheia vira um comando, não um por módulo", () => {
    const m = matrixOf(["###", "###", "###"]);

    expect(qrMatrixToPath(m, 0)).toBe("M0 0h3v1h-3zM0 1h3v1h-3zM0 2h3v1h-3z");
  });

  it("desloca tudo pela zona de silêncio", () => {
    const m = matrixOf(["#."]);

    expect(qrMatrixToPath(m, 0)).toBe("M0 0h1v1h-1z");
    expect(qrMatrixToPath(m, 4)).toBe("M4 4h1v1h-1z");
  });

  it("matriz vazia devolve caminho vazio, não 'undefined'", () => {
    expect(qrMatrixToPath(matrixOf(["..", ".."]), 0)).toBe("");
  });

  it("uma corrida não atravessa a quebra de linha", () => {
    // Sem o corte por linha, o último módulo da linha 0 se juntaria ao primeiro
    // da linha 1 e o QR sairia deformado.
    const m = matrixOf([".#", "#."]);

    expect(qrMatrixToPath(m, 0)).toBe("M1 0h1v1h-1zM0 1h1v1h-1z");
  });
});

/**
 * Os três padrões de localização — os quadrados dos cantos. É por eles que o
 * leitor acha e orienta o código; se saírem errados, nada lê.
 */
const FINDER = ["#######", "#.....#", "#.###.#", "#.###.#", "#.###.#", "#.....#", "#######"];

function hasFinderAt(
  matrix: { data: ArrayLike<number>; size: number },
  ox: number,
  oy: number,
): boolean {
  return FINDER.every((row, y) =>
    [...row].every(
      (cell, x) => Boolean(matrix.data[(oy + y) * matrix.size + (ox + x)]) === (cell === "#"),
    ),
  );
}

describe("qrShape — o QR de verdade", () => {
  const url = "https://origemxbr.com/d/n5xyxy8kd73b";

  it("nível H com a URL do cão dá versão 5: 37 módulos, mais 4 de silêncio de cada lado", () => {
    expect(qrShape(url).size).toBe(37 + QR_QUIET_ZONE * 2);
  });

  it("tem os três padrões de localização nos cantos certos", () => {
    // Recriada aqui porque `qrShape` já devolve só o caminho.
    const raw = rawMatrix(url);

    expect(hasFinderAt(raw, 0, 0)).toBe(true);
    expect(hasFinderAt(raw, raw.size - 7, 0)).toBe(true);
    expect(hasFinderAt(raw, 0, raw.size - 7)).toBe(true);
    // O quarto canto NÃO tem finder — é o que dá a orientação ao leitor.
    expect(hasFinderAt(raw, raw.size - 7, raw.size - 7)).toBe(false);
  });

  it("o caminho começa dentro da zona de silêncio, nunca em 0", () => {
    expect(qrShape(url).path.startsWith(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h7`)).toBe(true);
  });

  it("URLs diferentes dão desenhos diferentes", () => {
    expect(qrShape(url).path).not.toBe(qrShape("https://origemxbr.com/c/aurora").path);
  });

  /**
   * A prova que importa, e a razão de não precisarmos de um decodificador aqui.
   *
   * A codificação (Reed-Solomon, versão, máscara) é da biblioteca, e é ela que
   * responde por estar certa. O que ESTE código faz é transformar a matriz dela
   * num caminho SVG — e é exatamente aí que um erro nosso produziria um QR
   * bonito que não lê.
   *
   * Reconstruir a matriz a partir do caminho e comparar módulo a módulo com a
   * saída crua da biblioteca fecha essa lacuna: se a conversão perdeu, duplicou,
   * espelhou ou deslocou um único módulo, isto acusa.
   */
  it.each([
    "https://origemxbr.com/d/n5xyxy8kd73b",
    "https://origemxbr.com/c/canil-do-vale-verde",
    "https://origemxbr.com/c/a",
  ])("o caminho reproduz a matriz da biblioteca módulo a módulo — %s", (texto) => {
    const oficial = QRCode.create(texto, { errorCorrectionLevel: QR_ERROR_CORRECTION })
      .modules as unknown as { data: ArrayLike<number>; size: number };
    const reconstruida = rawMatrix(texto);

    expect(reconstruida.size).toBe(oficial.size);

    const diferentes: number[] = [];
    for (let i = 0; i < oficial.size * oficial.size; i += 1) {
      if (Boolean(oficial.data[i]) !== Boolean(reconstruida.data[i])) diferentes.push(i);
    }

    expect(diferentes).toEqual([]);
  });
});

/** A matriz crua, para conferir os padrões de localização. */
function rawMatrix(text: string) {
  const shape = qrShape(text);
  const size = shape.size - QR_QUIET_ZONE * 2;
  const data = new Uint8Array(size * size);

  // Reconstrói a matriz a partir do caminho: se a conversão perdeu ou deslocou
  // módulo, os padrões de localização não fecham e o teste acusa.
  for (const [, xs, ys, runs] of shape.path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    const x = Number(xs) - QR_QUIET_ZONE;
    const y = Number(ys) - QR_QUIET_ZONE;
    for (let i = 0; i < Number(runs); i += 1) data[y * size + x + i] = 1;
  }

  return { data, size };
}

describe("qrSvgFile", () => {
  const svg = qrSvgFile("https://origemxbr.com/d/n5xyxy8kd73b");

  it("é preto no branco, sempre — requisito de leitura, não estética", () => {
    expect(svg).toContain(`fill="${QR_LIGHT}"`);
    expect(svg).toContain(`fill="${QR_DARK}"`);
    expect(QR_DARK).toBe("#000000");
    expect(QR_LIGHT).toBe("#ffffff");
  });

  it("tem viewBox, então escala para qualquer tamanho de gráfica sem serrilhar", () => {
    expect(svg).toContain('viewBox="0 0 45 45"');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it("o fundo branco cobre a zona de silêncio inteira", () => {
    expect(svg).toContain('<rect width="45" height="45"');
  });
});

describe("clampPngSize", () => {
  it("usa o padrão quando não vem nada ou vem lixo", () => {
    expect(clampPngSize(null)).toBe(QR_PNG_DEFAULT);
    expect(clampPngSize("grande")).toBe(QR_PNG_DEFAULT);
    expect(clampPngSize("")).toBe(QR_PNG_DEFAULT);
  });

  it("prende nos limites em vez de gerar imagem inútil ou pesada demais", () => {
    expect(clampPngSize("64")).toBe(QR_PNG_MIN);
    expect(clampPngSize("99999")).toBe(QR_PNG_MAX);
    expect(clampPngSize("-500")).toBe(QR_PNG_MIN);
  });

  it("respeita valor razoável", () => {
    expect(clampPngSize("1200")).toBe(1200);
    expect(clampPngSize("512.6")).toBe(513);
  });
});
