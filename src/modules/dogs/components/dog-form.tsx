"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { FormMessage } from "@/components/form-message";

import { createDog, updateDog, type DogFormState } from "../actions";
import type { AncestorCandidate } from "../ancestors";
import { DOG_FORM_FIELDS, type DogField } from "../fields";
import { slugifyDog, validateDog, type DogFieldErrors, type DogInput } from "../validation";

import { DateField } from "./date-field";
import { ParentPicker } from "./parent-picker";

/**
 * O canil do usuário, ou `null` se ele ainda não cadastrou nenhum. Não é lista:
 * um criador tem no máximo um (`kennels_owner_uk`).
 */
type KennelOption = { id: string; name: string };

function Control({
  field,
  defaultValue,
  error,
  slugValue,
  onSlugChange,
  onNameChange,
}: {
  field: DogField;
  defaultValue?: string;
  error?: string;
  slugValue?: string;
  onSlugChange?: (v: string) => void;
  onNameChange?: (v: string) => void;
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
      ) : field.input === "number" ? (
        <input
          id={field.name}
          name={field.name}
          type="number"
          step="0.1"
          inputMode="decimal"
          defaultValue={defaultValue}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          className={cls}
        />
      ) : field.input === "list" ? (
        <textarea
          id={field.name}
          name={field.name}
          rows={3}
          defaultValue={defaultValue}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          className={cls}
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
          // Não-controlado (o valor mora no DOM via `defaultValue`); o
          // `onChange` aqui é só um listener a mais, não torna o campo
          // controlado. É o que faz a URL acompanhar o Nome enquanto se
          // digita, em vez de esperar o campo perder o foco.
          onChange={onNameChange ? (e) => onNameChange(e.target.value) : undefined}
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
  kennel,
  sire,
  dam,
  ownerId,
}: {
  dog?: (Partial<Record<string, string | number | string[] | null>> & { id?: string }) | null;
  kennel: KennelOption | null;
  sire?: AncestorCandidate | null;
  dam?: AncestorCandidate | null;
  /** Sessão atual — repassado ao `ParentPicker` para o upload de foto de um
   *  ancestral fantasma recém-criado (prefixo do caminho no Storage). */
  ownerId: string;
}) {
  const isEdit = Boolean(dog?.id);
  const [state, formAction] = useActionState<DogFormState, FormData>(
    isEdit ? updateDog : createDog,
    {},
  );

  const [clientErrors, setClientErrors] = useState<DogFieldErrors>({});
  // Sem slug salvo, mas com nome já conhecido (edição de um cão cadastrado
  // antes de existir este campo, ou que nunca teve URL própria): nasce
  // derivado do nome, em vez de em branco — é o que o cliente pediu. Continua
  // "não tocado" (`slugTouched` abaixo), então digitar mais no Nome depois
  // ainda atualiza a URL sozinha.
  const [slug, setSlug] = useState(() => {
    const existente = String(dog?.slug ?? "");
    if (existente) return existente;
    const nome = String(dog?.name ?? "").trim();
    return nome ? slugifyDog(nome) : "";
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(dog?.slug));
  const [selectedSire, setSelectedSire] = useState<AncestorCandidate | null>(sire ?? null);
  const [selectedDam, setSelectedDam] = useState<AncestorCandidate | null>(dam ?? null);

  const errors: DogFieldErrors = { ...clientErrors, ...state.errors };

  // Sem canil não há endereço público: o CHECK `dogs_slug_requires_kennel`
  // recusa slug com `kennel_id` nulo. Antes o criador escolhia "Sem canil" de
  // propósito e sabia o que estava fazendo; agora o vínculo é implícito, então
  // quem não tem canil cairia no erro sem entender. Some o campo, e a
  // explicação fica abaixo.
  const camposVisiveis = kennel
    ? DOG_FORM_FIELDS
    : DOG_FORM_FIELDS.filter((f) => f.name !== "slug");

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
        {camposVisiveis.map((field) => (
          <Control
            key={field.name}
            field={field}
            defaultValue={
              state.values?.[field.name] ??
              (Array.isArray(dog?.[field.name])
                ? (dog[field.name] as string[]).join("\n")
                : String(dog?.[field.name] ?? ""))
            }
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
            onNameChange={
              field.name === "name"
                ? (v) => {
                    if (slugTouched) return;
                    // O automático segue o Nome nos dois sentidos enquanto
                    // não for editado à mão: apagar o Nome esvazia a URL
                    // também, em vez de deixar um valor obsoleto para trás.
                    setSlug(v.trim() ? slugifyDog(v) : "");
                  }
                : undefined
            }
          />
        ))}

        {/*
          O canil deixou de ser escolha. Não há mais um `<select>` com ids de
          canil: o cliente nunca nomeia um id, e o servidor resolve o único
          canil do usuário. Sobra a decisão que ainda é dele — exibir ou não
          este cão no perfil público do canil.

          O campo oculto marca que o CONTROLE FOI RENDERIZADO. Sem ele,
          `updateDog` não teria como distinguir "desmarcado" de "nem apareceu na
          tela", e sobrescreveria `kennel_id` em cão que não deveria tocar.
        */}
        {kennel ? (
          <div className="flex flex-col gap-2">
            <input type="hidden" name="vinculo_canil_presente" value="1" />
            <label htmlFor="vincular_canil" className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                id="vincular_canil"
                name="vincular_canil"
                defaultChecked={isEdit ? Boolean(dog?.kennel_id) : true}
                className="accent-accent mt-0.5 size-4"
              />
              <span className="flex flex-col gap-1">
                <span className="text-fg font-medium">Exibir no {kennel.name}</span>
                <span className="text-fg-muted">
                  Cão vinculado aparece no perfil público do canil e pode ter endereço próprio.
                </span>
              </span>
            </label>
          </div>
        ) : (
          <p className="border-border bg-surface rounded-card text-fg-muted border p-4 text-sm">
            Você ainda não cadastrou um canil, então este cão fica sem endereço público. Ele
            continua valendo como registro e como nó de pedigree.
          </p>
        )}
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
          ownerId={ownerId}
          selected={selectedSire}
          otherParentId={selectedDam?.id}
          error={state.parentError?.sire_id}
          onChange={setSelectedSire}
        />

        <ParentPicker
          slot="dam"
          dogId={dog?.id}
          ownerId={ownerId}
          selected={selectedDam}
          otherParentId={selectedSire?.id}
          error={state.parentError?.dam_id}
          onChange={setSelectedDam}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Submit label={isEdit ? "Salvar alterações" : "Cadastrar cão"} />
        {state.ok ? <FormMessage message="Alterações salvas." /> : null}
      </div>
    </form>
  );
}
