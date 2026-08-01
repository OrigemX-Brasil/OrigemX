"use client";

import { useFormStatus } from "react-dom";

/**
 * Primitivas de formulário da autenticação.
 *
 * Sem biblioteca de UI, conforme o CLAUDE.md. Nenhuma cor literal — só tokens.
 * Toda mensagem de erro é associada ao campo por `aria-describedby`, senão
 * leitor de tela anuncia o campo sem dizer o que está errado nele.
 */

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required,
  defaultValue,
  hint,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
  minLength?: number;
}) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-fg text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        minLength={minLength}
        aria-describedby={hintId}
        /* border-strong, não border: a borda do campo é o que identifica o
           controle, e a WCAG 1.4.11 exige 3:1 para isso. O separador
           decorativo (--color-border) tem 1.36:1 e serviria mal aqui.
           O anel de foco vem do :focus-visible global, em ciano. */
        className="border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2.5 text-base outline-none transition-colors"
      />
      {hint ? (
        <p id={hintId} className="text-fg-faint text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `useFormStatus` precisa estar num componente filho do <form> — se ler no
 * mesmo componente que renderiza o form, `pending` nunca muda.
 */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Aguarde…" : children}
    </button>
  );
}

/**
 * `role="alert"` no erro para o leitor de tela anunciar sem o usuário precisar
 * navegar até lá. `role="status"` no sucesso, que é menos urgente.
 */
export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;

  if (error) {
    return (
      <p
        role="alert"
        className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
      >
        {error}
      </p>
    );
  }

  return (
    <p
      role="status"
      className="border-success-subtle bg-success-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
    >
      {message}
    </p>
  );
}
