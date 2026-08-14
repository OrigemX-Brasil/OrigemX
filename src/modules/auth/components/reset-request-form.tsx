"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { requestPasswordReset, type ActionState } from "@/modules/auth/actions";

import { Field, SubmitButton } from "./form";

export function ResetRequestForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(requestPasswordReset, {});

  // A resposta é a mesma exista ou não a conta, então o formulário sai de cena
  // depois do envio: mantê-lo convidaria a tentar outro e-mail para comparar as
  // respostas, que é justamente o que a mensagem neutra impede.
  if (state.message) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Verifique seu e-mail</h1>
        <FormMessage message={state.message} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage error={state.error} />
      <Field
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        required
        hint="Enviaremos um link para você definir uma senha nova."
      />
      <SubmitButton>Enviar link</SubmitButton>
    </form>
  );
}
