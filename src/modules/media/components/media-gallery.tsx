import Image from "next/image";

import { deleteMedia, setDogGalleryCover } from "../actions";
import { aspectOf, formatBytes, MAX_GALLERY_ITEMS, MAX_USER_BYTES } from "../constraints";
import type { ResolvedMedia } from "../queries";

/**
 * Galeria do cão e prévia do logo.
 *
 * REGRA: a listagem usa SEMPRE `thumbUrl`. Uma galeria de 12 fotos em tamanho
 * cheio baixaria alguns MB; nos thumbnails, dezenas de KB. Se `thumbUrl` for
 * nulo, o item aparece sem imagem em vez de cair para o arquivo cheio — o
 * fallback silencioso é justamente o que faz a regra se perder com o tempo.
 *
 * CAPA: o primeiro item de `items` — a query que alimenta este componente já
 * ordena por `position, created_at`, a MESMA ordem que a página pública usa
 * para escolher a foto principal (`const [principal, ...resto] = media`).
 * "Tornar capa" só aparece nos demais; o primeiro já é a capa, não precisa
 * do próprio botão.
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
    // `data-testid`: a galeria CONFIRMADA (servida pelo servidor, com
    // `thumbUrl` real) precisa de um seletor que a distinga da prévia LOCAL
    // que `GalleryUploader` mostra enquanto processa — as duas vivem na mesma
    // seção "Galeria" da tela, e um `<img>` da prévia local aparece bem antes
    // do upload terminar. Sem esta distinção, um teste esperando "a galeria
    // mostra a foto" passaria cedo demais, olhando para o preview local.
    <div className="flex flex-col gap-4" data-testid="media-gallery">
      {/*
        Mosaico em COLUNAS: cada foto aparece na proporção em que foi enviada.
        Antes, `aspect-square` + `object-cover` recortavam tudo em quadrado —
        o criador via a foto em pé cortada em cima e embaixo e não tinha como
        saber o que o perfil público mostraria.

        `break-inside-avoid` nos itens evita o cartão ser partido entre duas
        colunas; o espaço vertical sai de `mb-3`, porque `gap` em multi-coluna
        só se aplica entre colunas.
      */}
      <ul className="columns-2 gap-3 sm:columns-3 md:columns-4">
        {items.map((item, index) => {
          const isCover = index === 0;
          const proporcao = aspectOf(item);

          return (
            <li
              key={item.id}
              className="border-border bg-surface rounded-card mb-3 flex break-inside-avoid flex-col gap-2 border p-2"
            >
              {/* `relative` fica: é o que ancora o selo "Capa". */}
              <div className="bg-surface-hover rounded-control relative overflow-hidden">
                {item.thumbUrl ? (
                  <Image
                    src={item.thumbUrl}
                    alt={item.alt ?? ""}
                    // Sem `fill`: ele exige caixa de altura fixa no pai, que é
                    // exatamente o quadrado que saiu daqui. Com width/height
                    // reais + `h-auto w-full`, a altura vem da proporção.
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

              {!isCover && item.dog_id ? (
                <form action={setDogGalleryCover}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="dog_id" value={item.dog_id} />
                  <button
                    type="submit"
                    className="text-fg-muted hover:text-fg self-start text-xs transition-colors"
                  >
                    Tornar capa
                  </button>
                </form>
              ) : null}
              <span className="text-fg-faint font-mono text-xs">
                {formatBytes(item.size_bytes)}
              </span>
            </li>
          );
        })}
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
