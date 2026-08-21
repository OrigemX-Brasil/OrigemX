"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { isoToBr } from "@/modules/dogs/br-date";

import {
  addHealthRecord,
  deleteHealthRecord,
  updateHealthRecord,
  type HealthRecordFormState,
} from "../actions";
import { healthKindLabel, VACCINE_SUGGESTIONS } from "../constraints";
import type { HealthRecord } from "../queries";

import { DATALIST_VACINAS, RecordFields } from "./record-fields";

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
 * Os campos do registro (`RecordFields`, com o `<datalist>` do tipo de vacina)
 * moram em `record-fields.tsx` — o lançamento em lote da ninhada
 * (`litter-health-form.tsx`) reusa o mesmo componente, pelo mesmo registro.
 */

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
      {/* Uma vez por seção — ver o comentário de `DATALIST_VACINAS` em `record-fields.tsx`. */}
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
