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

export type LightboxPhoto = {
  url: string;
  alt: string;
  caption?: string | null;
  /** Dimensão REAL da foto, quando conhecida — reserva a caixa certa antes de
   *  carregar, mesmo raciocínio do mosaico do cão. Ver o comentário em
   *  `PublicGallery` sobre por que isso substitui o piso fixo antigo. */
  width?: number | null;
  height?: number | null;
};

type GalleryContextValue = { open: (index: number) => void };

const GalleryContext = createContext<GalleryContextValue | null>(null);

export function PublicGallery({
  photos,
  description,
  children,
}: {
  photos: readonly LightboxPhoto[];
  /**
   * Bloco de texto visível em QUALQUER foto — diferente de `caption`, que é
   * por foto. Existe para a ninhada: a "ficha" dela é a descrição completa,
   * não uma legenda presa a uma imagem específica. Os dois usos antigos
   * (logo, mosaico do cão) não passam isto — comportamento idêntico ao de
   * antes.
   *
   * Rodapé da foto, junto com `caption` — não mais o topo do diálogo. Só
   * SEM foto nenhuma (ninhada com descrição mas ainda sem imagem) é que
   * continua no topo, junto do botão de fechar: aí não há foto para colar
   * embaixo dela.
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

            {/* SEM foto (ninhada só com descrição, ainda sem imagem): nada para
                ancorar embaixo de — a descrição fica onde sempre esteve,
                junto do botão de fechar do canto do diálogo. */}
            {!photo && description ? (
              <p className="bg-bg/70 text-fg rounded-card max-h-[30vh] w-full max-w-prose overflow-y-auto py-3 pr-14 pl-4 text-sm whitespace-pre-line">
                {description}
              </p>
            ) : null}

            {photo ? (
              <>
                {/*
                  SEM `flex-1` DE PROPÓSITO — era o que causava o defeito.
                  Com `flex-1`, esta faixa absorvia TODO o espaço vertical
                  sobrando do diálogo, e o `justify-center` dela centralizava
                  a foto DENTRO dessa faixa gigante — numa foto mais larga
                  que alta (comum: paisagem, mosaico do canil), a foto
                  sobrava perto do topo da tela e a legenda, vindo DEPOIS
                  desta faixa, ficava presa lá embaixo, com um vão vazio
                  enorme entre as duas.

                  Sem `flex-1`, a faixa encolhe para o tamanho real da foto —
                  e é o `justify-center` do CONTAINER PAI que centraliza o
                  GRUPO (foto + legenda) como uma unidade só, com a legenda
                  colada embaixo da foto em vez de presa ao rodapé da tela.
                */}
                <div className="relative flex min-h-0 w-full items-center justify-center">
                  {/*
                    Wrapper que ABRAÇA o tamanho real da foto renderizada
                    (`inline-block` encolhe para o conteúdo), não o container
                    inteiro disponível — é o que permite ancorar o × e o
                    contador no canto da IMAGEM, não do diálogo. Só funciona
                    porque a imagem usa `max-h-[…dvh]`, não porcentagem: um
                    limite em porcentagem exigiria um ancestral de altura já
                    definida, e um wrapper que encolhe para o conteúdo é
                    justamente o oposto disso.

                    `width`/`height` REAIS no `<img>`, quando conhecidas:
                    é o que deixa o navegador reservar a proporção certa
                    ANTES de baixar um byte sequer, sem depender de um piso
                    fixo — mesmo raciocínio do mosaico do cão ("Proporção
                    REAL da foto, não 320×320 cravado"). Um piso fixo
                    resolvia o salto ANTES de carregar, mas continuava
                    valendo DEPOIS: numa foto mais larga que alta, sobrava
                    fundo vazio dentro do próprio cartão — o mesmo vão que
                    empurrava a legenda para longe, só que morando aqui
                    dentro em vez de entre a foto e o texto.

                    `min-h`/`min-w` de 40dvh/dvw viram um FALLBACK, só para
                    quando a dimensão é desconhecida (`media.width`/`height`
                    são NULLABLE — coluna criada depois de já haver mídia
                    gravada). Nesse caso raro, sem a proporção real para
                    reservar, o piso volta a ser o que evita o × e o contador
                    amontoados no centro do diálogo até a imagem chegar.

                    `width`/`height` como ATRIBUTO do HTML não é só um hint
                    que "some": o navegador trata como `width`/`height` de
                    baixa prioridade no CSS, ou seja, DEIXAM DE SER 'auto'.
                    Com `max-width`/`max-height` sozinhos isso não muda nada
                    — mas aqui, com os dois batendo ao mesmo tempo (foto
                    retrato: mais alta que a tela é larga), cada eixo passa a
                    ser cortado DE FORMA INDEPENDENTE (a proporção some, a
                    foto distorce), porque o algoritmo que preserva proporção
                    só roda quando width E height do CSS são 'auto'. Medido:
                    uma foto 900×1400 virava caixa de 358×506 (deveria ser
                    325×506). `w-auto h-auto` reafirma o 'auto' que o
                    atributo tirou, e a proporção volta.
                  */}
                  <div
                    className={`bg-surface rounded-card relative inline-block max-w-full ${
                      photo.width && photo.height ? "" : "min-h-[40dvh] min-w-[40dvw]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.alt}
                      width={photo.width ?? undefined}
                      height={photo.height ?? undefined}
                      className="block h-auto max-h-[60dvh] w-auto max-w-full rounded-card object-contain sm:max-h-[70dvh]"
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

                {/* A descrição da ninhada (contexto de TODAS as fotos) e a
                    legenda desta foto, juntas, coladas ao rodapé da imagem —
                    não mais soltas no topo do diálogo nem estranhadas lá
                    embaixo, longe da foto que descrevem. */}
                {description || photo.caption ? (
                  <div className="flex w-full max-w-prose flex-col items-center gap-1.5">
                    {description ? (
                      <p className="bg-bg/70 text-fg rounded-card max-h-[30vh] w-full overflow-y-auto px-4 py-3 text-center text-sm whitespace-pre-line">
                        {description}
                      </p>
                    ) : null}
                    {photo.caption ? (
                      <p className="bg-bg/70 text-fg rounded-card w-full px-3 py-1.5 text-center text-sm">
                        {photo.caption}
                      </p>
                    ) : null}
                  </div>
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
