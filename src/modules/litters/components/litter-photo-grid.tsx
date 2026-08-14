import Image from "next/image";

import { deleteMedia } from "@/modules/media/actions";
import { aspectOf, formatBytes } from "@/modules/media/constraints";
import type { ResolvedMedia } from "@/modules/media/queries";

import { MAX_LITTER_PHOTOS } from "../constraints";

/**
 * Grade de fotos da ninhada — até `MAX_LITTER_PHOTOS`, cada uma com
 * "Remover".
 *
 * NÃO reaproveita `MediaGallery` (media/components/media-gallery.tsx): lá
 * "Capa" e o botão de legenda são condicionados a `item.dog_id` (verdadeiro
 * só na galeria do cão), e o rodapé imprime `MAX_GALLERY_ITEMS`/
 * `MAX_USER_BYTES` fixos. Adaptar esses condicionais custaria mais que este
 * componente — que também não precisa de "tornar capa": a capa da ninhada é
 * sempre `position = 1` (a query que alimenta isto já ordena por posição), e
 * com só 4 fotos trocar é apagar + subir outra, não reordenar.
 */
export function LitterPhotoGrid({ items }: { items: ResolvedMedia[] }) {
  if (items.length === 0) {
    return <p className="text-fg-muted text-sm">Nenhuma foto ainda.</p>;
  }

  return (
    // `data-testid`: mesmo motivo de `MediaGallery` — distinguir a grade
    // CONFIRMADA (servida pelo servidor) da prévia LOCAL que `GalleryUploader`
    // mostra enquanto a foto ainda está subindo, na mesma seção "Fotos".
    <div className="flex flex-col gap-3" data-testid="litter-photo-grid">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item, index) => {
          const isCover = index === 0;
          const proporcao = aspectOf(item);

          return (
            <li
              key={item.id}
              className="border-border bg-surface rounded-card flex flex-col gap-2 border p-2"
            >
              <div className="bg-surface-hover rounded-control relative overflow-hidden">
                {item.thumbUrl ? (
                  <Image
                    src={item.thumbUrl}
                    alt={item.alt ?? ""}
                    width={proporcao.width}
                    height={proporcao.height}
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="h-auto w-full"
                    unoptimized
                  />
                ) : (
                  <span className="text-fg-faint flex aspect-square items-center justify-center text-xs">
                    sem prévia
                  </span>
                )}
                {isCover ? (
                  <span className="bg-accent text-fg-on-accent rounded-control absolute top-2 left-2 z-10 px-2 py-0.5 text-[11px] font-medium">
                    Capa
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-fg-faint font-mono text-xs">
                  {formatBytes(item.size_bytes)}
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
            </li>
          );
        })}
      </ul>

      <p className="text-fg-faint text-xs">
        {items.length} de {MAX_LITTER_PHOTOS} fotos
      </p>
    </div>
  );
}
