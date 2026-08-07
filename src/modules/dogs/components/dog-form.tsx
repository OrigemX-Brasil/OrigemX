"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { createDog, updateDog, type DogFormState } from "../actions";
import type { AncestorCandidate } from "../ancestors";
import { DOG_FORM_FIELDS, type DogField } from "../fields";
import { slugifyDog, validateDog, type DogFieldErrors, type DogInput } from "../validation";

import { DateField } from "./date-field";
import { ParentPicker } from "./parent-picker";

type KennelOption = { id: string; name: string };

function Control({
  field,
  defaultValue,
  error,
  slugValue,
  onSlugChange,
  onNameBlur,
}: {
  field: DogField;
  defaultValue?: string;
  error?: string;
  slugValue?: string;
  onSlugChange?: (v: string) => void;
  onNameBlur?: (v: string) => void;
}) {
  // O erro de FORMATO da data ("não existe 31/02") divide o mesmo slot visual
  // que o erro de NEGÓCIO ("data no futuro", vindo de validateBirthDate) —
  // são a mesma pergunta para quem preenche o formulário, então não podem
  // aparecer em dois lugares diferentes na tela. `DateField` manda o dele
  // subir por callback; aqui os dois se combinam num só.
  const [dateFormatError, setDateFormatError] = useState<string | null>(null);
  const effectiveError = field.input === "date" ? (dateFormatError ?? error) : error;

  const errorId = effectiveError ? `${field.name}-error` : undefined;
  const helpId = field.help ? `${field.name}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  const cls =
    "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2.5 text-base outline-none transition-colors";

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={field.name} className="text-fg text-sm font-medium">
        {field.label}
        {field.weight === "required" ? (
          <span className="text-fg-faint font-normal"> (obrigatório)</span>
        ) : null}
      </label>

      {field.options ? (
        <select
          id={field.name}
          name={field.name}
          defaultValue={defaultValue ?? ""}
          aria-describedby={describedBy}
          className={cls}
        >
          <option value="">Selecione</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.input === "slug" ? (
        <input
          id={field.name}
          name={field.name}
          type="text"
          value={slugValue ?? ""}
          onChange={(e) => onSlugChange?.(e.target.value)}
          maxLength={field.maxLength}
          aria-describedby={describedBy}
          className={cls}
        />
      ) : field.input === "date" ? (
        <DateField
          id={field.name}
          name={field.name}
          defaultValue={defaultValue}
          ariaDescribedBy={describedBy}
          onFormatError={setDateFormatError}
        />
      ) : (
        <input
          id={field.name}
          name={field.name}
          type="text"
          defaultValue={defaultValue}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          onBlur={onNameBlur ? (e) => onNameBlur(e.target.value) : undefined}
          className={cls}
        />
      )}

      {field.help ? (
        <p id={helpId} className="text-fg-faint text-xs">
          {field.help}
        </p>
      ) : null}
      {effectiveError ? (
        <p id={errorId} role="alert" className="text-danger text-xs">
          {effectiveError}
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

export function DogForm({
  dog,
  kennels,
  sire,
  dam,
}: {
  dog?: (Partial<Record<string, string | null>> & { id?: string }) | null;
  kennels: KennelOption[];
  sire?: AncestorCandidate | null;
  dam?: AncestorCandidate | null;
}) {
  const isEdit = Boolean(dog?.id);
  const [state, formAction] = useActionState<DogFormState, FormData>(
    isEdit ? updateDog : createDog,
    {},
  );

  const [clientErrors, setClientErrors] = useState<DogFieldErrors>({});
  const [slug, setSlug] = useState(String(dog?.slug ?? ""));
  const [slugTouched, setSlugTouched] = useState(Boolean(dog?.slug));
  const [selectedSire, setSelectedSire] = useState<AncestorCandidate | null>(sire ?? null);
  const [selectedDam, setSelectedDam] = useState<AncestorCandidate | null>(dam ?? null);

  const errors: DogFieldErrors = { ...clientErrors, ...state.errors };

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        const input: DogInput = {};
        for (const f of DOG_FORM_FIELDS) {
          const v = data.get(f.name);
          if (typeof v === "string") input[f.name] = v;
        }
        const found = validateDog(input);
        setClientErrors(found);
        if (Object.keys(found).length > 0) e.preventDefault();
      }}
      className="flex flex-col gap-8"
    >
      {dog?.id ? <input type="hidden" name="id" value={dog.id} /> : null}

      {state.formError ? (
        <p
          role="alert"
          className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {state.formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        {DOG_FORM_FIELDS.map((field) => (
          <Control
            key={field.name}
            field={field}
            defaultValue={state.values?.[field.name] ?? String(dog?.[field.name] ?? "")}
            error={errors[field.name]}
            slugValue={field.input === "slug" ? slug : undefined}
            onSlugChange={
              field.input === "slug"
                ? (v) => {
                    setSlugTouched(true);
                    setSlug(v);
                  }
                : undefined
            }
            onNameBlur={
              field.name === "name"
                ? (v) => {
                    if (!slugTouched && v.trim()) setSlug(slugifyDog(v));
                  }
                : undefined
            }
          />
        ))}

        <div className="flex flex-col gap-2">
          <label htmlFor="kennel_id" className="text-fg text-sm font-medium">
            Canil
          </label>
          <select
            id="kennel_id"
            name="kennel_id"
            defaultValue={String(dog?.kennel_id ?? "")}
            className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2.5 text-base outline-none"
          >
            {/* Só os canis do próprio usuário: a RLS recusaria o cão num canil
                alheio, e oferecer a opção seria prometer o que não se cumpre. */}
            <option value="">Sem canil</option>
            {kennels.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="border-border flex flex-col gap-6 border-t pt-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold">Pai e mãe</h2>
          <p className="text-fg-muted text-sm">
            Escolha entre os cães já cadastrados. Reaproveitar o mesmo ancestral é o que faz o
            pedigree fechar — e é o que permite ver linhagens repetidas.
          </p>
        </div>

        <ParentPicker
          slot="sire"
          dogId={dog?.id}
          selected={selectedSire}
          otherParentId={selectedDam?.id}
          error={state.parentError?.sire_id}
          onChange={setSelectedSire}
        />

        <ParentPicker
          slot="dam"
          dogId={dog?.id}
          selected={selectedDam}
          otherParentId={selectedSire?.id}
          error={state.parentError?.dam_id}
          onChange={setSelectedDam}
        />
      </section>

      <Submit label={isEdit ? "Salvar alterações" : "Cadastrar cão"} />
    </form>
  );
}
