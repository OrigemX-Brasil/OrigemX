"use client";

import { useEffect, useRef, useState } from "react";

import {
  ACCEPTED_INPUT_MIMES,
  GALLERY_UPLOAD_CONCURRENCY,
  MAX_GALLERY_ITEMS,
} from "../constraints";
import { runWithConcurrency, splitByGalleryLimit } from "../upload-queue";
import { uploadOneImage, type UploadOneResult } from "../upload-one";

type Phase = "aguardando" | "processando" | "concluida" | "falhou";

type QueueItem = {
  key: string;
  file: File;
  /** `URL.createObjectURL`, local — prévia instantânea, antes de qualquer rede. */
  previewUrl: string;
  phase: Phase;
  label: string;
};

/**
 * ============================================================================
 * Upload em lote da galeria do cão.
 * ============================================================================
 *
 * NÃO substitui `image-uploader.tsx`, que continua servindo o logo do canil —
 * 1:1, sem seleção múltipla, fora do que este componente resolve.
 *
 * O LIMITE DE {MAX_GALLERY_ITEMS} tem duas camadas, e só uma é nova aqui:
 *
 *   cliente (`remaining`, abaixo)  → corta a seleção para caber, avisa o
 *                                    resto — conveniência, evita disparar
 *                                    upload que o servidor recusaria.
 *   servidor (`registerMedia`)     → confere de novo, por arquivo, e é quem
 *                                    decide de verdade. Intocado.
 *
 * `remaining` é lido DIRETO do prop a cada seleção, nunca copiado para um
 * `useState` fixo no mount: a página já revalida sozinha depois de cada
 * upload bem-sucedido (é o que o teste E2E do upload único já prova, sem
 * reload manual), então uma segunda seleção nesta mesma visita já enxerga a
 * contagem fresca — sem lógica extra de recontagem aqui.
 *
 * FALHA INDIVIDUAL: cada foto é uma chamada isolada a `uploadOneImage`,
 * despachada por `runWithConcurrency` — uma que falha não cancela nem atrasa
 * as outras, e fica com um botão de tentar de novo, só para ela.
 */
