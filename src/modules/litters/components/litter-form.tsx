"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { ConfirmSubmitDialog, type SubmitConfirm } from "@/components/confirm-submit-dialog";
import { FormMessage } from "@/components/form-message";
import type { AncestorCandidate } from "@/modules/dogs/ancestors";
import { isoToBr } from "@/modules/dogs/br-date";
import { DateField } from "@/modules/dogs/components/date-field";
import { ParentPicker } from "@/modules/dogs/components/parent-picker";

import {
  createLitter,
  updateLitter,
  type LitterFormAction,
  type LitterFormState,
} from "../actions";
import { expectedWhelpingDate } from "../gestation";
import { LITTER_FIELDS, type LitterField } from "../fields";
import { validateLitter, type FieldErrors, type LitterInput } from "../validation";

/**
 * Ninhada — create e edit no mesmo componente (`isEdit = Boolean(litter?.id)`,
 * mesmo molde de `KennelForm`/`DogForm`).
 *
 * Passou a usar a máquina declarativa de `fields.ts` e a reusar `DateField` e
 * `ParentPicker` do módulo de cães. `ParentPicker` cabe aqui sem nenhum
 * adaptador porque `LitterParent` tem a forma de `AncestorCandidate` — e cabe
 * COM SENTIDO, não só por conveniência: escolher o pai da ninhada é
 * exatamente o mesmo problema de escolher o pai de um cão, incluindo poder
 * cadastrar um fantasma na hora quando o reprodutor não está na base.
 */

