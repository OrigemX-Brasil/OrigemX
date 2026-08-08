"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Foto em tela cheia ao clicar, tanto no canil quanto no cão.
 *
 * `<dialog>` nativo, não um componente de terceiro: `showModal()` já prende o
 * foco, Escape já fecha, e o foco já volta pra quem abriu — de graça, numa
 * página que abre por QR em 4G e não pode pagar o peso de mais uma lib.
 *
 * Dois componentes:
 *   `PublicGallery`  — dono do estado (índice aberto) e do `<dialog>`.
 *   `PhotoTrigger`   — o `<button>` que abre, na foto certa. Fica perto da
 *                       `PublicImage` real (renderizada no servidor) — este
 *                       arquivo nunca desenha a miniatura, só a versão ampliada.
 *
 * `PublicImage` continua chegando como `children`, renderizada no SERVIDOR:
 * componente de servidor pode ser filho de componente de cliente sem virar
 * cliente ele mesmo. O JS que baixa aqui é só o do gatilho e do diálogo, não
 * o da imagem.
 */

export type LightboxPhoto = { url: string; alt: string };

type GalleryContextValue = { open: (index: number) => void };

const GalleryContext = createContext<GalleryContextValue | null>(null);

export function PublicGallery({
  photos,
  children,
}: {
  photos: readonly LightboxPhoto[];
  children: React.ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // O `<dialog>` é imperativo por natureza (`showModal`/`close`), então o
  // estado do React só decide QUANDO chamar cada um — não tenta desenhar o
  // diálogo aberto/fechado via CSS, que perderia o foco preso e o Escape.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (index !== null && !dialog.open) dialog.showModal();
    if (index === null && dialog.open) dialog.close();
  }, [index]);

  const close = useCallback(() => setIndex(null), []);
  const prev = useCallback(
    () => setIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length)),
    [photos.length],
  );
  const next = useCallback(
    () => setIndex((i) => (i === null ? i : (i + 1) % photos.length)),
    [photos.length],
  );

  const photo = index !== null ? photos[index] : null;

  return (
    <GalleryContext.Provider value={{ open: setIndex }}>
      {children}

      {/*
        Do tamanho da viewport de propósito: clicar fora da foto precisa
        fechar, e o truque padrão pra isso é `e.target === e.currentTarget`
        — só é verdade quando o clique cai no PRÓPRIO elemento `dialog`
        (a moldura), nunca num filho. Se o dialog fosse do tamanho da foto,
        esse clique nunca aconteceria e "fora" não teria como fechar nada.
      */}
      <dialog
        ref={dialogRef}
        onClose={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            prev();
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            next();
          }
        }}
        aria-label={photo?.alt}
        className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none border-0 bg-transparent p-4 backdrop:bg-bg/90 sm:p-8"
      >
        {photo ? (
          <div className="relative flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.alt}
              className="max-h-full max-w-full rounded-card object-contain"
            />

            <button
              type="button"
              onClick={close}
              aria-label="Fechar"
              className="bg-bg/70 text-fg hover:bg-bg/90 focus-visible:outline-ring absolute top-3 right-3 flex size-10 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <CloseIcon />
            </button>

            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Foto anterior"
                  className="bg-bg/70 text-fg hover:bg-bg/90 focus-visible:outline-ring absolute top-1/2 left-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:left-4"
                >
                  <ChevronIcon direction="left" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Próxima foto"
                  className="bg-bg/70 text-fg hover:bg-bg/90 focus-visible:outline-ring absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:right-4"
                >
                  <ChevronIcon direction="right" />
                </button>
                <span className="bg-bg/70 text-fg-muted absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 font-mono text-xs tabular-nums">
                  {index! + 1} / {photos.length}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </GalleryContext.Provider>
  );
}

/**
 * Torna clicável a foto passada como `children` (uma `PublicImage` já
 * renderizada). `index` é a posição dela no array `photos` de `PublicGallery`.
 */
export function PhotoTrigger({
  index,
  label,
  className,
  children,
}: {
  index: number;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(GalleryContext);
  if (!ctx) throw new Error("PhotoTrigger precisa estar dentro de PublicGallery.");

  return (
    <button type="button" onClick={() => ctx.open(index)} aria-label={label} className={className}>
      {children}
    </button>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
