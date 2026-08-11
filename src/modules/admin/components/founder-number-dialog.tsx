"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { setFounderNumber, type FounderNumberState } from "../actions";

/**
 * Corrigir o número do selo Fundador — mesmo `<dialog>` nativo de
 * `HideEntityDialog`/`SuspendUserDialog`. Sem checkbox extra: o diálogo em
 * si já é a confirmação explícita (abrir, ver o número atual, preencher,
 * confirmar).
 *
 * Diferença de propósito em relação aos outros dois diálogos: motivo aqui é
 * OBRIGATÓRIO (`required`, sem "(opcional)" nem padrão) — o pedido que
 * originou esta tela pede confirmação explícita e motivo, sem a folga que
 * suspender/ocultar têm.
 */
export function FounderNumberDialog({
  kennelId,
  name,
  currentNumber,
}: {
  kennelId: string;
  name: string;
  currentNumber: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [state, formAction] = useActionState<FounderNumberState, FormData>(
    async (_prev, formData) => setFounderNumber(formData),
    {},
  );

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state.ok]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm font-medium transition-colors"
      >
        Corrigir número
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-0 hidden h-dvh w-dvw max-w-none items-center justify-center border-0 bg-transparent p-4 backdrop:bg-overlay open:flex"
      >
        <div className="border-border-glass bg-surface shadow-panel rounded-panel w-full max-w-sm border p-6">
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="kennelId" value={kennelId} />

            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Corrigir número do selo — {name}
              </h2>
              <p className="text-fg-muted text-sm">Número atual: nº {currentNumber}.</p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-fg-muted text-xs">Número correto</span>
              <input
                type="number"
                name="number"
                min={1}
                step={1}
                required
                defaultValue={currentNumber}
                className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-fg-muted text-xs">Motivo</span>
              <textarea
                name="reason"
                rows={2}
                required
                minLength={3}
                placeholder="Por que este número está errado."
                className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
              />
            </label>

            {state.error ? (
              <p
                role="alert"
                className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
              >
                {state.error}
              </p>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="text-fg-muted hover:text-fg rounded-control px-4 py-2 text-sm transition-colors"
              >
                Cancelar
              </button>
              <Submit />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
    >
      {pending ? "Aguarde…" : "Corrigir"}
    </button>
  );
}
