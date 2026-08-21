"use client";

import { useState } from "react";

import { DateField } from "@/modules/dogs/components/date-field";

import { MAX_NOTES_LENGTH, MEASUREMENT_KIND_OPTIONS } from "../constraints";
import type { Measurement } from "../queries";

/**
 * ============================================================================
 * Campos de uma medição — tipo, valor, data, observação.
 * ============================================================================
 *
 * Mesmo desenho de `health/components/record-fields.tsx`: extraído para ser
 * reusado por adicionar e editar sem divergir rótulo, limite ou sugestão.
 *
 * O `kind` é estado local porque o rótulo do campo seguinte depende dele:
 * "Peso (kg)" ou "Cernelha (cm)" — a unidade é implícita no tipo, então
 * mostrar as duas juntas no rótulo evita o criador digitar cm pensando em
 * peso.
 */

const INPUT_CLS =
  "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2 text-sm outline-none transition-colors";

export function MeasurementFields({
  idPrefix,
  errors,
  defaults,
}: {
  idPrefix: string;
  errors: Partial<Record<"kind" | "value" | "measured_on" | "notes", string>>;
  defaults?: Pick<Measurement, "kind" | "value" | "measured_on" | "notes">;
}) {
  const [kind, setKind] = useState<string>(defaults?.kind ?? "weight");
  const valorLabel = MEASUREMENT_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? "Valor";

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
            {MEASUREMENT_KIND_OPTIONS.map((o) => (
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
          <label htmlFor={`${idPrefix}-value`} className="text-fg-muted text-xs font-medium">
            {valorLabel}
          </label>
          <input
            id={`${idPrefix}-value`}
            name="value"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            defaultValue={defaults?.value ?? undefined}
            placeholder={kind === "weight" ? "Ex.: 4.5" : "Ex.: 45"}
            className={INPUT_CLS}
          />
          {errors.value ? (
            <p role="alert" className="text-danger text-xs">
              {errors.value}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-measured-on`} className="text-fg-muted text-xs font-medium">
            Data
          </label>
          <DateField
            id={`${idPrefix}-measured-on`}
            name="measured_on"
            defaultValue={defaults?.measured_on}
          />
          {errors.measured_on ? (
            <p role="alert" className="text-danger text-xs">
              {errors.measured_on}
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