export function GalleryUploader({
  entityId,
  ownerId,
  remaining,
}: {
  entityId: string;
  ownerId: string;
  remaining: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Ref espelhando `queue`, só para o cleanup de unmount conseguir ler o
  // estado mais recente sem precisar listar `queue` como dependência do
  // efeito (o que recriaria o cleanup a cada patch de status).
  const queueRef = useRef<QueueItem[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    return () => {
      for (const item of queueRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  function updateItem(key: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  /** Processa UM item. Reusado tanto no lote inicial quanto no "Tentar de novo". */
  async function processItem(item: QueueItem): Promise<UploadOneResult> {
    updateItem(item.key, { phase: "processando", label: "Aguardando…" });
    try {
      const result = await uploadOneImage({
        file: item.file,
        role: "dog_gallery",
        entityId,
        ownerId,
        onStatus: (status) => updateItem(item.key, { label: status }),
      });
      updateItem(
        item.key,
        result.ok
          ? { phase: "concluida", label: "Concluída" }
          : { phase: "falhou", label: result.error },
      );
      return result;
    } catch (err) {
      // `uploadOneImage` já converte as falhas que conhece em `{ok:false}`;
      // isto aqui é a rede de segurança para o que não conhece (ex.: a
      // Server Action rejeitando por falha de conexão, não por regra).
      const message = err instanceof Error ? err.message : "Falha inesperada.";
      updateItem(item.key, { phase: "falhou", label: message });
      return { ok: false, error: message };
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    const { aceitos, recusados } = splitByGalleryLimit(files, remaining);
    setSummary(null);

    if (aceitos.length === 0) {
      setNotice(
        remaining <= 0
          ? `A galeria já está no limite de ${MAX_GALLERY_ITEMS} fotos.`
          : "Nenhuma foto pôde ser adicionada.",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setNotice(
      recusados.length > 0
        ? `Só ${aceitos.length === 1 ? "cabia" : "cabiam"} mais ${aceitos.length} ` +
            `foto${aceitos.length === 1 ? "" : "s"} (limite de ${MAX_GALLERY_ITEMS}). ` +
            `${recusados.length} ${recusados.length === 1 ? "não foi enviada" : "não foram enviadas"}.`
        : null,
    );

    // O lote anterior, se ainda estiver na tela, some — as prévias locais
    // dele não servem mais para nada (a galeria real, abaixo, já reflete o
    // resultado) e ficariam vazando memória se não revogadas.
    for (const old of queue) URL.revokeObjectURL(old.previewUrl);

    const items: QueueItem[] = aceitos.map((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      phase: "aguardando",
      label: "Aguardando…",
    }));

    setQueue(items);
    setRunning(true);

    const results = await runWithConcurrency(items, GALLERY_UPLOAD_CONCURRENCY, processItem);

    setRunning(false);
    if (inputRef.current) inputRef.current.value = "";

    const succeeded = results.filter((r) => r.ok && r.value.ok).length;
    const failedCount = items.length - succeeded;
    setSummary(
      failedCount === 0
        ? `${succeeded} de ${items.length} foto${items.length === 1 ? "" : "s"} enviada${succeeded === 1 ? "" : "s"}.`
        : `${succeeded} de ${items.length} enviada${succeeded === 1 ? "" : "s"} — ` +
            `${failedCount} ${failedCount === 1 ? "falhou" : "falharam"}.`,
    );
  }

  const inputId = `gallery-upload-${entityId}`;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={inputId} className="text-fg text-sm font-medium">
        Adicionar fotos
      </label>

      {remaining > 0 ? (
        <>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={ACCEPTED_INPUT_MIMES.join(",")}
            disabled={running}
            onChange={(e) => void handleFiles(e.target.files)}
            className="text-fg-muted file:bg-surface-hover file:text-fg hover:file:bg-surface-raised file:rounded-control text-sm file:mr-3 file:cursor-pointer file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-60"
          />
          <p className="text-fg-faint text-xs">
            Escolha uma ou várias fotos de uma vez. Cada imagem é reduzida e comprimida no seu
            aparelho antes do envio — o arquivo original não sobe.
          </p>
        </>
      ) : (
        <p className="text-fg-muted text-sm">
          Limite de {MAX_GALLERY_ITEMS} imagens atingido. Remova uma para enviar outra.
        </p>
      )}

      {notice ? (
        <p role="status" className="text-fg-muted text-xs">
          {notice}
        </p>
      ) : null}

      {queue.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {queue.map((item) => (
            <li
              key={item.key}
              className="border-border bg-surface rounded-card flex flex-col gap-1 border p-1.5"
            >
              <div className="bg-surface-hover rounded-control relative aspect-square overflow-hidden">
                {/* Prévia LOCAL (blob:), gerada antes de qualquer rede — é o
                    que dá feedback imediato de qual foto está em processamento.
                    `next/image` não serve para blob: URL; `<img>` puro é a
                    única opção correta aqui, não um desvio de padrão. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>

              <span
                // `role="alert"` só na falha — mesmo contrato de acessibilidade
                // que `FormMessage` já segue no resto do app: erro é anunciado
                // na hora, progresso não precisa interromper o leitor de tela.
                role={item.phase === "falhou" ? "alert" : undefined}
                className={
                  item.phase === "falhou"
                    ? "text-danger text-[11px]"
                    : item.phase === "concluida"
                      ? "text-success text-[11px]"
                      : "text-fg-muted text-[11px]"
                }
              >
                {item.label}
              </span>

              {item.phase === "falhou" ? (
                <button
                  type="button"
                  onClick={() => void processItem(item)}
                  className="text-link hover:text-link-hover self-start text-[11px] underline underline-offset-2"
                >
                  Tentar de novo
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {summary ? (
        <p role="status" className="text-fg-muted text-xs">
          {summary}
        </p>
      ) : null}
    </div>
  );
}
