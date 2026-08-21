"use client";

import { useState } from "react";

import { DateField } from "@/modules/dogs/components/date-field";

import { HEALTH_KIND_OPTIONS, MAX_NOTES_LENGTH, MAX_PRODUCT_LENGTH } from "../constraints";
import type { HealthRecord } from "../queries";

/**
 * ============================================================================
 * Campos de um registro de saúde — tipo, data, produto, observação.
 * ============================================================================
 *
 * Extraído de `health-section.tsx` para ser reusado também pelo lançamento em
 * lote (`litter-health-form.tsx`): os dois formulários pedem exatamente o
 * mesmo registro, e divergir rótulo/limite/sugestão entre eles seria o tipo de
 * inconsistência que só aparece quando alguém compara as duas telas lado a
 * lado.
 *
 * O `<datalist>` de vacinas continua responsabilidade de quem renderiza o
 * `<form>` (um só por seção/página, referenciado por id) — repetir aqui
 * duplicaria o id no documento sempre que dois formulários coexistissem.
 */

/** id do `<datalist>` de vacinas comuns — ver o comentário acima. */
export const DATALIST_VACINAS = "vacinas-comuns";

const INPUT_CLS =
  "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2 text-sm outline-none transition-colors";

/**
 * O `kind` é estado local porque o rótulo e o `<datalist>` do campo seguinte
 * dependem dele: "Tipo da vacina" com sugestões vs. "Marca do vermífugo" sem.
 */
export function RecordFields({
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
