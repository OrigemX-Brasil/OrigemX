"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import type { PublishState } from "@/modules/media/publish";

import { setDogPublishedByAdmin, setKennelPublishedByAdmin } from "../actions";

/**
 * Publicar ou tirar do ar, pelo painel administrativo.
 *
 * Mesmo `<dialog>` nativo e mesmo par `useActionState`/`useFormStatus` de
 * `HideEntityDialog`. A diferença que importa é o MOTIVO SER OBRIGATÓRIO:
 * ocultar tem um motivo padrão razoável a inventar (`resolveHideReason`),
 * publicar em nome de outra pessoa não tem — é uma decisão sobre o que fica
 * visível no perfil público de alguém, e o porquê precisa ter autor.
 *
 * PUBLICAR NÃO É O MESMO QUE REATIVAR, e as duas ações convivem na mesma tela
 * de propósito: `hidden_at` é decisão de MODERAÇÃO (o admin tirou do ar), e
 * `published_at` é estado EDITORIAL (o registro está pronto para o público).
 * Um canil reativado mas em rascunho continua invisível, e é isso que os dois
 * controles separados comunicam.
 */
export function PublishEntityDialog({
  entityType,
  entityId,
  name,
  isPublished,
  ownerName,
}: {
  entityType: "kennel" | "dog";
  entityId: string;
  name: string;
  isPublished: boolean;
  ownerName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [state, formAction] = useActionState<PublishState, FormData>(
    async (_prev, formData) =>
      entityType === "dog"
        ? setDogPublishedByAdmin(formData)
        : setKennelPublishedByAdmin(formData),
    {},
  );

  // Fecha só no sucesso LIMPO. Com `warning` o diálogo continua aberto: a
  // entidade saiu do ar, mas um arquivo ficou acessível no endereço público —
  // fechar esconderia justamente o aviso que exige ação.
  useEffect(() => {
    if (state.ok && !state.warning) dialogRef.current?.close();
  }, [state.ok, state.warning]);

  const publicar = !isPublished;
  const label = entityType === "dog" ? "cão" : "canil";

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={
          publicar
            ? "bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors"
            : "border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm font-medium transition-colors"
        }
      >
        {publicar ? "Publicar" : "Tirar do ar"}
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
            <input type="hidden" name="id" value={entityId} />
            <input type="hidden" name="published" value={publicar ? "true" : "false"} />

            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {publicar ? "Publicar" : "Tirar do ar"} {name}?
              </h2>
              <p className="text-fg-muted text-sm">
                {publicar
                  ? `Este ${label} passa a aparecer no perfil público de ${ownerName}, e as imagens vão para o endereço público antes de a página ir ao ar.`
                  : `Este ${label} sai do ar e as imagens voltam para o armazenamento privado. Quem já tiver o link direto de uma imagem ainda pode abri-la até o cache do CDN vencer.`}
              </p>
              <p className="text-fg-muted text-sm">
                A decisão fica registrada como sua no Histórico, com o motivo abaixo.
              </p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-fg-muted text-xs">Motivo (obrigatório)</span>
              <textarea
                name="reason"
                rows={2}
                placeholder={
                  publicar
                    ? "Por que você está colocando isto no ar pelo dono."
                    : "Por que isto está saindo do ar."
                }
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

            {state.warning ? (
              <p
                role="alert"
                className="border-warning-subtle bg-warning-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
              >
                {state.warning}
              </p>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="text-fg-muted hover:text-fg rounded-control px-4 py-2 text-sm transition-colors"
              >
                {state.warning ? "Fechar" : "Cancelar"}
              </button>
              <Submit publicar={publicar} />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

function Submit({ publicar }: { publicar: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        publicar
          ? "bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          : "border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
      }
    >
      {pending ? "Aguarde…" : publicar ? "Publicar" : "Tirar do ar"}
    </button>
  );
}
