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
