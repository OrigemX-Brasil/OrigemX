"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { signUp, type ActionState } from "@/modules/auth/actions";

import { Field, PasswordField, SubmitButton } from "./form";

/**
 * `source` é a origem da campanha, resolvida no servidor pela página. Vai como
 * campo escondido só para sobreviver ao POST — não identifica ninguém, é o
 * mesmo rótulo curto que já foi contado no acesso.
 */
export function SignupForm({ source }: { source?: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(signUp, {});

  // Confere ANTES de ir ao servidor — é o que "antes de enviar" pede. `signUp`
  // não ganha um campo novo: `password_confirm` nunca sai daqui, é checagem
  // de tela, não de negócio.
  const [confirmError, setConfirmError] = useState<string | null>(null);

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
    <form
      action={formAction}
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        const password = String(data.get("password") ?? "");
        const confirm = String(data.get("password_confirm") ?? "");

        if (password !== confirm) {
          setConfirmError("As senhas não coincidem.");
          e.preventDefault();
          return;
        }
        setConfirmError(null);
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="de" value={source ?? ""} />
      <FormMessage error={confirmError ?? state.error} />
      <Field
        label="Nome"
        name="full_name"
        autoComplete="name"
        hint="Como você aparece no perfil."
      />
      <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      <PasswordField
        label="Senha"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Ao menos 8 caracteres."
      />
      <PasswordField
        label="Confirmar senha"
        name="password_confirm"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <SubmitButton>Criar conta</SubmitButton>
    </form>
  );
}
