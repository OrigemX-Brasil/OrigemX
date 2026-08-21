import { deflateSync } from "node:zlib";

import QRCode from "qrcode";

/**
 * PNG de verdade para os testes de upload.
 *
 * GERADO, e não commitado como binário: um arquivo de imagem no repositório é
 * opaco na revisão, ninguém sabe o que tem dentro, e vira anexo que sobrevive
 * ao teste que o pediu.
 *
 * Sai do `qrcode`, que já é dependência do projeto e produz PNG válido e
 * decodificável. A alternativa seria montar o PNG à mão com zlib e CRC — mais
 * código para chegar no mesmo lugar — ou trazer uma biblioteca de imagem só
 * para isto.
 *
 * Precisa ser decodificável de verdade: o upload comprime no navegador com
 * `createImageBitmap` antes de subir, e bytes inventados falhariam ali, num
 * erro que não teria nada a ver com o que o teste quer verificar.
 */
export async function pngDeTeste(texto = "OrigemX E2E", width = 512): Promise<Buffer> {
  return QRCode.toBuffer(texto, {
    type: "png",
    width,
    margin: 2,
    errorCorrectionLevel: "L",
  });
}

export const NOME_ARQUIVO = "foto-de-teste.png";
export const MIME = "image/png";

/**
 * PNG de proporção ARBITRÁRIA — `pngDeTeste` (QR code) é sempre quadrado, e
 * o teste do lightbox precisa de retrato/paisagem de verdade para provar que
 * a proporção não distorce quando `max-width` e `max-height` batem ao mesmo
 * tempo (ver `photo-lightbox.tsx`).
 *
 * PNG não-comprimido, montado à mão (cabeçalho + `IDAT`/`deflateSync` +
 * `IEND`), sem depender de nenhuma lib de imagem — mesmo raciocínio de
 * `pngDeTeste`: gerado, não comitado como binário.
 */
export function pngRetratoDeTeste(width: number, height: number): Buffer {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    crcTable[n] = c;
  }
  const crc32 = (buf: Buffer): number => {
    let crc = 0xffffffff;
    for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB

  // Um pixel sólido, repetido — o teste mede posição e proporção da CAIXA,
  // não o conteúdo visual.
  const rowBytes = width * 3 + 1;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // sem filtro
    for (let x = 0; x < width; x++) {
      const o = rowStart + 1 + x * 3;
      raw[o] = 40;
      raw[o + 1] = 60;
      raw[o + 2] = 90;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
