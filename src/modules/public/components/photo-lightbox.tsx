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

export type LightboxPhoto = { url: string; alt: string; caption?: string | null };

type GalleryContextValue = { open: (index: number) => void };

const GalleryContext = createContext<GalleryContextValue | null>(null);

export function PublicGallery({
  photos,
  description,
  children,
}: {
  photos: readonly LightboxPhoto[];
  /**
   * Bloco de texto fixo no topo do diálogo, visível em QUALQUER foto (ou
   * sem foto nenhuma) — diferente de `caption`, que é por foto. Existe para
   * a ninhada: a "ficha" dela é a descrição completa, não uma legenda presa
   * a uma imagem específica. Os dois usos antigos (logo, mosaico do cão) não
   * passam isto — comportamento idêntico ao de antes.
   */
  description?: string | null;
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

  // `?? null`: com `description` e SEM foto (ninhada sem nenhuma), `index`
  // abre em 0 mas `photos` está vazio — `photos[0]` é `undefined`, não
  // `null`, e o restante do arquivo testa contra `null`/falsy.
  const photo = index !== null ? (photos[index] ?? null) : null;

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
        {/*
          Condicionado a "diálogo ABERTO" (`index !== null`), não a "existe
          foto": uma ninhada sem foto nenhuma é estado válido (foto não é
          obrigatória), e antes disso o diálogo abriria vazio, sem sequer o
          botão de fechar — ele vivia DENTRO do bloco condicionado a `photo`.
          Só a ÁREA DE FOTO (com setas e contador) continua condicionada a
          `photo` existir.
        */}
        {index !== null ? (
          <div className="relative flex h-full w-full flex-col items-center justify-center gap-4">
            {/*
              Sem foto (ninhada só com descrição, ainda sem imagem), o botão
              não tem em que ancorar — fica preso ao canto do DIÁLOGO, como
              sempre foi. Com foto, ele muda de lugar (ver abaixo, dentro do
              wrapper que abraça a imagem) e este aqui não é renderizado.
            */}
            {!photo ? (
              <button
                type="button"
                onClick={close}
                aria-label="Fechar"
                className="bg-bg/70 text-fg hover:bg-bg/90 focus-visible:outline-ring absolute top-3 right-3 z-10 flex size-10 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <CloseIcon />
              </button>
            ) : null}

            {description ? (
              // `pr-14` só é preciso quando o botão de fechar ainda está no
              // canto do diálogo (sem foto) — com foto, ele migrou para cima
              // da imagem e não disputa mais espaço com este parágrafo.
              <p
                className={`bg-bg/70 text-fg rounded-card max-h-[30vh] w-full max-w-prose overflow-y-auto py-3 pl-4 text-sm whitespace-pre-line ${photo ? "pr-4" : "pr-14"}`}
              >
                {description}
              </p>
            ) : null}

            {photo ? (
              <>
                <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
                  {/*
                    Wrapper que ABRAÇA o tamanho real da foto renderizada
                    (`inline-block` encolhe para o conteúdo), não o container
                    inteiro disponível — é o que permite ancorar o × e o
                    contador no canto da IMAGEM, não do diálogo. Só funciona
                    porque a imagem usa `max-h-[…dvh]`, não porcentagem: um
                    limite em porcentagem exigiria um ancestral de altura já
                    definida, e um wrapper que encolhe para o conteúdo é
                    justamente o oposto disso.

                    `min-h`/`min-w`: sem eles, ANTES da foto carregar (a
                    página abre por QR, muitas vezes em 4G) o wrapper encolhe
                    para o conteúdo de uma `<img>` ainda sem dimensão
                    nenhuma — ou seja, quase zero — e o × e o contador
                    aparecem amontoados no centro do diálogo até a imagem
                    chegar. O piso garante uma área estável desde o primeiro
                    paint; a imagem cresce dentro dela normalmente.
                  */}
                  <div className="bg-surface rounded-card relative inline-block max-w-full min-h-[40dvh] min-w-[40dvw]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.alt}
                      className="block max-h-[60dvh] max-w-full rounded-card object-contain sm:max-h-[70dvh]"
                    />

                    <button
                      type="button"
                      onClick={close}
                      aria-label="Fechar"
                      className="focus-visible:outline-ring absolute -top-2 -right-2 z-10 flex size-10 items-center justify-center rounded-full bg-black/80 text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <CloseIcon />
                    </button>

                    {photos.length > 1 ? (
                      <span className="bg-bg/70 text-fg-muted absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 font-mono text-xs tabular-nums">
                        {index! + 1} / {photos.length}
                      </span>
                    ) : null}
                  </div>

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
                    </>
                  ) : null}
                </div>

                {photo.caption ? (
                  <p className="bg-bg/70 text-fg rounded-card w-full max-w-prose px-3 py-1.5 text-center text-sm">
                    {photo.caption}
                  </p>
                ) : null}
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
