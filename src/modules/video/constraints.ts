/**
 * ============================================================================
 * Limites, estados e montagem de URL do vídeo. Tudo puro e testável.
 * ============================================================================
 *
 * Mesmo papel de `media/constraints.ts` no módulo de imagem: é aqui que moram
 * as decisões, e o resto do módulo só as aplica. A diferença é o que está do
 * outro lado — lá é o Storage do Supabase, aqui é a API do Cloudflare Stream,
 * cujos nomes de estado são dados dela e não nossos.
 */

/**
 * Teto de tamanho do arquivo.
 *
 * 200 MB não é escolha de produto, é o limite do upload simples do Cloudflare:
 * acima disso a API exige o protocolo tus (upload em partes, retomável), que é
 * outra implementação inteira. Está fora de escopo nesta versão.
 */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * Teto de duração. É vídeo de filhote, não filme.
 *
 * Não é só validação de tela: `maxDurationSeconds` é parâmetro OBRIGATÓRIO do
 * `direct_upload` e RESERVA minutos do plano no ato da criação da URL. O número
 * aqui é o mesmo que vai para o Cloudflare — mudá-lo muda custo.
 */
export const MAX_VIDEO_SECONDS = 90;

/**
 * Formatos aceitos na seleção do arquivo.
 *
 * O Cloudflare transcodifica praticamente tudo, então esta lista é do NOSSO
 * lado: barra o usuário que escolheu um `.mov` de 4K por engano antes de gastar
 * a subida inteira. MP4 e MOV cobrem câmera de iPhone e de Android; WebM cobre
 * gravação feita no navegador.
 */
export const ACCEPTED_VIDEO_MIMES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/**
 * Quanto tempo a URL de upload vale. É credencial de uso único e NUNCA é
 * gravada; uma abandonada (usuário desistiu depois de escolher o arquivo)
 * morre sozinha em uma hora, sem deixar nada para limpar.
 */
export const UPLOAD_URL_TTL_MINUTES = 60;

/** Intervalo entre duas leituras de status durante a transcodificação. */
export const POLL_INTERVAL_MS = 3_000;

/**
 * Teto de tentativas do polling — 3 minutos.
 *
 * Um clipe de 90s transcodifica em segundos; este teto é para o caso patológico.
 * Estourá-lo NÃO é erro: o estado vive no banco, e reabrir a página reconcilia.
 * A mensagem na tela diz exatamente isso em vez de fingir uma falha.
 */
export const POLL_MAX_ATTEMPTS = 60;

// -----------------------------------------------------------------------------
// Estados
// -----------------------------------------------------------------------------

/**
 * Os estados que gravamos, idênticos aos que `status.state` do Stream reporta.
 * Espelham o CHECK `dog_videos_status_valid`.
 */
export const VIDEO_STATUSES = [
  "pendingupload",
  "downloading",
  "queued",
  "inprogress",
  "ready",
  "error",
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** Estado final: não adianta continuar perguntando ao Cloudflare. */
export function isTerminal(status: VideoStatus): boolean {
  return status === "ready" || status === "error";
}

/**
 * O que o Cloudflare respondeu vira um dos nossos estados.
 *
 * ESTADO DESCONHECIDO MANTÉM O ATUAL, e é a decisão importante desta função. O
 * Stream pode ganhar um estado novo (`live-inprogress` já existe e não se
 * aplica a nós); mapeá-lo para `error` transformaria uma novidade do lado deles
 * num vídeo perdido do lado do dono, sem nenhum motivo real. Mantendo o atual,
 * o polling continua e o pior caso é o teto de tentativas — recuperável, ao
 * contrário de um erro gravado.
 */
export function mapStreamState(raw: unknown, current: VideoStatus): VideoStatus {
  if (typeof raw !== "string") return current;
  return (VIDEO_STATUSES as readonly string[]).includes(raw) ? (raw as VideoStatus) : current;
}

// -----------------------------------------------------------------------------
// Validação do arquivo, no client, antes de qualquer rede
// -----------------------------------------------------------------------------

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * `durationSeconds` é opcional porque chega DEPOIS: o navegador só sabe a
 * duração quando o `<video>` dispara `loadedmetadata`. Formato e tamanho são
 * conhecidos na hora da seleção e barram o arquivo antes mesmo de decodificar.
 */
export function validateVideoFile(file: {
  type: string;
  size: number;
  durationSeconds?: number;
}): ValidationResult {
  if (!(ACCEPTED_VIDEO_MIMES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "Formato não aceito. Envie MP4, MOV ou WebM." };
  }
  if (file.size <= 0) return { ok: false, reason: "Arquivo vazio." };
  if (file.size > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      reason: `Vídeo acima de ${formatBytes(MAX_VIDEO_BYTES)}. Grave um trecho mais curto ou reduza a qualidade.`,
    };
  }

  if (typeof file.durationSeconds === "number") {
    // `Infinity`/`NaN` é o que alguns navegadores devolvem em WebM sem índice
    // de duração. Não dá para afirmar que passa do limite, então não barra
    // aqui — o Cloudflare recusa depois, com a duração real.
    if (!Number.isFinite(file.durationSeconds)) return { ok: true };
    if (file.durationSeconds <= 0) return { ok: false, reason: "Vídeo sem duração legível." };
    if (file.durationSeconds > MAX_VIDEO_SECONDS) {
      return {
        ok: false,
        reason: `Vídeo de ${formatSeconds(file.durationSeconds)}. O limite é ${MAX_VIDEO_SECONDS} segundos.`,
      };
    }
  }

  return { ok: true };
}

// -----------------------------------------------------------------------------
// Endereço de reprodução
// -----------------------------------------------------------------------------

/**
 * O subdomínio de cliente do Stream, extraído de uma URL que a API devolveu.
 *
 * Todo vídeo pronto vem com `thumbnail` (e `preview`) apontando para
 * `https://customer-<code>.cloudflarestream.com/...`. É de lá que o código sai
 * — o que dispensa uma terceira variável de ambiente para guardá-lo. O
 * `CLAUDE.md` documenta o estrago que uma variável vazia já fez neste projeto;
 * a que não existe não tem como esvaziar.
 *
 * Devolve `null` para qualquer coisa que não seja exatamente esse host. O mesmo
 * padrão está no CHECK `dog_videos_origin_host` — as duas camadas existem
 * porque este valor vira o `src` de um `<iframe>` na página pública.
 */
export function parsePlaybackOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!/^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(parsed.hostname)) return null;
  return `https://${parsed.hostname}`;
}

/**
 * O `src` do player embutido.
 *
 * `poster` entra como parâmetro para o player mostrar a mesma imagem que a
 * página já mostrou antes do clique — sem isso, há um piscar de preto entre
 * clicar e o primeiro quadro.
 *
 * NENHUM parâmetro de autoplay, aqui nem em lugar nenhum: o vídeo só toca por
 * decisão do visitante.
 */
export function streamIframeUrl(params: {
  playbackOrigin: string;
  providerUid: string;
  posterUrl?: string | null;
}): string {
  const base = `${params.playbackOrigin}/${params.providerUid}/iframe`;
  if (!params.posterUrl) return base;
  return `${base}?poster=${encodeURIComponent(params.posterUrl)}`;
}

// -----------------------------------------------------------------------------
// Formatação
// -----------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `0:07`, `1:23`. Arredonda para cima: 6,2s é "7s" de vídeo, não "6s". */
export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.ceil(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
