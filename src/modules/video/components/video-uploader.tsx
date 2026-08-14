"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { removeDogVideo, requestVideoUpload, syncVideoStatus } from "../actions";
import {
  ACCEPTED_VIDEO_MIMES,
  formatBytes,
  isTerminal,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  POLL_INTERVAL_MS,
  POLL_MAX_ATTEMPTS,
  validateVideoFile,
} from "../constraints";
import type { DogVideo as DogVideoRow } from "../queries";

import { DogVideo } from "./dog-video";

/**
 * ============================================================================
 * Envio do vídeo do cão, no painel.
 * ============================================================================
 *
 * O ARQUIVO NÃO PASSA PELO NOSSO SERVIDOR: a Server Action devolve uma URL de
 * uso único do Cloudflare e o navegador sobe direto para lá. Mesma regra do
 * upload de imagem (`media/upload-one.ts`).
 *
 * O ESTADO VIVE NO BANCO, NÃO NESTA ABA. `video` chega do servidor a cada
 * render e é a fonte de verdade sobre a transcodificação; o estado local aqui
 * só cobre o intervalo em que ainda não há nada gravado (escolher, validar,
 * enviar). É isso que permite fechar a aba no meio e reencontrar o vídeo
 * pronto ao voltar — a página do painel reconcilia sozinha ao abrir.
 */

/** O que só existe nesta aba, antes de o servidor ter algo a dizer. */
type Fase =
  | { tipo: "ocioso" }
  | { tipo: "preparando" }
  | { tipo: "enviando"; progresso: number }
  | { tipo: "erro"; mensagem: string };

/**
 * Duração do arquivo, sem rede: um `<video>` fora da árvore, só para os
 * metadados.
 *
 * Devolve `NaN` quando o navegador não consegue ler (WebM sem índice de
 * duração, arquivo corrompido) — `validateVideoFile` trata isso deixando
 * passar, porque afirmar que estourou o limite seria chute. Quem decide com a
 * duração real, nesse caso, é o Cloudflare.
 *
 * `revokeObjectURL` nos dois caminhos: sem isso o blob fica preso em memória
 * até a aba fechar, o mesmo cuidado que `gallery-uploader.tsx` tem com as
 * prévias locais.
 */
function lerDuracao(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    const encerrar = (valor: number) => {
      URL.revokeObjectURL(url);
      resolve(valor);
    };
    el.onloadedmetadata = () => encerrar(el.duration);
    el.onerror = () => encerrar(NaN);
    el.src = url;
  });
}

type EnvioResultado = { ok: true } | { ok: false; mensagem: string };

/**
 * Sobe o arquivo para a URL do Cloudflare.
 *
 * `XMLHttpRequest` e não `fetch`, e é a ÚNICA razão: nenhum navegador expõe
 * progresso de UPLOAD em `fetch` (`ReadableStream` no corpo da requisição não
 * é suportado de forma utilizável). Num arquivo de até 200 MB em 4G, uma barra
 * parada é indistinguível de uma tela travada.
 */
function enviarArquivo(
  uploadUrl: string,
  file: File,
  onProgresso: (pct: number) => void,
  registrarAbort: (xhr: XMLHttpRequest) => void,
): Promise<EnvioResultado> {
  return new Promise((resolve) => {
    const corpo = new FormData();
    // O nome do campo é contrato da API do Cloudflare, não escolha nossa.
    corpo.append("file", file);

    const xhr = new XMLHttpRequest();
    registrarAbort(xhr);
    xhr.open("POST", uploadUrl);

    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable) {
        onProgresso(Math.round((evento.loaded / evento.total) * 100));
      }
    };
    xhr.onload = () =>
      resolve(
        xhr.status >= 200 && xhr.status < 300
          ? { ok: true }
          : { ok: false, mensagem: `O envio foi recusado (${xhr.status}). Tente de novo.` },
      );
    xhr.onerror = () =>
      resolve({ ok: false, mensagem: "Falha de conexão durante o envio. Tente de novo." });
    xhr.ontimeout = () => resolve({ ok: false, mensagem: "O envio demorou demais e parou." });
    xhr.onabort = () => resolve({ ok: false, mensagem: "Envio cancelado." });

    xhr.send(corpo);
  });
}

