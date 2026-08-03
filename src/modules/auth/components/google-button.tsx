"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signInWithGoogle, type ActionState } from "@/modules/auth/actions";

import { FormMessage } from "./form";

/**
 * Marca do Google estilizada, desenhada com traços — não é o logo oficial.
 * Reproduzir a arte de terceiro pixel a pixel exige licença que não temos.
 */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 8h6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 8v6" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

function Button() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="border-border bg-surface text-fg hover:bg-surface-hover rounded-control flex w-full items-center justify-center gap-2.5 border px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleGlyph />
      {pending ? "Redirecionando…" : "Continuar com Google"}
    </button>
  );
}

export function GoogleButton({ next, source }: { next: string; source?: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(signInWithGoogle, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      {/* Só na tela de cadastro. No login fica vazio: entrar não é converter. */}
      <input type="hidden" name="de" value={source ?? ""} />
      <Button />
      <FormMessage error={state.error} />
    </form>
  );
}
