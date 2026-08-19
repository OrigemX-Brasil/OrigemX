"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { isoToBr } from "@/modules/dogs/br-date";
import { DateField } from "@/modules/dogs/components/date-field";

import {
  addHealthRecord,
  deleteHealthRecord,
  updateHealthRecord,
  type HealthRecordFormState,
} from "../actions";
import {
  HEALTH_KIND_OPTIONS,
  MAX_NOTES_LENGTH,
  MAX_PRODUCT_LENGTH,
  healthKindLabel,
  VACCINE_SUGGESTIONS,
} from "../constraints";
import type { HealthRecord } from "../queries";

/**
 * ============================================================================
 * Vermífugo e vacina — lista REPETÍVEL, com CRUD completo.
 * ============================================================================
 *
 * Sem estado de array no client. A lista é renderizada pelo servidor; cada
 * linha tem os próprios `<form>` de editar e excluir, e adicionar é outro. Não
 * há "índice do array" para sincronizar com id de banco, e uma linha que falha
 * não derruba o que já foi salvo.
 *
 * O `<datalist>` do tipo de vacina oferece os valores comuns SEM fechar o
 * campo: o banco aceita texto livre de propósito (ver o cabeçalho da migration),
 * porque um enum erra na primeira vacina nova e trava quem não tem contorno.
 */

const INPUT_CLS =
  "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2 text-sm outline-none transition-colors";

/** Renderizado UMA vez pela seção e referenciado por id pelos formulários de
 *  adicionar e de editar — repetir por linha duplicaria o id no documento. */
const DATALIST_VACINAS = "vacinas-comuns";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="border-border-strong text-fg hover:bg-surface-hover rounded-control shrink-0 border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Salvando…" : label}
    </button>
  );
}

/**
 * Os campos do registro, compartilhados por adicionar e editar — para os dois
 * não divergirem em rótulo, limite ou sugestão.
 *
 * O `kind` é estado local porque o rótulo e o `<datalist>` do campo seguinte
 * dependem dele: "Tipo da vacina" com sugestões vs. "Marca do vermífugo" sem.
 */
function RecordFields({
  idPrefix,
  errors,
  defaults,
}: {
  idPrefix: string;
  errors: Partial<Record<"kind" | "applied_on" | "product" | "notes", string>>;
  defaults?: Pick<HealthRecord, "kind" | "applied_on" | "product" | "notes">;
}) {
  const [kind, setKind] = useState<string>(defaults?.kind ?? "vaccine");

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-kind`} className="text-fg-muted text-xs font-medium">
            Tipo
          </label>
          <select
            id={`${idPrefix}-kind`}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={INPUT_CLS}
          >
            {HEALTH_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {errors.kind ? (
            <p role="alert" className="text-danger text-xs">
              {errors.kind}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-applied-on`} className="text-fg-muted text-xs font-medium">
            Data
          </label>
          <DateField
            id={`${idPrefix}-applied-on`}
            name="applied_on"
            defaultValue={defaults?.applied_on}
          />
          {errors.applied_on ? (
            <p role="alert" className="text-danger text-xs">
              {errors.applied_on}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-product`} className="text-fg-muted text-xs font-medium">
            {kind === "vaccine" ? "Tipo da vacina" : "Marca do vermífugo"}
          </label>
          <input
            id={`${idPrefix}-product`}
            name="product"
            type="text"
            list={kind === "vaccine" ? DATALIST_VACINAS : undefined}
            defaultValue={defaults?.product ?? undefined}
            maxLength={MAX_PRODUCT_LENGTH}
            placeholder={kind === "vaccine" ? "V10" : "Opcional"}
            className={INPUT_CLS}
          />
          {errors.product ? (
            <p role="alert" className="text-danger text-xs">
              {errors.product}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-notes`} className="text-fg-muted text-xs font-medium">
          Observação (opcional)
        </label>
        <input
          id={`${idPrefix}-notes`}
          name="notes"
          type="text"
          defaultValue={defaults?.notes ?? undefined}
          maxLength={MAX_NOTES_LENGTH}
          className={INPUT_CLS}
        />
        {errors.notes ? (
          <p role="alert" className="text-danger text-xs">
            {errors.notes}
          </p>
        ) : null}
      </div>
    </>
  );
}

