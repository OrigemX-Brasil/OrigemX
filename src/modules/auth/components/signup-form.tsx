"use client";

import { useActionState } from "react";

import { signUp, type ActionState } from "@/modules/auth/actions";

import { Field, FormMessage, SubmitButton } from "./form";

export function SignupForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(signUp, {});

  // Confirmação de e-mail está ligada, então o cadastro NÃO entra direto.
  // Depois do sucesso o formulário some: deixá-lo na tela convidaria a pessoa a
  // cadastrar de novo em vez de ir procurar o e-mail.
  if (state.message) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Confirme seu e-mail</h1>
        <FormMessage message={state.message} />
        <p className="text-fg-muted text-sm">
          Não chegou? Verifique a caixa de spam. O link vale por uma hora.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage error={state.error} />
      <Field
        label="Nome"
        name="full_name"
        autoComplete="name"
        hint="Como você aparece no perfil."
      />
      <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Ao menos 8 caracteres."
      />
      <SubmitButton>Criar conta</SubmitButton>
    </form>
  );
}
