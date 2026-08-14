import {
  mapStreamState,
  parsePlaybackOrigin,
  UPLOAD_URL_TTL_MINUTES,
  type VideoStatus,
} from "./constraints";

/**
 * ============================================================================
 * Cliente da API do Cloudflare Stream. Só servidor.
 * ============================================================================
 *
 * O molde é `src/lib/notify/index.ts`, que já resolveu exatamente este
 * problema: serviço externo, chave que só existe no servidor, e um fluxo do
 * produto que NÃO PODE cair junto quando o terceiro cai.
 *
 * ------------------------------------------------------------------ garantias
 *
 * NUNCA PROPAGA. Toda função devolve um resultado discriminado e tem o corpo
 * inteiro em try/catch. Nenhuma chamada daqui pode derrubar o cadastro de um
 * cão nem a renderização de uma página — vídeo é acessório, registro é o
 * produto.
 *
 * SEM CREDENCIAL, DESLIGA. Em desenvolvimento, teste e CI não há
 * `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_STREAM_API_TOKEN`: as funções devolvem
 * `{ ok: false }` sem tocar em rede, e a UI esconde a seção. Nenhum teste fica
 * dependente de serviço externo.
 *
 * SÓ NO SERVIDOR. Nenhuma das duas variáveis leva `NEXT_PUBLIC_`, então o Next
 * não as embute no bundle do navegador — lá seriam `undefined`. A guarda abaixo
 * transforma um import errado em erro alto na hora, em vez de uma chamada muda
 * que ninguém investiga. Mesma guarda de `lib/notify`.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

/** Teto por requisição. O mesmo de `lib/notify`. */
const TIMEOUT_MS = 8_000;

function apenasServidor(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "src/modules/video/stream.ts só roda no servidor. Importar em componente " +
        "de cliente expõe a intenção de usar CLOUDFLARE_STREAM_API_TOKEN, que " +
        "lá é sempre undefined.",
    );
  }
}

type Credenciais = { accountId: string; token: string };

function credenciais(): Credenciais | null {
  apenasServidor();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !token) return null;
  return { accountId, token };
}

/**
 * Há credencial configurada?
 *
 * A UI do painel pergunta isto para mostrar "envio de vídeo indisponível" em
 * vez de um campo de arquivo que falharia no clique. A página pública NÃO
 * pergunta: ela lê só o nosso banco e não depende do Cloudflare estar
 * configurado nem no ar.
 */
export function videoConfigurado(): boolean {
  return credenciais() !== null;
}

export type StreamResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Mensagem única para o usuário. O motivo real vai para o log, não para a tela. */
const FALHA_GENERICA = "Não foi possível falar com o serviço de vídeo. Tente de novo em instantes.";

/**
 * Uma requisição à API, com timeout, e que nunca levanta.
 *
 * `caminho` é relativo à conta: `/stream/direct_upload` vira
 * `/accounts/{id}/stream/direct_upload`.
 */
async function requisitar<T>(
  caminho: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown },
  contexto: string,
): Promise<StreamResult<T>> {
  const cred = credenciais();
  if (!cred) {
    console.warn(`[video:${contexto}] CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_STREAM_API_TOKEN ausentes.`);
    return { ok: false, reason: "O envio de vídeo não está configurado." };
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/accounts/${cred.accountId}${caminho}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${cred.token}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controle.signal,
      // Nunca cachear: a resposta é de status que muda, ou de criação.
      cache: "no-store",
    });

    // O corpo do erro do Cloudflare diz o motivo — token sem permissão
    // Stream:Edit, conta sem assinatura, uid inexistente. Sem ele o log seria
    // só "falhou", que é o que faz um incidente durar horas.
    if (!res.ok) {
      console.error(
        `[video:${contexto}] Cloudflare recusou (${res.status}): ${(await res.text()).slice(0, 300)}`,
      );
      return { ok: false, reason: FALHA_GENERICA };
    }

    const json = (await res.json()) as { success?: boolean; result?: T; errors?: unknown };

    // HTTP 200 com `success: false` é resposta possível da API deles. Tratar só
    // o status HTTP deixaria passar como sucesso.
    if (!json.success || json.result === undefined) {
      console.error(
        `[video:${contexto}] resposta sem sucesso: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`,
      );
      return { ok: false, reason: FALHA_GENERICA };
    }

    return { ok: true, value: json.result };
  } catch (erro) {
    // Aqui a falha morre: rede caída, DNS, timeout, JSON malformado.
    console.error(
      `[video:${contexto}] falhou e o fluxo segue:`,
      erro instanceof Error ? erro.message : erro,
    );
    return { ok: false, reason: FALHA_GENERICA };
  } finally {
    clearTimeout(relogio);
  }
}

// -----------------------------------------------------------------------------
// Direct creator upload
// -----------------------------------------------------------------------------

export type DirectUpload = { uid: string; uploadUrl: string };

/**
 * Reserva um vídeo e devolve a URL para onde o NAVEGADOR sobe o arquivo.
 *
 * O binário nunca passa por aqui — mesma regra do upload de imagem, que vai do
 * navegador direto ao Storage (`media/upload-one.ts`). Passar o vídeo pelo
 * nosso servidor somaria uma cópia em memória e estouraria o limite de corpo
 * da função serverless com folga.
 *
 * `maxDurationSeconds` é obrigatório na API e RESERVA minutos do plano no ato
 * — por isso vem de `MAX_VIDEO_SECONDS`, e não de um número solto aqui.
 *
 * `creator` guarda o uid do usuário do lado do Cloudflare. Não é usado para
 * autorizar nada (quem autoriza é a RLS); serve para uma conta ficar auditável
 * pelo painel deles no dia em que alguém precisar rastrear consumo.
 */
