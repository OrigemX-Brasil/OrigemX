import Image from "next/image";

import { deleteMedia } from "../actions";
import { formatBytes, MAX_GALLERY_ITEMS, MAX_USER_BYTES } from "../constraints";
import type { ResolvedMedia } from "../queries";

/**
 * Galeria do cão e prévia do logo.
 *
 * REGRA: a listagem usa SEMPRE `thumbUrl`. Uma galeria de 12 fotos em tamanho
 * cheio baixaria alguns MB; nos thumbnails, dezenas de KB. Se `thumbUrl` for
 * nulo, o item aparece sem imagem em vez de cair para o arquivo cheio — o
 * fallback silencioso é justamente o que faz a regra se perder com o tempo.
 */
export function MediaGallery({
  items,
  usedBytes,
  emptyText,
}: {
  items: ResolvedMedia[];
  usedBytes?: number;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-fg-muted text-sm">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <li
            key={item.id}
            className="border-border bg-surface rounded-card flex flex-col gap-2 border p-2"
          >
            <div className="bg-surface-hover rounded-control relative aspect-square overflow-hidden">
              {item.thumbUrl ? (
                <Image
                  src={item.thumbUrl}
                  alt={item.alt ?? ""}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-fg-faint flex h-full items-center justify-center text-xs">
                  sem prévia
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-fg-faint font-mono text-xs">
                {item.width && item.height ? `${item.width}×${item.height}` : "—"}
              </span>
              <form action={deleteMedia}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  className="text-fg-muted hover:text-danger text-xs transition-colors"
                >
                  Remover
                </button>
              </form>
            </div>
            <span className="text-fg-faint font-mono text-xs">{formatBytes(item.size_bytes)}</span>
          </li>
        ))}
      </ul>

      {typeof usedBytes === "number" ? (
        <p className="text-fg-faint text-xs">
          {items.length} de {MAX_GALLERY_ITEMS} imagens · {formatBytes(usedBytes)} de{" "}
          {formatBytes(MAX_USER_BYTES)} usados
        </p>
      ) : null}
    </div>
  );
}
