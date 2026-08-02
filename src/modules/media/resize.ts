"use client";

import {
  computeTargetSize,
  MAX_IMAGE_DIMENSION,
  MAX_STORED_BYTES,
  MAX_THUMB_BYTES,
  THUMB_DIMENSION,
  type Size,
  type StoredMime,
} from "./constraints";

/**
 * Compressão e redimensionamento NO CLIENT, antes do upload.
 *
 * Não é otimização: é o que decide se o plano de armazenamento dura. Uma foto
 * de celular sai com 4 a 8 MB; a mesma imagem em 1600px WebP fica em ~150 KB.
 * A diferença entre subir o original e subir o comprimido é de 30 a 50 vezes.
 *
 * E o arquivo NUNCA vira base64 no caminho — trabalhamos com Blob do começo ao
 * fim, e o upload manda binário. Base64 infla 33% e passaria o arquivo inteiro
 * pela memória do JS.
 *
 * Usa só API de navegador: canvas e createImageBitmap. Sem dependência nova.
 */

export type CompressedImage = {
  blob: Blob;
  mime: StoredMime;
  width: number;
  height: number;
  bytes: number;
};

export type CompressionResult = {
  full: CompressedImage;
  thumb: CompressedImage;
};

/** WebP economiza ~30% sobre JPEG; nem todo navegador antigo gera no canvas. */
function pickOutputMime(): StoredMime {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const supportsWebp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  return supportsWebp ? "image/webp" : "image/jpeg";
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  // `createImageBitmap` decodifica fora da thread principal e já corrige a
  // orientação EXIF — sem isso, foto de celular na vertical sobe deitada.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function toBlob(canvas: HTMLCanvasElement, mime: StoredMime, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem."))),
      mime,
      quality,
    );
  });
}

function drawTo(bitmap: ImageBitmap, size: Size): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");

  // Sem isto, reduzir uma foto grande produz serrilhado visível.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);

  return canvas;
}

/**
 * Comprime até caber no teto, baixando a qualidade em passos.
 *
 * Uma qualidade fixa não serve: foto com muito detalhe passa do limite em 0.8,
 * e ilustração chapada desperdiça bytes. O laço para no primeiro valor que
 * couber, então a imagem fácil sai com qualidade alta.
 */
async function compressToFit(
  bitmap: ImageBitmap,
  maxDimension: number,
  maxBytes: number,
  mime: StoredMime,
): Promise<CompressedImage> {
  const size = computeTargetSize({ width: bitmap.width, height: bitmap.height }, maxDimension);
  const canvas = drawTo(bitmap, size);

  const qualities = [0.85, 0.75, 0.65, 0.55, 0.45];
  let last: Blob | null = null;

  for (const quality of qualities) {
    const blob = await toBlob(canvas, mime, quality);
    last = blob;
    if (blob.size <= maxBytes) {
      return { blob, mime, width: size.width, height: size.height, bytes: blob.size };
    }
  }

  if (!last) throw new Error("Falha ao comprimir a imagem.");

  // Ainda grande na qualidade mínima: reduz a dimensão pela metade e tenta de
  // novo. Acontece com panorâmica ou foto de documento cheia de textura.
  if (maxDimension > 320) {
    return compressToFit(bitmap, Math.round(maxDimension / 2), maxBytes, mime);
  }

  return { blob: last, mime, width: size.width, height: size.height, bytes: last.size };
}

/**
 * Gera as duas variantes de uma vez.
 *
 * O thumbnail não é luxo: a listagem carrega SÓ ele. Uma lista de 50 cães com
 * a imagem cheia baixaria dezenas de MB no celular do criador.
 */
export async function compressImage(file: File): Promise<CompressionResult> {
  const mime = pickOutputMime();
  const bitmap = await loadBitmap(file);

  try {
    const [full, thumb] = await Promise.all([
      compressToFit(bitmap, MAX_IMAGE_DIMENSION, MAX_STORED_BYTES, mime),
      compressToFit(bitmap, THUMB_DIMENSION, MAX_THUMB_BYTES, mime),
    ]);
    return { full, thumb };
  } finally {
    // Libera a memória do decode sem esperar o GC — em celular com pouca RAM,
    // subir várias fotos seguidas sem isso derruba a aba.
    bitmap.close();
  }
}
