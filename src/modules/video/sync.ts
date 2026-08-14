import { isTerminal, type VideoStatus } from "./constraints";
import type { DogVideo, SupabaseClientLike } from "./queries";
import { VIDEO_COLUMNS } from "./queries";
import { getVideo, type VideoInfo } from "./stream";

/**
 * ============================================================================
 * Pôr o status guardado em dia com o que o Cloudflare diz.
 * ============================================================================
 *
 * Um lugar só, porque há DOIS gatilhos para a mesma coisa e eles não podem
 * divergir:
 *
 *   1. o polling do navegador, logo depois do upload (`syncVideoStatus`);
 *   2. a abertura da página do painel, para quem fechou a aba no meio da
 *      transcodificação (`reconcileDogVideo`).
 *
 * O estado vive no BANCO, nunca na aba. É o que permite ao dono sair da página
 * sem perder o vídeo.
 */

/** O teto de `dog_videos_duration_ok`. Espelhado aqui para não violar o CHECK. */
const MAX_DURATION_COLUNA = 95;

/**
 * Grava o que o Cloudflare respondeu. Devolve a linha nova, ou a antiga se nada
 * mudou (ou se o UPDATE foi recusado).
 *
 * DOIS AJUSTES ANTES DE GRAVAR, os dois para respeitar CHECKs do banco em vez
 * de deixar o UPDATE explodir:
 *
 *   `ready` sem poster e sem origem NÃO é gravado como `ready`. O CHECK
 *   `dog_videos_ready_has_playback` recusaria, e com razão: a página pública
 *   renderiza a seção exatamente quando o status é `ready`, então gravá-lo sem
 *   endereço de reprodução produziria um player que não abre. Fica em
 *   `inprogress` e o polling continua — o Cloudflare devolve a thumbnail um
 *   instante depois de marcar o vídeo como pronto.
 *
 *   Duração fora da faixa vira NULL. `dog_videos_duration_ok` limita a 95s (os
 *   90 pedidos, com folga de arredondamento). Perder a duração é irrelevante;
 *   perder o vídeo inteiro por um UPDATE recusado não é.
 */
export async function applyStreamInfo(
  supabase: SupabaseClientLike,
  video: DogVideo,
  info: VideoInfo,
): Promise<DogVideo> {
  const thumbnailUrl = info.thumbnailUrl ?? video.thumbnail_url;
  const playbackOrigin = info.playbackOrigin ?? video.playback_origin;

  const status: VideoStatus =
    info.status === "ready" && (!thumbnailUrl || !playbackOrigin) ? "inprogress" : info.status;

  const rawDuration = info.durationSeconds ?? video.duration_seconds;
  const durationSeconds =
    rawDuration !== null && rawDuration > 0 && rawDuration <= MAX_DURATION_COLUNA
      ? rawDuration
      : null;

  const errorReason = status === "error" ? (info.errorReason ?? "Falha ao processar o vídeo.") : null;

  const inalterado =
    status === video.status &&
    thumbnailUrl === video.thumbnail_url &&
    playbackOrigin === video.playback_origin &&
    durationSeconds === video.duration_seconds &&
    errorReason === video.error_reason;

  // Nada mudou: poupa um UPDATE por poll. Com intervalo de 3s durante uma
  // transcodificação, é a maioria das idas.
  if (inalterado) return video;

  const { data, error } = await supabase
    .from("dog_videos")
    .update({
      status,
      thumbnail_url: thumbnailUrl,
      playback_origin: playbackOrigin,
      duration_seconds: durationSeconds,
      error_reason: errorReason,
    })
    .eq("id", video.id)
    .is("deleted_at", null)
    .select(VIDEO_COLUMNS)
    .maybeSingle();

  // Um UPDATE que a RLS recusa não devolve erro pelo PostgREST: devolve sucesso
  // com ZERO linha. Sem o log, uma sessão suspensa veria o status congelar sem
  // nenhum rastro — a mesma falha silenciosa que `setMediaCaption` já documenta.
  if (error || !data) {
    console.error(
      `[video:applyStreamInfo] UPDATE não afetou nada para video=${video.id}:`,
      error?.message ?? "zero linhas (RLS ou linha removida)",
    );
    return video;
  }

  return data as DogVideo;
}

/**
 * Pergunta ao Cloudflare e grava — só quando ainda vale perguntar.
 *
 * O curto-circuito em `isTerminal` é o que torna esta função barata o bastante
 * para rodar na renderização do painel a cada abertura da página: vídeo já
 * `ready` ou `error` não gera NENHUMA chamada de rede. Também é o limitador
 * natural do polling — não há como um cliente insistente gerar tráfego para o
 * Cloudflare depois que o vídeo ficou pronto.
 */
export async function reconcileDogVideo(
  supabase: SupabaseClientLike,
  video: DogVideo,
): Promise<DogVideo> {
  if (isTerminal(video.status)) return video;

  const info = await getVideo(video.provider_uid, video.status);
  // Cloudflare fora do ar, credencial ausente, timeout: o status fica onde
  // está e a tela mostra "processando". Reabrir a página tenta de novo.
  if (!info.ok) return video;

  return applyStreamInfo(supabase, video, info.value);
}
