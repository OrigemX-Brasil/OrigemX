"use client";

import { useActionState, useState } from "react";

import { updatePassword, type ActionState } from "@/modules/auth/actions";

import { FormMessage, PasswordField, SubmitButton } from "./form";

export function NewPasswordForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(updatePassword, {});

  // `updatePassword` já recusa no servidor quando os dois campos divergem —
  // esta checagem é só para avisar ANTES do round-trip, sem duplicar a regra:
  // o servidor continua sendo quem decide de verdade.
  const [confirmError, setConfirmError] = useState<string | null>(null);

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
      <FormMessage error={confirmError ?? state.error} />
      <PasswordField
        label="Nova senha"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Ao menos 8 caracteres."
      />
      <PasswordField
        label="Repita a nova senha"
        name="password_confirm"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <SubmitButton>Salvar senha</SubmitButton>
    </form>
  );
}
