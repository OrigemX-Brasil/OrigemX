"use client";

import { useRef, useState, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";

import { registerMedia } from "../actions";
import {
  ACCEPTED_INPUT_MIMES,
  BUCKET_PRIVATE,
  buildStoragePath,
  buildThumbPath,
  extensionForMime,
  formatBytes,
  validateInputFile,
  type MediaRole,
} from "../constraints";
import { compressImage } from "../resize";

/**
 * Envio de imagem.
 *
 * O fluxo tem três passos e a ordem importa:
 *   1. comprimir NO CLIENT — é o que decide se o plano de armazenamento dura;
 *   2. subir os dois arquivos direto para o Storage, com a sessão do usuário,
 *      onde a policy compara o primeiro segmento do caminho com auth.uid();
 *   3. registrar a metadata numa Server Action, que reconfere tamanho e mime
 *      lendo o Storage — nunca acreditando no que este componente afirma.
 *
 * O binário não passa pelo servidor Next em momento nenhum, e nunca vira
 * base64: sempre Blob.
 */
export function ImageUploader({
  role,
  entityId,
  ownerId,
  label,
  helpText,
  onUploaded,
}: {
  role: MediaRole;
  entityId: string;
  ownerId: string;
  label: string;
  helpText?: string;
  onUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleFile = async (file: File) => {
    setError(null);

    const check = validateInputFile(file);
    if (!check.ok) {
      setError(check.reason);
      return;
    }

    setStatus("Preparando a imagem…");

    let compressed;
    try {
      compressed = await compressImage(file);
    } catch {
      setStatus(null);
      setError("Não foi possível processar esta imagem. Tente outro arquivo.");
      return;
    }

    const { full, thumb } = compressed;
    const extension = extensionForMime(full.mime);
    const fileId = crypto.randomUUID();
    const storagePath = buildStoragePath({ ownerId, role, entityId, fileId, extension });
    const thumbPath = buildThumbPath(storagePath);

    setStatus(`Enviando ${formatBytes(full.bytes + thumb.bytes)}…`);

    const supabase = createClient();
    const upload = async (path: string, blob: Blob) =>
      supabase.storage.from(BUCKET_PRIVATE).upload(path, blob, {
        contentType: full.mime,
        // Caminho carrega uuid, então nunca colide — e sobrescrever silencioso
        // esconderia um bug de geração de id.
        upsert: false,
        // 1 hora, e NÃO "imutável".
        //
        // O CONTEÚDO é imutável — o caminho tem uuid e o arquivo nunca muda. Mas
        // a AUTORIZAÇÃO para vê-lo não é: despublicar move o objeto para o
        // bucket privado, e o CDN continua servindo a cópia em cache até o TTL
        // vencer. Com um ano, uma imagem despublicada ficaria acessível por um
        // ano para quem tivesse o link direto.
        //
        // Uma hora limita a janela e ainda dá taxa de acerto altíssima no
        // cenário que importa: milhares de leituras de QR ao longo de uma feira.
        cacheControl: "3600",
      });

    const [fullUp, thumbUp] = await Promise.all([
      upload(storagePath, full.blob),
      upload(thumbPath, thumb.blob),
    ]);

    if (fullUp.error || thumbUp.error) {
      setStatus(null);
      setError("Falha no envio. Verifique a conexão e tente de novo.");
      // Não deixa metade subida ocupando plano.
      await supabase.storage.from(BUCKET_PRIVATE).remove([storagePath, thumbPath]);
      return;
    }

    setStatus("Registrando…");

    startTransition(async () => {
      const fd = new FormData();
      fd.set("role", role);
      fd.set("entity_id", entityId);
      fd.set("storage_path", storagePath);
      fd.set("thumb_path", thumbPath);
      fd.set("width", String(full.width));
      fd.set("height", String(full.height));

      const result = await registerMedia({}, fd);
      setStatus(null);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (inputRef.current) inputRef.current.value = "";
      onUploaded?.();
    });
  };

  const busy = pending || status !== null;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`upload-${role}-${entityId}`} className="text-fg text-sm font-medium">
        {label}
      </label>

      <input
        ref={inputRef}
        id={`upload-${role}-${entityId}`}
        type="file"
        accept={ACCEPTED_INPUT_MIMES.join(",")}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="text-fg-muted file:bg-surface-hover file:text-fg hover:file:bg-surface-raised file:rounded-control text-sm file:mr-3 file:cursor-pointer file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-60"
      />

      {helpText ? <p className="text-fg-faint text-xs">{helpText}</p> : null}

      <p className="text-fg-faint text-xs">
        A imagem é reduzida e comprimida no seu aparelho antes do envio — o arquivo original não
        sobe.
      </p>

      {status ? (
        <p role="status" className="text-fg-muted text-xs">
          {status}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
