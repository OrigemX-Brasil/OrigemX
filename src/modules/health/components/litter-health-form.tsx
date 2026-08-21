"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { LitterPuppy } from "@/modules/litters/queries";

import { addHealthRecordForLitter, type LitterHealthRecordFormState } from "../actions";
import { VACCINE_SUGGESTIONS } from "../constraints";

import { DATALIST_VACINAS, RecordFields } from "./record-fields";

/**
 * ============================================================================
 * Lançar o MESMO registro de saúde em vários filhotes de uma vez.
 * ============================================================================
 *
 * Atalho, não modelo novo: `addHealthRecordForLitter` continua gravando UMA
 * linha por filhote em `dog_health_records` — este formulário só evita
 * repetir "Tipo/Data/Produto" N vezes quando o evento é o mesmo para vários
 * (ex.: V10 aplicada na ninhada toda no mesmo dia).
 *
 * Todo filhote nasce MARCADO: é o caso comum ("vacinei a ANIMAL_NOME toda")
 * que justifica a tela existir. Desmarcar é a exceção — um filhote já
 * vendido, um em protocolo diferente — não o contrário.
 */

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Registrando…" : "Registrar para os filhotes selecionados"}
    </button>
  );
}

export function LitterHealthForm({
  kennelId,
  litterId,
  litterPublicId,
  puppies,
}: {
  kennelId: string;
  litterId: string;
  litterPublicId: string;
  puppies: readonly LitterPuppy[];
}) {
  const [state, formAction] = useActionState<LitterHealthRecordFormState, FormData>(
    addHealthRecordForLitter,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <datalist id={DATALIST_VACINAS}>
        {VACCINE_SUGGESTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <input type="hidden" name="kennel_id" value={kennelId} />
      <input type="hidden" name="litter_id" value={litterId} />
      <input type="hidden" name="litter_public_id" value={litterPublicId} />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-fg-muted text-xs font-medium">Filhotes</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {puppies.map((puppy) => (
            <label key={puppy.id} className="text-fg flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="dog_ids"
                value={puppy.id}
                defaultChecked
                className="accent-accent size-4"
              />
              {puppy.name} ({puppy.sex === "female" ? "Fêmea" : "Macho"})
            </label>
          ))}
        </div>
      </fieldset>

      <RecordFields idPrefix="litter-health" errors={state.errors ?? {}} />

      <div className="flex items-center gap-3">
        <Submit />
        {state.formError ? (
          <p role="alert" className="text-danger text-xs">
            {state.formError}
          </p>
        ) : null}
        {state.ok ? (
          <p role="status" className="text-success text-xs">
            Registrado para {state.appliedCount}{" "}
            {state.appliedCount === 1 ? "filhote" : "filhotes"}.
            {state.skippedCount ? (
              <>
                {" "}
                {state.skippedCount === 1
                  ? "1 filhote já estava no limite de registros e ficou de fora."
                  : `${state.skippedCount} filhotes já estavam no limite de registros e ficaram de fora.`}
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </form>
  );
}
