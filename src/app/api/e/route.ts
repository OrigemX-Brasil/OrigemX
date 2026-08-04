import { isBot, isCapturePath, readReferer } from "@/modules/capture/events";
import { recordEvent } from "@/modules/capture/queries";
import { siteUrl } from "@/modules/public/metadata";

/**
 * ============================================================================
 * Pixel de medição — `/api/e`
 * ============================================================================
 *
 * Anexo I.11. Conta acessos à página de captura sem UMA LINHA de JavaScript.
 *
 * POR QUE UM PIXEL, E NÃO CÓDIGO NA PÁGINA: a landing precisa continuar
 * ESTÁTICA. Ela é a primeira coisa que alguém vê depois de escanear um QR numa
 * feira, com 4G disputado por mil aparelhos — servida do CDN ela chega em
 * dezenas de milissegundos; renderizada no servidor a cada acesso, paga ida e
 * volta até a origem, com risco de partida a frio.
 *
 * Página estática, porém, não executa nada por visita. O `<img>` resolve isso: o
 * HTML vem do cache, e a requisição da imagem chega até nós. Sem JavaScript,
 * funciona com script desligado, e são 42 bytes de resposta.
 *
 * A ORIGEM VEM DO `Referer`, e é obrigatório que venha: como o HTML é idêntico
 * para todo mundo, a URL do pixel não pode carregar o `?de=`. O navegador manda
 * a URL completa em requisição de mesma origem, e é dali que a origem sai.
 *
 * NADA PESSOAL É GRAVADO. O user agent é lido para descartar robô e jogado
 * fora; o referer vira só caminho e origem. Sem IP, sem cookie, sem
 * identificador. Ver a migration `20260803201323_landing_events.sql`.
 */

/** GIF 1×1 transparente. 42 bytes — não existe resposta de imagem menor. */
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Sem isto o Next tenta otimizar a rota e ela deixaria de contar por acesso. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const respond = () =>
    new Response(new Uint8Array(PIXEL), {
      headers: {
        "Content-Type": "image/gif",
        "Content-Length": String(PIXEL.byteLength),
        // Sem `no-store` o navegador e o CDN guardariam o pixel, e cada pessoa
        // seria contada uma vez na vida. A métrica viraria ficção.
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        // A resposta não é conteúdo de terceiro e não deve ser interpretada
        // como outra coisa.
        "X-Content-Type-Options": "nosniff",
      },
    });

  try {
    if (isBot(request.headers.get("user-agent"))) return respond();

    const { path, source } = readReferer(request.headers.get("referer"), siteUrl().hostname);

    // SÓ CONTA QUEM ESTAVA NA PÁGINA DE CAPTURA. Sem esta linha, o prefetch do
    // convite no rodapé de `/d/` e `/c/` fazia o pixel disparar a partir do
    // perfil do cão — medido, e cada visita a perfil inflava o número da
    // landing. Ver `isCapturePath`.
    if (!isCapturePath(path)) return respond();

    await recordEvent("view", source, path);
  } catch {
    // Medição nunca derruba nada. O pixel sai igual.
  }

  return respond();
}
