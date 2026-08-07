"use client";

import { useState } from "react";
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

/** Traços simples, sem lib de ícones — o projeto não tem uma. */
function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.9 5.09A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.6 6.61A13.16 13.16 0 0 0 1 12s4 7 11 7a10.94 10.94 0 0 0 5.08-1.28" />
      <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

/**
 * Campo de senha com botão para alternar a visibilidade.
 *
 * O botão é `type="button"` — sem isso, ele herdaria o `type="submit"`
 * padrão e um clique nele submeteria o formulário em vez de só revelar o
 * texto. `aria-label` troca de acordo com o estado porque o ícone sozinho não
 * diz nada a quem usa leitor de tela; `aria-pressed` expõe o estado de
 * alternância como os padrões de ARIA para um toggle button pedem.
 */
export function PasswordField({
  label,
  name,
  autoComplete,
  required,
  minLength,
  hint,
}: {
  label: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-fg text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          aria-describedby={hintId}
          className="border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control w-full border px-3 py-2.5 pr-11 text-base outline-none transition-colors"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          className="text-fg-muted hover:text-fg focus-visible:text-accent absolute inset-y-0 right-0 flex items-center px-3 transition-colors outline-none"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
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
