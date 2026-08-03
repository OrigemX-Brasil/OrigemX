import QRCode from "qrcode";

/**
 * ============================================================================
 * Geração do QR — no servidor, e com os parâmetros que importam para IMPRESSÃO.
 * ============================================================================
 *
 * A codificação em si (Reed-Solomon, escolha de versão, seleção de máscara) vem
 * do `qrcode` (node-qrcode, MIT). Escrever isso à mão é exatamente onde nasce o
 * bug silencioso: um código que escaneia no celular de quem programou e falha no
 * do cliente, com máscara subótima ou correção mal calculada.
 *
 * Roda só no servidor. A página pública — que é a que abre em 4G na feira — não
 * carrega um byte disto: o QR vive no painel do dono.
 */

/**
 * NÍVEL H: recupera 30% dos módulos danificados.
 *
 * O crachá dobra, encardece e leva sol. H é o único nível que aguenta isso com
 * folga.
 *
 * O CUSTO, MEDIDO E NÃO ESTIMADO: com a URL do cão (36 caracteres), H produz
 * **versão 5 — 37×37 módulos**; M produziria versão 3 (29×29). Somando a zona de
 * silêncio, são 45 módulos de largura total.
 *
 * Daí sai o tamanho mínimo de impressão, que é informação de gráfica e está na
 * tela do painel:
 *
 * | largura impressa | módulo   | veredito                            |
 * | ---------------- | -------- | ----------------------------------- |
 * | 2 cm             | 0,44 mm  | marginal — falha em câmera ruim     |
 * | **3 cm**         | 0,67 mm  | **mínimo recomendado**              |
 * | 4 cm             | 0,89 mm  | folgado                             |
 *
 * Trocar para M ganharia densidade e perderia a tolerância a desgaste, que é
 * justamente o que separa um QR de tela de um QR impresso.
 */
export const QR_ERROR_CORRECTION = "H" as const;

/** Largura mínima de impressão, em centímetros. Ver a tabela acima. */
export const QR_PRINT_MIN_CM = 3;

/**
 * Zona de silêncio de 4 módulos, o mínimo da especificação.
 *
 * É a margem branca em volta. Muitos geradores economizam aqui para o código
 * "caber melhor" no layout, e o resultado é um QR que simplesmente não lê — o
 * leitor precisa dessa borda para achar onde o código começa.
 */
export const QR_QUIET_ZONE = 4;

/**
 * PRETO NO BRANCO, SEMPRE — inclusive dentro do tema escuro do site.
 *
 * Não é escolha estética, e é a razão de estas duas cores não virem de
 * `tokens.css`: elas não são identidade visual, são requisito de leitura óptica.
 * Contraste invertido ou de razão baixa derruba parte dos leitores, e o que
 * aparece na tela precisa ser exatamente o que sai na impressora. Na interface
 * escura, o QR aparece sobre um cartão branco por este mesmo motivo.
 */
export const QR_DARK = "#000000";
export const QR_LIGHT = "#ffffff";

export type QrShape = {
  /** Lado em módulos, já incluindo a zona de silêncio. */
  size: number;
  /** O atributo `d` de um único `<path>` com todos os módulos escuros. */
  path: string;
};

type Matrix = { data: ArrayLike<number>; size: number };

/**
 * Matriz de módulos → um `<path>` SVG.
 *
 * Função PURA, e é o único pedaço desta geração que dá para testar sem gerar um
 * QR de verdade.
 *
 * Emite corridas horizontais (`h{n}`) em vez de um quadrado por módulo: um QR
 * versão 4 tem ~550 módulos escuros, e agrupar corta o tamanho do caminho pela
 * metade sem mudar um pixel do desenho.
 *
 * Um `<path>` só, em vez de centenas de `<rect>`: menos nós no DOM e menos bytes
 * no HTML da página do painel.
 */
export function qrMatrixToPath(matrix: Matrix, quietZone = QR_QUIET_ZONE): string {
  const { data, size } = matrix;
  let d = "";

  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) {
        x += 1;
        continue;
      }

      let run = 1;
      while (x + run < size && data[y * size + x + run]) run += 1;

      d += `M${x + quietZone} ${y + quietZone}h${run}v1h-${run}z`;
      x += run;
    }
  }

  return d;
}

/**
 * O desenho do QR, pronto para virar `<svg>` em JSX.
 *
 * Devolver a forma em vez de uma string de SVG é o que permite renderizar em
 * Server Component sem `dangerouslySetInnerHTML` — o markup é montado por JSX,
 * com as cores sob controle.
 */
export function qrShape(text: string): QrShape {
  const qr = QRCode.create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION });
  const matrix = qr.modules as unknown as Matrix;

  return {
    size: matrix.size + QR_QUIET_ZONE * 2,
    path: qrMatrixToPath(matrix),
  };
}

/** SVG completo, para download. Vetor: escala para qualquer tamanho de gráfica. */
export function qrSvgFile(text: string): string {
  const { size, path } = qrShape(text);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" `,
    `width="${size * 8}" height="${size * 8}" shape-rendering="crispEdges">`,
    `<rect width="${size}" height="${size}" fill="${QR_LIGHT}"/>`,
    `<path d="${path}" fill="${QR_DARK}"/>`,
    `</svg>`,
  ].join("");
}

/** Menor lado aceitável de um PNG de QR. Abaixo disso a impressão borra. */
export const QR_PNG_MIN = 256;
/** 1024px ≈ 8,6 cm a 300 dpi: cabe em folder e sobra para crachá. */
export const QR_PNG_DEFAULT = 1024;
export const QR_PNG_MAX = 2048;

export function clampPngSize(raw: string | null): number {
  // Ausência tem de ser tratada ANTES do Number: `Number(null)` e `Number("")`
  // são 0, que é finito, e cairiam no clamp virando o tamanho mínimo. Quem não
  // pediu tamanho quer o padrão, não o menor possível.
  if (raw === null || raw.trim() === "") return QR_PNG_DEFAULT;

  const n = Number(raw);
  if (!Number.isFinite(n)) return QR_PNG_DEFAULT;

  // Valor absurdo é preso nos limites, não descartado: quem pediu 99999 quer o
  // maior que existe.
  return Math.min(QR_PNG_MAX, Math.max(QR_PNG_MIN, Math.round(n)));
}

/** PNG para quem só sabe lidar com imagem. */
export async function qrPngFile(text: string, width = QR_PNG_DEFAULT): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: "png",
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: QR_QUIET_ZONE,
    width,
    color: { dark: QR_DARK, light: QR_LIGHT },
  });
}