function Control({
  field,
  defaultValue,
  error,
  onFormatError,
  onValueChange,
  onChange,
}: {
  field: LitterField;
  defaultValue?: string;
  error?: string;
  onFormatError?: (message: string | null) => void;
  onValueChange?: (iso: string) => void;
  onChange?: (value: string) => void;
}) {
  const errorId = error ? `${field.name}-error` : undefined;
  const helpId = field.help ? `${field.name}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  const cls =
    "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2.5 text-base outline-none transition-colors";

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={field.name} className="text-fg text-sm font-medium">
        {field.label}
      </label>

      {field.input === "date" ? (
        <DateField
          id={field.name}
          name={field.name}
          defaultValue={defaultValue}
          ariaDescribedBy={describedBy}
          onFormatError={onFormatError}
          onValueChange={onValueChange}
        />
      ) : (
        <textarea
          id={field.name}
          name={field.name}
          rows={5}
          defaultValue={defaultValue}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={cls}
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

export function LitterForm({
  kennelId,
  ownerId,
  litter,
  action,
  header,
  confirm,
}: {
  kennelId: string;
  /** Sessão atual — o `ParentPicker` precisa para o upload de foto de fantasma. */
  ownerId: string;
  litter?: {
    id: string;
    description: string | null;
    mated_on: string | null;
    born_on: string | null;
    sire: AncestorCandidate | null;
    dam: AncestorCandidate | null;
  };
  /** Ação alternativa, injetada por quem chama — ver `DogFormAction`. */
  action?: LitterFormAction;
  /** Bloco livre no topo, DENTRO do `<form>`. */
  header?: ReactNode;
  /** Confirmação antes de gravar. Ausente = grava no primeiro clique. */
  confirm?: SubmitConfirm;
}) {
  const isEdit = Boolean(litter?.id);
  const resolvedAction = action ?? (isEdit ? updateLitter : createLitter);

  const [state, formAction] = useActionState<LitterFormState, FormData>(resolvedAction, {});
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [dateFormatErrors, setDateFormatErrors] = useState<FieldErrors>({});

  const [descricao, setDescricao] = useState(litter?.description ?? "");
  const [matedOn, setMatedOn] = useState(litter?.mated_on ?? "");
  const [sire, setSire] = useState<AncestorCandidate | null>(litter?.sire ?? null);
  const [dam, setDam] = useState<AncestorCandidate | null>(litter?.dam ?? null);

  // Mesma mecânica de `DogForm` — o comentário longo está lá.
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmedRef = useRef(false);
  const [confirmData, setConfirmData] = useState<FormData | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (state.formError || state.errors) dialogRef.current?.close();
  }, [state.formError, state.errors]);

  const errors: FieldErrors = { ...clientErrors, ...state.errors, ...dateFormatErrors };

  // A previsão é DERIVADA e aparece enquanto a pessoa digita — sem ida ao
  // servidor e sem coluna no banco. `mated_on` continua sendo o único fato.
  const previsao = expectedWhelpingDate(matedOn);

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        const input: LitterInput = {};
        for (const f of LITTER_FIELDS) {
          const v = data.get(f.name);
          if (typeof v === "string") input[f.name] = v;
        }
        const found = validateLitter(input);
        setClientErrors(found);

        const extra = confirm?.validate?.(data) ?? null;
        setConfirmError(extra);

        if (Object.keys(found).length > 0 || extra) {
          e.preventDefault();
          confirmedRef.current = false;
          dialogRef.current?.close();
          return;
        }

        if (confirm && !confirmedRef.current) {
          e.preventDefault();
          setConfirmData(data);
          dialogRef.current?.showModal();
          return;
        }

        confirmedRef.current = false;
      }}
      className="flex flex-col gap-8"
    >
      <input type="hidden" name="kennel_id" value={kennelId} />
      {litter?.id ? <input type="hidden" name="id" value={litter.id} /> : null}

      {header}

      {confirmError ? (
        <p
          role="alert"
          className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {confirmError}
        </p>
      ) : null}

      {state.formError ? (
        <p
          role="alert"
          className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {state.formError}
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        {LITTER_FIELDS.filter((f) => f.input === "date").map((field) => (
          <Control
            key={field.name}
            field={field}
            defaultValue={state.values?.[field.name] ?? litter?.[field.name] ?? ""}
            error={errors[field.name]}
            onFormatError={(message) =>
              setDateFormatErrors((prev) => ({ ...prev, [field.name]: message ?? undefined }))
            }
            onValueChange={field.name === "mated_on" ? setMatedOn : undefined}
          />
        ))}
      </div>

      {previsao ? (
        <p className="border-border bg-surface rounded-card text-fg-muted border px-4 py-3 text-sm">
          Previsão de parto:{" "}
          <span className="text-fg font-mono font-medium tabular-nums">{isoToBr(previsao)}</span>{" "}
          <span className="text-fg-faint">— 63 dias após a cobrição, média da espécie.</span>
        </p>
      ) : null}

      {LITTER_FIELDS.filter((f) => f.input === "textarea").map((field) => (
        <div key={field.name} className="flex flex-col gap-2">
          <Control
            field={field}
            defaultValue={state.values?.[field.name] ?? litter?.[field.name] ?? ""}
            error={errors[field.name]}
            onChange={setDescricao}
          />
          <span
            aria-hidden="true"
            className="text-fg-faint shrink-0 self-end font-mono text-xs tabular-nums"
          >
            {[...descricao].length}/{field.maxLength}
          </span>
        </div>
      ))}

      <section className="border-border flex flex-col gap-6 border-t pt-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold">Progenitores</h2>
          <p className="text-fg-muted text-sm">
            Escolha entre os cães já cadastrados. É o que faz cada filhote entrar no pedigree com a
            linhagem completa — e o que traz os exames genéticos dos pais para esta página, sem
            redigitar nada.
          </p>
        </div>

        <ParentPicker
          slot="sire"
          ownerId={ownerId}
          selected={sire}
          otherParentId={dam?.id}
          error={state.parentError?.sire_id}
          onChange={setSire}
        />

        <ParentPicker
          slot="dam"
          ownerId={ownerId}
          selected={dam}
          otherParentId={sire?.id}
          error={state.parentError?.dam_id}
          onChange={setDam}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Submit
          label={confirm ? confirm.openLabel : isEdit ? "Salvar alterações" : "Cadastrar ninhada"}
        />
        {state.ok ? <FormMessage message="Alterações salvas." /> : null}
      </div>

      {confirm ? (
        <ConfirmSubmitDialog
          dialogRef={dialogRef}
          title={confirm.title}
          confirmLabel={confirm.confirmLabel}
          onConfirm={() => {
            confirmedRef.current = true;
          }}
          onCancel={() => {
            confirmedRef.current = false;
          }}
        >
          {confirmData
            ? confirm.summary(confirmData, { sire: sire?.name ?? null, dam: dam?.name ?? null })
            : null}
        </ConfirmSubmitDialog>
      ) : null}
    </form>
  );
}
