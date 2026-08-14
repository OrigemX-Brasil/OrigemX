"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { signIn, type ActionState } from "@/modules/auth/actions";

import { Field, PasswordField, SubmitButton } from "./form";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(signIn, {
    error: initialError,
  });

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <FormMessage error={state.error} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      <PasswordField label="Senha" name="password" autoComplete="current-password" required />
      <div className="flex flex-col gap-3">
        <SubmitButton>Entrar</SubmitButton>
        <Link
          href="/esqueci-senha"
          className="text-fg-muted hover:text-fg self-start text-sm underline underline-offset-4 transition-colors"
        >
          Esqueci minha senha
        </Link>
      </div>
    </form>
  );
}
