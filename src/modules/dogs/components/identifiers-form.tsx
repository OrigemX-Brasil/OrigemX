"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateDogIdentifiers, type IdentifierFormState } from "../actions";
import type { DogIdentifiers } from "../queries";

const inputClass =
  "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2.5 text-base outline-none transition-colors";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar identificação"}
    </button>
  );
}

/**
 * RG (registro) e microchip do cão.
 *
 * Seção à parte de `DogForm` de propósito: os dois campos moram em
 * `dog_identifiers`, uma tabela diferente de `dogs`, com sua própria regra de
 * duplicidade. Deixar em branco e salvar REMOVE o identificador daquele tipo —
 * não há botão de remover separado, o campo vazio já significa isso.
 *
 * NUNCA aparece no perfil público — `dog_identifiers` não tem grant para o
 * client anônimo, então não há como este dado vazar por ali mesmo por engano.
 */
export function IdentifiersForm({
  dogId,
  identifiers,
}: {
  dogId: string;
  identifiers: DogIdentifiers;
}) {
  const [state, formAction] = useActionState<IdentifierFormState, FormData>(updateDogIdentifiers, {});

  const registrationValue = state.values?.registration_value ?? identifiers.registration?.value ?? "";
  const registrationIssuer =
    state.values?.registration_issuer ?? identifiers.registration?.issuer ?? "";
  const microchipValue = state.values?.microchip_value ?? identifiers.microchip?.value ?? "";

  return (
    <section className="border-border bg-surface rounded-card flex flex-col gap-4 border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-sm font-medium">Identificação</h2>
        <p className="text-fg-muted text-sm">
          RG e microchip são dados de identificação do animal — nunca aparecem no perfil público.
          Deixar um campo em branco e salvar remove aquele identificador.
        </p>
      </div>

      {state.formError ? (
        <p
          role="alert"
          className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {state.formError}
        </p>
      ) : null}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="dog_id" value={dogId} />

        <div className="flex flex-col gap-2">
          <label htmlFor="registration_value" className="text-fg text-sm font-medium">
            RG (registro)
          </label>
          <input
            id="registration_value"
            name="registration_value"
            type="text"
            maxLength={60}
            placeholder="Ex.: 123456"
            defaultValue={registrationValue}
            aria-describedby={state.errors?.registration_value ? "registration_value-error" : undefined}
            aria-invalid={state.errors?.registration_value ? true : undefined}
            className={inputClass}
          />
          {state.errors?.registration_value ? (
            <p id="registration_value-error" role="alert" className="text-danger text-xs">
              {state.errors.registration_value}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="registration_issuer" className="text-fg text-sm font-medium">
            Entidade emissora
          </label>
          <input
            id="registration_issuer"
            name="registration_issuer"
            type="text"
            maxLength={60}
            placeholder="Ex.: CBKC, FCI"
            defaultValue={registrationIssuer}
            aria-describedby={
              state.errors?.registration_issuer ? "registration_issuer-error" : "registration_issuer-help"
            }
            aria-invalid={state.errors?.registration_issuer ? true : undefined}
            className={inputClass}
          />
          {state.errors?.registration_issuer ? (
            <p id="registration_issuer-error" role="alert" className="text-danger text-xs">
              {state.errors.registration_issuer}
            </p>
          ) : (
            <p id="registration_issuer-help" className="text-fg-faint text-xs">
              Obrigatória junto com o número de registro — o mesmo número existe em entidades
              diferentes apontando para cães diferentes.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="microchip_value" className="text-fg text-sm font-medium">
            Número do microchip
          </label>
          <input
            id="microchip_value"
            name="microchip_value"
            type="text"
            maxLength={60}
            placeholder="Ex.: 981000000000000"
            defaultValue={microchipValue}
            aria-describedby={state.errors?.microchip_value ? "microchip_value-error" : undefined}
            aria-invalid={state.errors?.microchip_value ? true : undefined}
            className={inputClass}
          />
          {state.errors?.microchip_value ? (
            <p id="microchip_value-error" role="alert" className="text-danger text-xs">
              {state.errors.microchip_value}
            </p>
          ) : null}
        </div>

        <div>
          <Submit />
        </div>
      </form>
    </section>
  );
}
