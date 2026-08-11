"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { setEntityHidden, type HideState } from "../actions";

/**
 * Confirmar ocultar/reativar um canil ou cão — mesmo `<dialog>` nativo e
 * mesmo par `useActionState`/`useFormStatus` de `SuspendUserDialog`. Sem a
 * peça de confirmação extra: aquela existia só para suspender OUTRO ADMIN,
 * e não há conceito equivalente aqui.
 *
 * O campo de motivo é também o canal de "corrigir duplicidade" — não existe
 * ação separada para isso, é o mesmo ocultar com um motivo que explica.
 */
export function HideEntityDialog({
  entityType,
  entityId,
  name,
  isHidden,
}: {
  entityType: "kennel" | "dog";
  entityId: string;
  name: string;
  isHidden: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [state, formAction] = useActionState<HideState, FormData>(
    async (_prev, formData) => setEntityHidden(formData),
    {},
  );

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state.ok]);

  const hiding = !isHidden;
  const label = entityType === "dog" ? "cão" : "canil";

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={
          hiding
            ? "border-danger text-danger hover:bg-danger-subtle rounded-control border px-4 py-2 text-sm font-medium transition-colors"
            : "border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm font-medium transition-colors"
        }
      >
        {hiding ? "Ocultar" : "Reativar"}
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
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="entityId" value={entityId} />
            <input type="hidden" name="hide" value={hiding ? "true" : "false"} />

            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {hiding ? "Ocultar" : "Reativar"} {name}?
              </h2>
              <p className="text-fg-muted text-sm">
                {hiding
                  ? `Este ${label} some da busca pública e de qualquer pedigree de terceiros até ser reativado. O dono continua enxergando o registro.`
                  : `Este ${label} volta a aparecer normalmente para o público, se estiver publicado.`}
              </p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-fg-muted text-xs">Motivo (opcional)</span>
              <textarea
                name="reason"
                rows={2}
                placeholder="Deixe em branco para usar um motivo padrão, ou explique — ex.: 'Duplicata de <outro registro>'."
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
              <Submit hiding={hiding} />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

function Submit({ hiding }: { hiding: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        hiding
          ? "border-danger text-danger hover:bg-danger-subtle rounded-control border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          : "bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
      }
    >
      {pending ? "Aguarde…" : hiding ? "Ocultar" : "Reativar"}
    </button>
  );
}
