"use client";

import { useActionState } from "react";

import { updatePassword, type ActionState } from "@/modules/auth/actions";

import { Field, FormMessage, SubmitButton } from "./form";

export function NewPasswordForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(updatePassword, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage error={state.error} />
      <Field
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Ao menos 8 caracteres."
      />
      <Field
        label="Repita a nova senha"
        name="password_confirm"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <SubmitButton>Salvar senha</SubmitButton>
    </form>
  );
}
