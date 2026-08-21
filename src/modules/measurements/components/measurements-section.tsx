"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { isoToBr } from "@/modules/dogs/br-date";

import {
  addMeasurement,
  deleteMeasurement,
  updateMeasurement,
  type MeasurementFormState,
} from "../actions";
import { measurementKindName, measurementUnit } from "../constraints";
import type { Measurement } from "../queries";

import { MeasurementFields } from "./measurement-fields";

/**
 * ============================================================================
 * Peso e cernelha — lista REPETÍVEL, com CRUD completo.
 * ============================================================================
 *
 * Mesmo desenho de `health/components/health-section.tsx`: um `<form>` por
 * linha, adicionar é outro, sem estado de array no client — a lista
 * rerenderiza do servidor.
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

function MeasurementRow({
  measurement,
  dogId,
  readOnly,
}: {
  measurement: Measurement;
  dogId: string;
  readOnly?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction] = useActionState<MeasurementFormState, FormData>(
    updateMeasurement,
    {},
  );

  // Ajuste DURANTE O RENDER — mesmo padrão de `health-section.tsx`: reagir a
  // uma mudança de valor sem `useEffect`, proibido pelo lint do projeto.
  const [ultimoState, setUltimoState] = useState(state);
  if (state !== ultimoState) {
    setUltimoState(state);
    if (state.ok) setEditando(false);
  }

  if (editando) {
    return (
      <li className="border-border bg-surface rounded-control flex flex-col gap-3 border px-3 py-3">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={measurement.id} />
          <input type="hidden" name="dog_id" value={dogId} />

          <MeasurementFields
            idPrefix={`edit-${measurement.id}`}
            errors={state.errors ?? {}}
            defaults={measurement}
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
      <span className="text-fg text-sm font-medium">{measurementKindName(measurement.kind)}</span>
      <span className="text-data font-mono text-sm">
        {measurement.value} {measurementUnit(measurement.kind)}
      </span>
      <span className="text-fg-muted font-mono text-sm tabular-nums">
        {isoToBr(measurement.measured_on)}
      </span>
      {measurement.notes ? (
        <span className="text-fg-faint w-full text-xs">{measurement.notes}</span>
      ) : null}

      {!readOnly ? (
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
          >
            Editar
          </button>
          <form action={deleteMeasurement}>
            <input type="hidden" name="id" value={measurement.id} />
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

export function MeasurementsSection({
  dogId,
  measurements,
  readOnly,
}: {
  dogId: string;
  measurements: Measurement[];
  /** Cão de terceiro: mostra o histórico, não oferece formulário que a RLS recusaria. */
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState<MeasurementFormState, FormData>(addMeasurement, {});

  return (
    <div className="flex flex-col gap-4">
      {measurements.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {measurements.map((measurement) => (
            <MeasurementRow
              key={measurement.id}
              measurement={measurement}
              dogId={dogId}
              readOnly={readOnly}
            />
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted text-sm">Nenhuma medição registrada ainda.</p>
      )}

      {readOnly ? null : (
        <form action={formAction} className="border-border flex flex-col gap-3 border-t pt-4">
          <input type="hidden" name="dog_id" value={dogId} />

          <MeasurementFields idPrefix="measurement" errors={state.errors ?? {}} />

          <div className="flex items-center gap-3">
            <Submit label="Adicionar medição" />
            {state.formError ? (
              <p role="alert" className="text-danger text-xs">
                {state.formError}
              </p>
            ) : null}
            {state.ok ? (
              <p role="status" className="text-success text-xs">
                Medição registrada.
              </p>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
