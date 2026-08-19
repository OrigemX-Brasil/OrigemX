"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { FormMessage } from "@/components/form-message";

import { createKennel, updateKennel, type KennelFormState } from "../actions";
import { KENNEL_FORM_FIELDS, type KennelField, type KennelFieldName } from "../fields";
import { slugify, validateKennel, type FieldErrors, type KennelInput } from "../validation";

/**
 * Formulário de canil, gerado a partir de `fields.ts`.
 *
 * Não há JSX por campo: quando os campos definitivos do cliente chegarem, muda
 * a configuração e esta tela acompanha sozinha. Era essa a exigência.
 */

function Control({
  field,
  defaultValue,
  error,
  onNameBlur,
  slugValue,
  onSlugChange,
}: {
  field: KennelField;
  defaultValue?: string;
  error?: string;
  onNameBlur?: (value: string) => void;
  slugValue?: string;
  onSlugChange?: (value: string) => void;
}) {
  const errorId = error ? `${field.name}-error` : undefined;
  const helpId = field.help ? `${field.name}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  const shared = {
    id: field.name,
    name: field.name,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    maxLength: field.maxLength,
    placeholder: field.placeholder,
    className:
      "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2.5 text-base outline-none transition-colors",
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={field.name} className="text-fg text-sm font-medium">
        {field.label}
        {field.weight === "required" ? (
          <span className="text-fg-faint font-normal"> (obrigatório)</span>
        ) : null}
      </label>

      {field.input === "textarea" ? (
        <textarea {...shared} rows={5} defaultValue={defaultValue} />
      ) : field.input === "slug" ? (
        <input
          {...shared}
          type="text"
          value={slugValue ?? ""}
          onChange={(e) => onSlugChange?.(e.target.value)}
        />
      ) : (
        <input
          {...shared}
          type={field.input === "url" ? "url" : field.input === "phone" ? "tel" : "text"}
          // `inputMode="tel"` abre o teclado numérico no celular, que é onde o
          // criador preenche isto. `type="tel"` sozinho não garante — no
          // Android o teclado vem do inputMode.
          inputMode={field.input === "phone" ? "tel" : undefined}
          autoComplete={field.input === "phone" ? "tel" : undefined}
          defaultValue={defaultValue}
          onBlur={onNameBlur ? (e) => onNameBlur(e.target.value) : undefined}
        />
      )}

      {field.help ? (
        <p id={helpId} className="text-fg-faint text-xs">
          {field.help}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
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

export function KennelForm({
  kennel,
}: {
  /**
   * Chaves do formulário, não `Record<string, …>`: com index signature aberta,
   * qualquer coluna nova de outro tipo (como `founder_number`, que é number)
   * quebraria a chamada. Assim o componente aceita a linha inteira e ignora o
   * que não é campo dele.
   */
  kennel?: Partial<Record<KennelFieldName, string | null>> & { id?: string };
}) {
  const isEdit = Boolean(kennel?.id);
  const action = isEdit ? updateKennel : createKennel;

  const [state, formAction] = useActionState<KennelFormState, FormData>(action, {});
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [slug, setSlug] = useState<string>(String(kennel?.slug ?? ""));
  const [slugTouched, setSlugTouched] = useState(Boolean(kennel?.slug));

  const errors: FieldErrors = { ...clientErrors, ...state.errors };

  /**
   * Sugere o slug a partir do nome — mas só enquanto o dono não mexeu nele.
   * Depois de publicado, o endereço é o link que ele divulgou; sobrescrever
   * porque o nome mudou quebraria material já impresso.
   */
  const suggestSlug = (name: string) => {
    if (slugTouched || !name.trim()) return;
    setSlug(slugify(name));
  };

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        const input: KennelInput = {};
        for (const f of KENNEL_FORM_FIELDS) {
          const v = data.get(f.name);
          if (typeof v === "string") input[f.name] = v;
        }
        const found = validateKennel(input);
        setClientErrors(found);
        // Validação de client é conveniência. A Server Action revalida tudo —
        // um POST direto pula esta tela inteira.
        if (Object.keys(found).length > 0) e.preventDefault();
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      {kennel?.id ? <input type="hidden" name="id" value={kennel.id} /> : null}

      {state.formError ? (
        <p
          role="alert"
          className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {state.formError}
        </p>
      ) : null}

      {KENNEL_FORM_FIELDS.map((field) => (
        <Control
          key={field.name}
          field={field}
          defaultValue={state.values?.[field.name] ?? String(kennel?.[field.name] ?? "")}
          error={errors[field.name]}
          onNameBlur={field.name === "name" ? suggestSlug : undefined}
          slugValue={field.input === "slug" ? slug : undefined}
          onSlugChange={
            field.input === "slug"
              ? (v) => {
                  setSlugTouched(true);
                  setSlug(v);
                }
              : undefined
          }
        />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Submit label={isEdit ? "Salvar alterações" : "Criar canil"} />
        {state.ok ? <FormMessage message="Alterações salvas." /> : null}
      </div>
    </form>
  );
}