export async function createDirectUpload(params: {
  maxDurationSeconds: number;
  creator: string;
  meta?: Record<string, string>;
}): Promise<StreamResult<DirectUpload>> {
  const expiry = new Date(Date.now() + UPLOAD_URL_TTL_MINUTES * 60_000).toISOString();

  const res = await requisitar<{ uid?: string; uploadURL?: string }>(
    "/stream/direct_upload",
    {
      method: "POST",
      body: {
        maxDurationSeconds: params.maxDurationSeconds,
        creator: params.creator,
        expiry,
        ...(params.meta ? { meta: params.meta } : {}),
      },
    },
    "createDirectUpload",
  );

  if (!res.ok) return res;

  const { uid, uploadURL } = res.value;
  if (!uid || !uploadURL) {
    console.error("[video:createDirectUpload] resposta sem uid/uploadURL.");
    return { ok: false, reason: FALHA_GENERICA };
  }

  return { ok: true, value: { uid, uploadUrl: uploadURL } };
}

// -----------------------------------------------------------------------------
// Status
// -----------------------------------------------------------------------------

export type VideoInfo = {
  status: VideoStatus;
  /** Poster gerado pelo Stream. Só existe depois de transcodificar. */
  thumbnailUrl: string | null;
  /** `https://customer-<code>.cloudflarestream.com`, derivado da thumbnail. */
  playbackOrigin: string | null;
  durationSeconds: number | null;
  errorReason: string | null;
};

type VideoPayload = {
  status?: { state?: unknown; errorReasonText?: unknown };
  thumbnail?: unknown;
  preview?: unknown;
  duration?: unknown;
};

/**
 * Onde a transcodificação está.
 *
 * `atual` é o status que já está gravado: um estado desconhecido devolvido pelo
 * Cloudflare o mantém em vez de virar erro — ver `mapStreamState`.
 */
export async function getVideo(uid: string, atual: VideoStatus): Promise<StreamResult<VideoInfo>> {
  const res = await requisitar<VideoPayload>(
    `/stream/${encodeURIComponent(uid)}`,
    { method: "GET" },
    "getVideo",
  );
  if (!res.ok) return res;

  const payload = res.value;
  const status = mapStreamState(payload.status?.state, atual);

  const thumbnailUrl = typeof payload.thumbnail === "string" ? payload.thumbnail : null;
  // A origem sai da thumbnail; `preview` é o reserva, porque ambos carregam o
  // mesmo subdomínio de cliente e nada garante que os dois venham juntos.
  const playbackOrigin =
    parsePlaybackOrigin(thumbnailUrl) ??
    parsePlaybackOrigin(typeof payload.preview === "string" ? payload.preview : null);

  // `-1` é como a API diz "não sei ainda".
  const rawDuration = typeof payload.duration === "number" ? payload.duration : null;
  const durationSeconds = rawDuration !== null && rawDuration > 0 ? rawDuration : null;

  const errorReason =
    typeof payload.status?.errorReasonText === "string" && payload.status.errorReasonText.trim()
      ? payload.status.errorReasonText.trim().slice(0, 300)
      : null;

  return { ok: true, value: { status, thumbnailUrl, playbackOrigin, durationSeconds, errorReason } };
}

// -----------------------------------------------------------------------------
// Remoção
// -----------------------------------------------------------------------------

/**
 * Apaga o vídeo no Cloudflare.
 *
 * Sem isto, remover pela nossa tela deixaria o arquivo vivo lá consumindo
 * armazenamento para sempre, sem aparecer em lugar nenhum — exatamente o que
 * `deleteMedia` já evita do lado do Storage.
 *
 * O DELETE responde 200 com corpo VAZIO, sem o envelope `{success, result}` das
 * outras rotas — por isso não passa por `requisitar`.
 */
export async function deleteVideo(uid: string): Promise<StreamResult<null>> {
  const cred = credenciais();
  if (!cred) {
    console.warn("[video:deleteVideo] credenciais ausentes; o vídeo remoto permanece.");
    return { ok: false, reason: "O serviço de vídeo não está configurado." };
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `${API_BASE}/accounts/${cred.accountId}/stream/${encodeURIComponent(uid)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${cred.token}` },
        signal: controle.signal,
        cache: "no-store",
      },
    );

    // 404 conta como sucesso: o objetivo é "não existe mais lá", e ele já não
    // existe. Tratar como falha faria a tela pedir para tentar de novo uma
    // remoção que não tem mais o que remover.
    if (!res.ok && res.status !== 404) {
      console.error(
        `[video:deleteVideo] Cloudflare recusou (${res.status}) para uid=${uid}: ${(await res.text()).slice(0, 300)}`,
      );
      return { ok: false, reason: FALHA_GENERICA };
    }

    return { ok: true, value: null };
  } catch (erro) {
    console.error(
      `[video:deleteVideo] falhou para uid=${uid} e o fluxo segue:`,
      erro instanceof Error ? erro.message : erro,
    );
    return { ok: false, reason: FALHA_GENERICA };
  } finally {
    clearTimeout(relogio);
  }
}
