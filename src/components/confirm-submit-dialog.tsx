"use client";

import type { ReactNode, RefObject } from "react";
import { useFormStatus } from "react-dom";

/**
 * O contrato que um formulário aceita para pedir confirmação antes de gravar.
 *
 * `summary` recebe o que está digitado AGORA — o `FormData` do momento em que
 * o diálogo abriu. Os progenitores vêm à parte porque o `FormData` só carrega
 * os ids deles; o NOME só existe no estado do formulário.
 */
export type SubmitConfirm = {
  title: string;
  /** Texto do botão que ABRE a confirmação. O de dentro é `confirmLabel`. */
  openLabel: string;
  confirmLabel: string;
  summary: (data: FormData, parents: { sire: string | null; dam: string | null }) => ReactNode;
  /**
   * Checagem extra de quem chama, para campos que o formulário não conhece.
   * Roda AQUI porque `noValidate` está ligado nos formulários deste projeto —
   * `required` no campo não vale nada.
   */
  validate?: (data: FormData) => string | null;
};

/**
 * Confirmação antes de gravar. FICA DENTRO DO `<form>`, e nos dois sentidos:
 *
 *  - no DOM, porque `showModal()` promove o elemento à top layer sem tirá-lo da
 *    árvore: o botão de dentro continua sendo um `type="submit"` do formulário
 *    de fora — sem `form=` e sem formulário aninhado, que o HTML proíbe;
 *  - na árvore do React, porque `useFormStatus()` só enxerga o `<form>`
 *    ANCESTRAL. Um botão pendurado por `form=` submeteria certo e nunca ficaria
 *    "Salvando…" nem desabilitaria — justo o botão onde clique duplo dói.
 *
 * Mesmo `<dialog>` nativo de `HideEntityDialog`/`FounderNumberDialog`, inclusive
 * o `hidden … open:flex`: `display` de autor solto na className vence o
 * `display:none` que o navegador dá a um dialog fechado. O que muda é quem
 * abre — aqui é o `onSubmit` do formulário, depois de validar.
 */
export function ConfirmSubmitDialog({
  dialogRef,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  confirmLabel: string;
  /** Marca o passe que o `onSubmit` do formulário vai consumir. */
  onConfirm: () => void;
  /** Esc, clique no fundo e Cancelar caem todos aqui: o passe queima. */
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onClick={(e) => {
        // Clique fora do painel (no ::backdrop) chega aqui como clique no
        // próprio <dialog>, nunca num filho — é o que distingue os dois.
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="fixed inset-0 m-0 hidden h-dvh w-dvw max-w-none items-center justify-center border-0 bg-transparent p-4 backdrop:bg-overlay open:flex"
    >
      <div className="border-border-glass bg-surface shadow-panel rounded-panel flex w-full max-w-md flex-col gap-4 border p-6">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>

        {children}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="text-fg-muted hover:text-fg rounded-control px-4 py-2 text-sm transition-colors"
          >
            Cancelar
          </button>
          <Confirm label={confirmLabel} onClick={onConfirm} />
        </div>
      </div>
    </dialog>
  );
}

/**
 * `onClick` dispara ANTES do evento `submit` do formulário — é o que torna o
 * passe do `onSubmit` confiável sem `requestSubmit()`, que refaria o `submit`
 * e cairia no mesmo laço de interceptação.
 */
function Confirm({ label, onClick }: { label: string; onClick: () => void }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={onClick}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Salvando…" : label}
    </button>
  );
}
