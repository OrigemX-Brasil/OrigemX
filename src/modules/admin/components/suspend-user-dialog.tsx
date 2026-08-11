"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { setProfileSuspended, type SuspendState } from "../actions";

/**
 * Confirmar suspender/reativar um usuário.
 *
 * `<dialog>` nativo, sem framer-motion e sem a máquina de duas fases que
 * `kennel-search-panel.tsx` precisou — aquela existia para ANIMAR A SAÍDA, e
 * este diálogo não anima: fecha instantâneo, então `dialogRef.current.close()`
 * direto já basta, e Escape fecha de graça pelo comportamento nativo do
 * elemento. Reaproveito só a LIÇÃO da busca, não o mecanismo: a classe carrega
 * `hidden … open:flex`, porque author-origin `display:flex` solto na
 * className vence o `display:none` que o navegador dá a um dialog fechado —
 * sem isso o painel ficaria visível sempre.
 *
 * `useActionState` + `useFormStatus`, o mesmo par que `publish-toggle.tsx` já
 * usa para "botão dispara Server Action, mostra erro num role=alert".
 */
export function SuspendUserDialog({
  profileId,
  name,
  isSuspended,
  targetIsAdmin,
}: {
  profileId: string;
  name: string;
  isSuspended: boolean;
  targetIsAdmin: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [ackAdmin, setAckAdmin] = useState(false);

  const [state, formAction] = useActionState<SuspendState, FormData>(
    async (_prev, formData) => setProfileSuspended(formData),
    {},
  );

  // Fecha sozinho quando a ação termina bem — recarregar a linha de status é
  // trabalho do `revalidatePath` dentro do Server Action, não daqui.
  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state.ok]);

  const suspending = !isSuspended;
  // A confirmação extra é só para SUSPENDER outro admin — reativar é sempre
  // um ato restaurador, não precisa do mesmo freio.
  const needsAck = targetIsAdmin && suspending;
  const confirmDisabled = needsAck && !ackAdmin;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={
          suspending
            ? "border-danger text-danger hover:bg-danger-subtle rounded-control border px-4 py-2 text-sm font-medium transition-colors"
            : "border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm font-medium transition-colors"
        }
      >
        {suspending ? "Suspender" : "Reativar"}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setAckAdmin(false)}
        onClick={(e) => {
          // Clique fora do painel (no ::backdrop) chega aqui como clique no
          // próprio <dialog>, nunca num filho — é o que distingue os dois.
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-0 hidden h-dvh w-dvw max-w-none items-center justify-center border-0 bg-transparent p-4 backdrop:bg-overlay open:flex"
      >
        <div className="border-border-glass bg-surface shadow-panel rounded-panel w-full max-w-sm border p-6">
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="profileId" value={profileId} />
            <input type="hidden" name="suspend" value={suspending ? "true" : "false"} />

            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {suspending ? "Suspender" : "Reativar"} {name}?
              </h2>
              <p className="text-fg-muted text-sm">
                {suspending
                  ? "A pessoa deixa de conseguir entrar ou gravar qualquer coisa até ser reativada."
                  : "A pessoa volta a conseguir entrar e agir normalmente."}
              </p>
            </div>

            {needsAck ? (
              <label className="border-danger-subtle bg-danger-subtle text-fg flex items-start gap-2 rounded-control border px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={ackAdmin}
                  onChange={(e) => setAckAdmin(e.target.checked)}
                  className="mt-0.5"
                />
                Entendo que {name} também é administrador — suspendê-lo remove o acesso dele ao
                painel.
              </label>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="text-fg-muted text-xs">Motivo (opcional)</span>
              <textarea
                name="reason"
                rows={2}
                placeholder="Deixe em branco para usar um motivo padrão."
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
              <Submit disabled={confirmDisabled} suspending={suspending} />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

function Submit({ disabled, suspending }: { disabled: boolean; suspending: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={
        suspending
          ? "border-danger text-danger hover:bg-danger-subtle rounded-control border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          : "bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
      }
    >
      {pending ? "Aguarde…" : suspending ? "Suspender" : "Reativar"}
    </button>
  );
}
