"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { setMediaCaption, type CaptionState } from "../actions";
import { MAX_CAPTION_LENGTH } from "../constraints";

/**
 * Legenda da foto: botão DENTRO da imagem, texto num `<dialog>` nativo.
 *
 * Mesmo molde dos diálogos de `src/modules/admin/components/` (`<dialog>` do
 * navegador — foco preso, Escape, foco de volta ao gatilho, tudo de graça e
 * sem lib —, `useActionState` para o erro, `useFormStatus` num filho para o
 * pendente). Diferenças de propósito:
 *
 *   1. É a ÚNICA ilha de cliente da galeria. `media-gallery.tsx` continua
 *      componente de servidor: "Remover" e "Tornar capa" são `<form>` com
 *      Server Action direto, e não há por que virar tudo cliente por causa
 *      de um campo de texto.
 *   2. O rótulo do envio muda: "Adicionar" quando ainda não há legenda,
 *      "Salvar" quando há.
 *   3. Campo VAZIO é operação válida — é como se REMOVE a legenda. Por isso
 *      não é `required`, e o texto de ajuda diz isso em voz alta.
 *   4. O rótulo do campo usa `htmlFor` em vez de `<label>` envolvendo: com o
 *      envolvimento, o nome acessível do campo vira TODO o texto de dentro
 *      do label — incluindo ajuda e contador. Separado, o nome fica só
 *      "Legenda", que é também o que faz `getByRole("textbox", { name:
 *      "Legenda" })` funcionar no e2e.
 */
export function CaptionDialog({
  mediaId,
  caption,
  photoNumber,
}: {
  mediaId: string;
  caption: string | null;
  photoNumber: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(caption ?? "");

  const [state, formAction] = useActionState<CaptionState, FormData>(
    async (_prev, formData) => setMediaCaption(formData),
    {},
  );

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state.ok]);

  /**
   * Abrir SEMPRE parte do que está GRAVADO, nunca de um rascunho abandonado:
   * quem digitou, desistiu e cancelou não pode reencontrar aquele texto como
   * se tivesse sido salvo. `useState(caption)` sozinho não resolve — o valor
   * inicial só vale na montagem, e este componente não desmonta entre uma
   * abertura e outra.
   */
  function abrir() {
    setText(caption ?? "");
    dialogRef.current?.showModal();
    inputRef.current?.select();
  }

  const inputId = `legenda-${mediaId}`;
  const ajudaId = `legenda-ajuda-${mediaId}`;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        // Nome acessível diz DE QUAL foto é o botão: num mosaico de até 30
        // fotos, trinta botões chamados "Legenda" não se distinguem para
        // quem usa leitor de tela.
        aria-label={`Legenda da foto ${photoNumber}`}
        // DENTRO da foto, canto oposto ao selo "Capa" (`top-2 left-2`).
        // `bg-bg/70` sobre foto arbitrária é a mesma receita já usada nos
        // controles do lightbox público — contraste sem inventar linguagem
        // nova. Permanentemente visível, nunca revelado por hover: em toque
        // não existe hover.
        className="bg-bg/70 text-fg hover:bg-bg/90 focus-visible:outline-ring rounded-control absolute right-2 bottom-2 z-10 px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Legenda
      </button>

      {/*
        `hidden … open:flex` é obrigatório: um `flex` do Tailwind venceria o
        `display:none` nativo do dialog fechado. Mesmo combo dos diálogos
        admin.
      */}
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-0 hidden h-dvh w-dvw max-w-none items-center justify-center border-0 bg-transparent p-4 backdrop:bg-overlay open:flex"
      >
        <div className="border-border-glass bg-surface shadow-panel rounded-panel w-full max-w-sm border p-6">
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={mediaId} />

            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {caption ? "Editar legenda" : "Adicionar legenda"}
              </h2>
              <p className="text-fg-muted text-sm">
                Aparece junto da foto no perfil público — o que você quer contar sobre ela.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={inputId} className="text-fg-muted text-xs">
                Legenda
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                name="caption"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_CAPTION_LENGTH}
                autoComplete="off"
                aria-describedby={ajudaId}
                placeholder="Ex.: Campeão Brasileiro 2024"
                className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
              />
              <div className="flex items-baseline justify-between gap-2">
                <span id={ajudaId} className="text-fg-faint text-xs">
                  Até {MAX_CAPTION_LENGTH} caracteres. Apague tudo e salve para remover a legenda.
                </span>
                {/* Contador é apoio visual. Sem `aria-live`: anunciar a cada
                    tecla atrapalharia leitor de tela, e o limite já chega
                    pelo `aria-describedby` acima. */}
                <span
                  aria-hidden="true"
                  className="text-fg-faint shrink-0 font-mono text-xs tabular-nums"
                >
                  {[...text].length}/{MAX_CAPTION_LENGTH}
                </span>
              </div>
            </div>

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
              <Submit editando={Boolean(caption)} />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

/**
 * Componente à parte porque `useFormStatus` só enxerga o `<form>` ANCESTRAL.
 * Chamado dentro de `CaptionDialog` ele leria `pending` do nada.
 */
function Submit({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
    >
      {pending ? "Aguarde…" : editando ? "Salvar" : "Adicionar"}
    </button>
  );
}
