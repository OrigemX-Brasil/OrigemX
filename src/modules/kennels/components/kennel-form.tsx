"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { ConfirmSubmitDialog, type SubmitConfirm } from "@/components/confirm-submit-dialog";
import { FormMessage } from "@/components/form-message";

import {
  createKennel,
  updateKennel,
  type KennelFormAction,
  type KennelFormState,
} from "../actions";
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

function Submit({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Salvando…" : label}
    </button>
  );
}

export function KennelForm({
  kennel,
  action,
  header,
  confirm,
}: {
  /**
   * Chaves do formulário, não `Record<string, …>`: com index signature aberta,
   * qualquer coluna nova de outro tipo (como `founder_number`, que é number)
   * quebraria a chamada. Assim o componente aceita a linha inteira e ignora o
   * que não é campo dele.
   */
  kennel?: Partial<Record<KennelFieldName, string | null>> & { id?: string };
  /**
   * Ação alternativa, injetada por quem chama. Ausente = o fluxo do dono
   * (`createKennel`/`updateKennel`). É prop, e não uma tabela de modos aqui
   * dentro, porque a tabela obrigaria `kennels` a importar quem o chama — e a
   * dependência hoje só anda no outro sentido.
   */
  action?: KennelFormAction;
  /** Bloco livre no topo, DENTRO do `<form>`: o que ele renderizar entra no
   *  `FormData`. É onde mora o aviso e o campo de motivo do admin. */
  header?: ReactNode;
  /** Confirmação antes de gravar. Ausente = grava no primeiro clique. */
  confirm?: SubmitConfirm;
}) {
  const isEdit = Boolean(kennel?.id);

  const [state, formAction] = useActionState<KennelFormState, FormData>(
    action ?? (isEdit ? updateKennel : createKennel),
    {},
  );
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const slugOriginal = String(kennel?.slug ?? "");
  const [slug, setSlug] = useState<string>(slugOriginal);
  const [slugTouched, setSlugTouched] = useState(Boolean(kennel?.slug));
  const [confirmSlugChange, setConfirmSlugChange] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  /**
   * Passe de uma viagem: o botão de dentro do diálogo marca, o `onSubmit`
   * consome. Ref e não state — `onClick` e o evento `submit` acontecem na MESMA
   * tarefa síncrona, e um `setState` não estaria visível a tempo.
   */
  const confirmedRef = useRef(false);
  const [confirmData, setConfirmData] = useState<FormData | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  /**
   * Resposta do servidor com erro FECHA o diálogo: a mensagem mora no
   * formulário, atrás dele. Mantê-lo aberto seria um modal mudo sobre o único
   * texto que explica o que houve. Mesmo efeito de `DogForm`.
   */
  useEffect(() => {
    if (state.formError || state.errors) dialogRef.current?.close();
  }, [state.formError, state.errors]);

  const errors: FieldErrors = { ...clientErrors, ...state.errors };

  /**
   * SÓ em canil já salvo, e só quando o valor realmente diverge do que está
   * no banco — criar um canil novo escolhe o endereço pela primeira vez, não
   * "troca" nada, e não tem QR impresso ainda para quebrar.
   */
  const slugChanged = isEdit && slug !== slugOriginal;

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

        // `noValidate` está ligado neste formulário, então `required`/`minLength`
        // nos campos de quem chama são decoração. A regra dele roda AQUI.
        const extra = confirm?.validate?.(data) ?? null;
        setConfirmError(extra);

        // Validação de client é conveniência. A Server Action revalida tudo —
        // um POST direto pula esta tela inteira.
        if (Object.keys(found).length > 0 || extra) {
          e.preventDefault();
          confirmedRef.current = false; // erro depois de confirmar: recomeça
          dialogRef.current?.close();
          return;
        }

        if (confirm && !confirmedRef.current) {
          e.preventDefault();
          setConfirmData(data); // instantâneo do que está digitado AGORA
          dialogRef.current?.showModal();
          return;
        }

        confirmedRef.current = false; // passe consumido; daqui é submit de verdade
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      {kennel?.id ? <input type="hidden" name="id" value={kennel.id} /> : null}

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

      {/*
        O slug do canil é o que o QR Code codifica (`/api/qr/kennel/[id]`
        lê `kennel.slug`, não um id opaco como o do cão/ninhada) — mas, ao
        contrário deles, não é travado por trigger. Trocar aqui invalida
        qualquer QR/link já impresso com o endereço atual, então o aviso é
        explícito, com confirmação exigida antes de deixar salvar — mesma
        técnica do checkbox de LGPD em depoimentos: aviso é conveniência do
        client, a Server Action confirma de novo (`confirm_slug_change`),
        porque um POST direto pula esta tela inteira.
      */}
      {slugChanged ? (
        <div className="border-warning-subtle bg-warning-subtle rounded-control flex flex-col gap-2 border px-3 py-2.5">
          <p className="text-fg text-xs">
            Isso muda o link do seu canil. Qualquer QR Code ou link já impresso com o
            endereço atual (<span className="font-mono">{slugOriginal}</span>) vai parar de
            funcionar.
          </p>
          <label className="text-fg-faint flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              name="confirm_slug_change"
              checked={confirmSlugChange}
              onChange={(e) => setConfirmSlugChange(e.target.checked)}
              className="mt-0.5"
            />
            Entendo que isso muda o link do canil.
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Submit
          label={confirm ? confirm.openLabel : isEdit ? "Salvar alterações" : "Criar canil"}
          disabled={slugChanged && !confirmSlugChange}
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
          {/*
            Progenitores nulos: o contrato de `SubmitConfirm` nasceu no `DogForm`,
            onde o nome do pai e da mãe só existe no estado do componente e não
            no `FormData`. Canil não tem esse problema — tudo que o resumo
            precisa já está no formulário. Passar nulos aqui é mais barato que
            bifurcar o tipo, e `AdminKennelForm` simplesmente os ignora.
          */}
          {confirmData ? confirm.summary(confirmData, { sire: null, dam: null }) : null}
        </ConfirmSubmitDialog>
      ) : null}
    </form>
  );
}
