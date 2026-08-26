"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { SEX_OPTIONS } from "@/modules/dogs/fields";
import { slugify } from "@/modules/kennels/validation";

import { createFirstDog, type FirstDogState } from "../actions";
import { baseDeSlug } from "../slug";

/**
 * ============================================================================
 * O formulário do primeiro acesso: canil e cão num envio só.
 * ============================================================================
 *
 * TRÊS CAMPOS. São exatamente os obrigatórios das duas tabelas — `kennels.name`
 * (o endereço é derivado), `dogs.name` e `dogs.sex`. Nada mais é NOT NULL em
 * nenhuma das duas, e pedir raça, nascimento ou cor aqui transformaria o
 * primeiro contato num interrogatório. O resto se completa na tela de sucesso,
 * que já convida a isso.
 *
 * O ENDEREÇO É MOSTRADO, NUNCA PEDIDO. `kennels_slug_key` é único global e não
 * parcial por `deleted_at`: o endereço fica queimado para sempre, mesmo que o
 * canil seja excluído. Derivar em silêncio seria gravar uma decisão permanente
 * sem a pessoa ver; pedir como campo obrigaria a entender o que é uma URL antes
 * de cadastrar o primeiro cão. Exibir o resultado resolve os dois lados.
 *
 * A prévia usa o MESMO `slugify` da action (via `baseDeSlug`), então o que
 * aparece na tela é o que vai ser gravado — a não ser que o endereço já esteja
 * tomado, e aí o servidor acrescenta um sufixo. Ver `actions.ts`.
 */

const dominio =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "") ??
  "origemxbr.com";

export function FirstDogForm() {
  const [state, formAction] = useActionState<FirstDogState, FormData>(createFirstDog, {});
  const [kennelName, setKennelName] = useState(state.values?.kennel_name ?? "");

  // Só depois de o nome virar um slug de verdade: enquanto a pessoa digitou
  // "C", mostrar "seu endereço será /c/canil-c" seria ruído, não ajuda.
  const previa = slugify(kennelName).length > 0 ? baseDeSlug(kennelName) : null;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-8">
      {state.formError ? (
        <p
          role="alert"
          className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {state.formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="kennel_name" className="text-fg text-sm font-medium">
          Nome do seu canil
        </label>
        <input
          id="kennel_name"
          name="kennel_name"
          type="text"
          value={kennelName}
          onChange={(e) => setKennelName(e.target.value)}
          maxLength={120}
          autoComplete="organization"
          aria-describedby={state.errors?.kennel_name ? "kennel_name-error" : "kennel_name-help"}
          className="border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2.5 text-base outline-none transition-colors"
        />
        {state.errors?.kennel_name ? (
          <p id="kennel_name-error" role="alert" className="text-danger text-xs">
            {state.errors.kennel_name}
          </p>
        ) : (
          <p id="kennel_name-help" className="text-fg-faint text-xs">
            {previa ? (
              <>
                Seu endereço será{" "}
                <span className="text-fg-muted font-mono">
                  {dominio}/c/{previa}
                </span>
                . Dá para mudar depois.
              </>
            ) : (
              "É o nome que aparece no seu perfil público e nas páginas dos seus cães."
            )}
          </p>
        )}
      </div>

      <div className="border-border flex flex-col gap-6 border-t pt-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-fg text-sm font-medium">
            Nome do cão
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={state.values?.name ?? ""}
            maxLength={120}
            placeholder="Rex de Aurora"
            aria-describedby={state.errors?.name ? "name-error" : undefined}
            className="border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2.5 text-base outline-none transition-colors"
          />
          {state.errors?.name ? (
            <p id="name-error" role="alert" className="text-danger text-xs">
              {state.errors.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="sex" className="text-fg text-sm font-medium">
            Sexo
          </label>
          {/* `SEX_OPTIONS` de `dogs/fields.ts`, não uma segunda lista: o domínio
              é o CHECK `dogs_sex_valid`, e duas cópias divergiriam. */}
          <select
            id="sex"
            name="sex"
            defaultValue={state.values?.sex ?? ""}
            aria-describedby={state.errors?.sex ? "sex-error" : undefined}
            className="border-border-strong bg-bg text-fg focus-visible:border-accent rounded-control border px-3 py-2.5 text-base outline-none transition-colors"
          >
            <option value="">Selecione</option>
            {SEX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {state.errors?.sex ? (
            <p id="sex-error" role="alert" className="text-danger text-xs">
              {state.errors.sex}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col items-start gap-4">
        <Submit />
        <p className="text-fg-faint text-xs">
          Foto, raça, pedigree e o resto entram depois — nada disso é obrigatório agora.
        </p>
      </div>

      <Link
        href="/painel?explorar=1"
        className="text-fg-muted hover:text-fg w-fit text-sm underline underline-offset-4 transition-colors"
      >
        Deixar para depois
      </Link>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Criando…" : "Criar e continuar"}
    </button>
  );
}
