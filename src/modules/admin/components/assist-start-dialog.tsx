"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import { startAssistSession, type AssistState } from "../actions";

/**
 * Abre o cadastro assistido.
 *
 * Mesmo `<dialog>` nativo de `HideEntityDialog`/`PublishEntityDialog`. O motivo
 * é OBRIGATÓRIO e escrito UMA vez: daqui em diante toda escrita da sessão o
 * herda, gravada pelo trigger no banco. É o que torna "preencher vinte campos
 * guiando alguém" praticável sem perder a trilha — exigir um motivo por campo
 * salvo mataria justamente o caso de uso que o PO pediu.
 *
 * SEM `useEffect` para fechar no sucesso: a ação REDIRECIONA para o painel do
 * criador, então o diálogo morre junto com a página. Só o erro volta como
 * estado.
 */
export function AssistStartDialog({
  profileId,
  name,
  hasKennel,
}: {
  profileId: string;
  name: string;
  /** Sem canil, o admin cai na raiz do painel e o primeiro passo é criá-lo. */
  hasKennel: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [state, formAction] = useActionState<AssistState, FormData>(
    async (_prev, formData) => startAssistSession(formData),
    {},
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors"
      >
        Iniciar cadastro assistido
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-0 hidden h-dvh w-dvw max-w-none items-center justify-center border-0 bg-transparent p-4 backdrop:bg-overlay open:flex"
      >
        <div className="border-border-glass bg-surface shadow-panel rounded-panel w-full max-w-md border p-6">
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="target_profile_id" value={profileId} />

            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Cadastrar em nome de {name}?
              </h2>
              <p className="text-fg-muted text-sm">
                Você passa a editar os registros de {name} pelo painel dele — canil, cães,
                ninhadas, saúde, exames, fotos. Uma faixa fica visível o tempo todo, e cada
                alteração vai para o Histórico com o motivo abaixo.
              </p>
              <p className="text-fg-muted text-sm">
                Você continua identificado como você: nada aqui entra na conta dele.
              </p>
              {!hasKennel ? (
                <p className="text-fg-muted text-sm">
                  <span className="text-fg font-medium">Este usuário ainda não tem canil.</span> O
                  primeiro passo é cadastrá-lo — cão e ninhada precisam de um canil de destino.
                </p>
              ) : null}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-fg-muted text-xs">Motivo (obrigatório)</span>
              <textarea
                name="reason"
                rows={2}
                placeholder="Ex.: criador pediu ajuda por telefone para montar o cadastro."
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
      {pending ? "Abrindo…" : "Começar"}
    </button>
  );
}
