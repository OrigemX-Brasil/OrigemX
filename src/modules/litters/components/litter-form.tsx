"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { FormMessage } from "@/components/form-message";

import { createLitter, updateLitter, type LitterFormState } from "../actions";
import { MAX_LITTER_DESCRIPTION_LENGTH } from "../constraints";

/**
 * Descrição da ninhada — create e edit no mesmo componente
 * (`isEdit = Boolean(litter?.id)`, mesmo molde de `KennelForm`/`DogForm`).
 *
 * SEM a máquina declarativa de `fields.ts`: é um campo só, um array de
 * configuração ali seria abstração que este formulário não precisa. O
 * `maxLength` do textarea já impede digitar além do limite — não há
 * validação de client separada para reimplementar o que o próprio campo
 * garante; quem revalida de verdade é a Server Action.
 */
export function LitterForm({
  kennelId,
  litter,
}: {
  kennelId: string;
  litter?: { id: string; description: string | null };
}) {
  const isEdit = Boolean(litter?.id);
  const action = isEdit ? updateLitter : createLitter;

  const [state, formAction] = useActionState<LitterFormState, FormData>(action, {});
  const [text, setText] = useState(state.values?.description ?? litter?.description ?? "");

  const error = state.errors?.description;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="kennel_id" value={kennelId} />
      {litter?.id ? <input type="hidden" name="id" value={litter.id} /> : null}

      {state.formError ? (
        <p
          role="alert"
          className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {state.formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="description" className="text-fg text-sm font-medium">
          Descrição
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_LITTER_DESCRIPTION_LENGTH}
          aria-describedby={error ? "description-error" : undefined}
          aria-invalid={error ? true : undefined}
          placeholder="Quantos filhotes, cor, o que torna esta ninhada especial…"
          className="border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2.5 text-base outline-none transition-colors"
        />
        <div className="flex items-baseline justify-between gap-2">
          {error ? (
            <p id="description-error" role="alert" className="text-danger text-xs">
              {error}
            </p>
          ) : (
            <span />
          )}
          <span
            aria-hidden="true"
            className="text-fg-faint shrink-0 font-mono text-xs tabular-nums"
          >
            {[...text].length}/{MAX_LITTER_DESCRIPTION_LENGTH}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit label={isEdit ? "Salvar alterações" : "Cadastrar ninhada"} />
        {state.ok ? <FormMessage message="Alterações salvas." /> : null}
      </div>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Salvando…" : label}
    </button>
  );
}
