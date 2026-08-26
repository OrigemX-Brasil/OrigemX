"use client";

import { useRef, type ReactNode } from "react";

/**
 * ============================================================================
 * O QR Code a um clique, de qualquer ponto da página.
 * ============================================================================
 *
 * `<dialog>` NATIVO, mesmo molde de `media/components/caption-dialog.tsx` e dos
 * três de `admin/components/`: foco preso, Escape e devolução do foco ao
 * gatilho vêm de graça do navegador, sem lib e sem máquina de estado.
 *
 * O CONTEÚDO CHEGA COMO `children`, e isso é o ponto do arquivo. `QrCard` é
 * Server Component: monta o SVG a partir da matriz de módulos, em JSX, sem um
 * byte de JavaScript no cliente. Recebê-lo como filho preserva isso — se este
 * componente importasse o `QrCard`, a árvore inteira viraria cliente e o
 * gerador de QR desceria para o navegador sem necessidade nenhuma.
 *
 * POR QUE EXISTE, se no desktop o QR já está no trilho fixo: no celular ele é
 * o penúltimo bloco de uma página longa (dados, galeria, vídeo, saúde,
 * medidas). O diálogo abre em qualquer viewport — um controle que existisse só
 * abaixo de `xl` seria mais difícil de explicar e de testar do que o pouco que
 * economizaria em duplicação no desktop.
 */
export function QrDialog({ children, label }: { children: ReactNode; label: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="border-border-strong text-fg hover:bg-surface-hover rounded-control focus-visible:outline-ring inline-flex items-center justify-center gap-2 border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
        </svg>
        Ver QR Code
      </button>

      {/*
        `hidden … open:flex` é obrigatório: um `flex` do Tailwind venceria o
        `display:none` nativo do dialog fechado. Mesmo combo dos diálogos de
        admin e de legenda.
      */}
      <dialog
        ref={dialogRef}
        aria-label={label}
        onClick={(e) => {
          // Só o clique no BACKDROP fecha. O alvo do evento é o próprio
          // `<dialog>` quando se clica fora do conteúdo — clique num filho
          // traz o filho como alvo, e aí não fecha.
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="backdrop:bg-overlay fixed inset-0 m-0 hidden h-dvh w-dvw max-w-none items-center justify-center border-0 bg-transparent p-4 open:flex"
      >
        <div className="border-border-glass bg-surface shadow-panel rounded-panel max-h-full w-full max-w-md overflow-y-auto border p-6">
          {children}

          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-fg-muted hover:text-fg rounded-control focus-visible:outline-ring px-4 py-2 text-sm transition-colors focus-visible:outline-2"
            >
              Fechar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