function RecordRow({
  record,
  dogId,
  readOnly,
}: {
  record: HealthRecord;
  dogId: string;
  readOnly?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction] = useActionState<HealthRecordFormState, FormData>(
    updateHealthRecord,
    {},
  );

  // Ajuste DURANTE O RENDER — o padrão do React para reagir a uma mudança de
  // valor, e não um efeito (`setState` dentro de `useEffect` é proibido pelo
  // lint do projeto, e aqui produziria um render extra visível).
  //
  // Compara o OBJETO `state`, não `state.ok`: `useActionState` devolve um
  // objeto novo por submissão. Guardar só o booleano quebraria de duas formas
  // — a segunda edição não fecharia, e reabrir a linha a fecharia na hora.
  const [ultimoState, setUltimoState] = useState(state);
  if (state !== ultimoState) {
    setUltimoState(state);
    if (state.ok) setEditando(false);
  }

  if (editando) {
    return (
      <li className="border-border bg-surface rounded-control flex flex-col gap-3 border px-3 py-3">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={record.id} />
          <input type="hidden" name="dog_id" value={dogId} />

          <RecordFields
            idPrefix={`edit-${record.id}`}
            errors={state.errors ?? {}}
            defaults={record}
          />

          <div className="flex items-center gap-3">
            <Submit label="Salvar" />
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="text-fg-faint hover:text-fg rounded-control px-2 py-1 text-xs transition-colors"
            >
              Cancelar
            </button>
            {state.formError ? (
              <p role="alert" className="text-danger text-xs">
                {state.formError}
              </p>
            ) : null}
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="border-border bg-surface rounded-control flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2.5">
      <span className="text-fg text-sm font-medium">{healthKindLabel(record.kind)}</span>
      {record.product ? (
        <span className="text-data font-mono text-sm">{record.product}</span>
      ) : null}
      <span className="text-fg-muted font-mono text-sm tabular-nums">
        {isoToBr(record.applied_on)}
      </span>
      {record.notes ? <span className="text-fg-faint w-full text-xs">{record.notes}</span> : null}

      {!readOnly ? (
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
          >
            Editar
          </button>
          <form action={deleteHealthRecord}>
            <input type="hidden" name="id" value={record.id} />
            <input type="hidden" name="dog_id" value={dogId} />
            <button
              type="submit"
              className="text-fg-faint hover:text-danger focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
            >
              Remover
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}

export function HealthSection({
  dogId,
  records,
  readOnly,
}: {
  dogId: string;
  records: HealthRecord[];
  /** Cão de terceiro: mostra o histórico, não oferece formulário que a RLS recusaria. */
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState<HealthRecordFormState, FormData>(addHealthRecord, {});

  return (
    <div className="flex flex-col gap-4">
      {/* Uma vez por seção — ver o comentário da constante acima. */}
      <datalist id={DATALIST_VACINAS}>
        {VACCINE_SUGGESTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {records.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {records.map((record) => (
            <RecordRow key={record.id} record={record} dogId={dogId} readOnly={readOnly} />
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted text-sm">Nenhum registro de saúde ainda.</p>
      )}

      {readOnly ? null : (
        <form action={formAction} className="border-border flex flex-col gap-3 border-t pt-4">
          <input type="hidden" name="dog_id" value={dogId} />

          <RecordFields idPrefix="health" errors={state.errors ?? {}} />

          <div className="flex items-center gap-3">
            <Submit label="Adicionar registro" />
            {state.formError ? (
              <p role="alert" className="text-danger text-xs">
                {state.formError}
              </p>
            ) : null}
            {state.ok ? (
              <p role="status" className="text-success text-xs">
                Registro adicionado.
              </p>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