export function VideoUploader({
  dogId,
  dogName,
  video,
  habilitado,
}: {
  dogId: string;
  dogName: string;
  /** A linha gravada, ou `null`. Fonte de verdade sobre a transcodificação. */
  video: DogVideoRow | null;
  /** Há credencial do Cloudflare configurada no servidor? */
  habilitado: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [fase, setFase] = useState<Fase>({ tipo: "ocioso" });
  const [removendo, setRemovendo] = useState(false);
  const [demorou, setDemorou] = useState(false);

  const processando = video !== null && !isTerminal(video.status);

  // Aborta o envio em curso se o usuário sair da página no meio.
  useEffect(() => {
    return () => xhrRef.current?.abort();
  }, []);

  /**
   * O laço que atravessa a transcodificação.
   *
   * Só roda enquanto o status guardado não for terminal. `syncVideoStatus` não
   * chega a tocar no Cloudflare depois que o vídeo fica pronto, então mesmo um
   * laço que escapasse não geraria tráfego externo.
   */
  useEffect(() => {
    if (!processando) return;

    let cancelado = false;
    let tentativas = 0;
    let timer: ReturnType<typeof setTimeout>;

    const bater = async () => {
      if (cancelado) return;
      tentativas += 1;

      const resultado = await syncVideoStatus(dogId);
      if (cancelado) return;

      if (resultado.ok && isTerminal(resultado.status)) {
        // A Server Action já revalidou o cache; isto redesenha esta tela com o
        // vídeo pronto (ou com o erro) vindo do servidor.
        router.refresh();
        return;
      }

      if (tentativas >= POLL_MAX_ATTEMPTS) {
        // NÃO é erro: o estado vive no banco e a página reconcilia ao abrir.
        // A mensagem diz exatamente isso, em vez de fingir uma falha.
        setDemorou(true);
        return;
      }

      timer = setTimeout(() => void bater(), POLL_INTERVAL_MS);
    };

    timer = setTimeout(() => void bater(), POLL_INTERVAL_MS);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [processando, dogId, router]);

  async function aoEscolher(file: File | undefined) {
    if (!file) return;
    setDemorou(false);

    // Formato e tamanho barram na hora; a duração exige decodificar os
    // metadados, então só entra na segunda checagem.
    const basico = validateVideoFile({ type: file.type, size: file.size });
    if (!basico.ok) {
      setFase({ tipo: "erro", mensagem: basico.reason });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setFase({ tipo: "preparando" });

    const duracao = await lerDuracao(file);
    const completo = validateVideoFile({
      type: file.type,
      size: file.size,
      durationSeconds: duracao,
    });
    if (!completo.ok) {
      setFase({ tipo: "erro", mensagem: completo.reason });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const bilhete = await requestVideoUpload(dogId);
    if (!bilhete.ok) {
      setFase({ tipo: "erro", mensagem: bilhete.error });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setFase({ tipo: "enviando", progresso: 0 });

    const envio = await enviarArquivo(
      bilhete.uploadUrl,
      file,
      (pct) => setFase({ tipo: "enviando", progresso: pct }),
      (xhr) => {
        xhrRef.current = xhr;
      },
    );
    xhrRef.current = null;
    if (inputRef.current) inputRef.current.value = "";

    if (!envio.ok) {
      // A linha já existe em `pendingupload`. Removê-la aqui devolve a vaga do
      // índice único e apaga o vídeo reservado no Cloudflare — sem isso, o
      // usuário ficaria travado em "já tem um vídeo" sem ter nenhum.
      await removeDogVideo(dogId);
      setFase({ tipo: "erro", mensagem: envio.mensagem });
      router.refresh();
      return;
    }

    setFase({ tipo: "ocioso" });
    // Traz a linha do servidor; o `useEffect` acima assume daí em diante.
    router.refresh();
  }

  async function aoRemover() {
    setRemovendo(true);
    const resultado = await removeDogVideo(dogId);
    setRemovendo(false);
    if (!resultado.ok) {
      setFase({ tipo: "erro", mensagem: resultado.error });
      return;
    }
    setFase({ tipo: "ocioso" });
    setDemorou(false);
    router.refresh();
  }

  const inputId = `video-upload-${dogId}`;

  // ---------------------------------------------------------------------------

  if (!habilitado && !video) {
    // Degradação, não erro: sem credencial no servidor o recurso simplesmente
    // não existe nesta instalação. Aparece só aqui, para o dono — a página
    // pública fica exatamente como estava.
    return (
      <p className="text-fg-muted text-sm">
        O envio de vídeo não está disponível no momento.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {video && video.status === "ready" && video.playback_origin ? (
        <>
          <DogVideo
            providerUid={video.provider_uid}
            playbackOrigin={video.playback_origin}
            thumbnailUrl={video.thumbnail_url}
            durationSeconds={video.duration_seconds}
            dogName={dogName}
          />
          <button
            type="button"
            onClick={() => void aoRemover()}
            disabled={removendo}
            className="border-danger text-danger hover:bg-danger-subtle rounded-control self-start border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {removendo ? "Removendo…" : "Remover vídeo"}
          </button>
          <p className="text-fg-faint text-xs">
            Para trocar o vídeo, remova este e envie outro. É um vídeo por cão.
          </p>
        </>
      ) : null}

      {video && video.status === "error" ? (
        <>
          <p
            role="alert"
            className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
          >
            {video.error_reason ?? "O vídeo não pôde ser processado."}
          </p>
          <button
            type="button"
            onClick={() => void aoRemover()}
            disabled={removendo}
            className="border-border-strong text-fg hover:bg-surface-hover rounded-control self-start border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {removendo ? "Removendo…" : "Remover e tentar de novo"}
          </button>
        </>
      ) : null}

      {fase.tipo === "preparando" ? (
        <p role="status" className="text-fg-muted text-sm">
          Preparando o envio…
        </p>
      ) : null}

      {fase.tipo === "enviando" ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-fg-muted text-sm">
            Enviando… {fase.progresso}%
          </p>
          {/* `<progress>` nativo: já é anunciado por leitor de tela e já tem o
              papel semântico certo, sem `role`/`aria-*` à mão. */}
          <progress
            value={fase.progresso}
            max={100}
            aria-label="Progresso do envio do vídeo"
            className="border-border bg-surface-hover h-1.5 w-full max-w-sm overflow-hidden rounded-full border-0"
          />
        </div>
      ) : null}

      {processando && fase.tipo !== "enviando" && fase.tipo !== "preparando" ? (
        <p role="status" className="text-fg-muted text-sm">
          {demorou
            ? "O vídeo ainda está sendo processado. Pode fechar esta página — ele aparece aqui quando ficar pronto."
            : "Processando o vídeo… você pode sair desta página."}
        </p>
      ) : null}

      {fase.tipo === "erro" ? (
        <p
          role="alert"
          className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {fase.mensagem}
        </p>
      ) : null}

      {!video && fase.tipo !== "preparando" && fase.tipo !== "enviando" ? (
        <>
          <label htmlFor={inputId} className="text-fg text-sm font-medium">
            Adicionar vídeo
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED_VIDEO_MIMES.join(",")}
            onChange={(e) => void aoEscolher(e.target.files?.[0])}
            className="text-fg-muted file:bg-surface-hover file:text-fg hover:file:bg-surface-raised file:rounded-control text-sm file:mr-3 file:cursor-pointer file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
          />
          <p className="text-fg-faint text-xs">
            Um vídeo por cão, de até {MAX_VIDEO_SECONDS} segundos e{" "}
            {formatBytes(MAX_VIDEO_BYTES)}. MP4, MOV ou WebM. O arquivo vai direto do seu aparelho
            para o serviço de vídeo e leva alguns instantes para ficar pronto.
          </p>
        </>
      ) : null}
    </div>
  );
}
