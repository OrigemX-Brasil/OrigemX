"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { isoToBr } from "@/modules/dogs/br-date";
import { DateField } from "@/modules/dogs/components/date-field";

import {
  addGeneticTest,
  deleteGeneticTest,
  updateGeneticTest,
  type GeneticTestFormState,
} from "../actions";
import {
  GENETIC_RESULT_SUGGESTIONS,
  GENETIC_TEST_SUGGESTIONS,
  MAX_TEST_NAME_LENGTH,
  MAX_TEST_RESULT_LENGTH,
} from "../constraints";
import type { GeneticTest } from "../queries";

/**
 * ============================================================================
 * Exames genéticos do cão — lista REPETÍVEL, com CRUD completo.
 * ============================================================================
 *
 * Cadastrado UMA vez, no perfil do cão, e daí em diante aparece sozinho em
 * TODA ninhada em que ele for pai ou mãe. É assim que o pedido "exames dos
 * progenitores importados do perfil dos pais, não digitados de novo na
 * ninhada" se cumpre sem nenhuma máquina de importação: o dado tem um dono só.
 *
 * EDITAR mora em cada linha, num `useState` local de `editando`. Isso é estado
 * de UI POR LINHA — não estado de array dos dados: a lista continua vindo do
 * servidor, e salvar uma linha não toca nas outras. Mesmo precedente do
 * `fotoAberta` em `litters/components/puppy-manager.tsx`.
 *
 * `readOnly` cobre o caso do reprodutor de terceiro. A RLS
 * (`private.can_manage_dog`) recusaria a escrita, e oferecer um formulário que
 * não salva é pior que não oferecer — a tela mostra os laudos e diz de quem é
 * a caneta.
 */

const INPUT_CLS =
  "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2 text-sm outline-none transition-colors";

/** Os `<datalist>` são renderizados UMA vez pela seção e referenciados por id
 *  tanto pelo formulário de adicionar quanto pelo de cada linha em edição —
 *  repetir por linha produziria ids duplicados no documento. */
const DATALIST_EXAMES = "exames-comuns";
const DATALIST_RESULTADOS = "resultados-comuns";

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

/** Os quatro campos do exame, compartilhados por adicionar e editar — para as
 *  duas telas não divergirem em rótulo, limite ou sugestão. */
function TestFields({
  idPrefix,
  errors,
  defaults,
}: {
  idPrefix: string;
  errors: Partial<Record<"name" | "result" | "tested_on" | "lab", string>>;
  defaults?: Pick<GeneticTest, "name" | "result" | "tested_on" | "lab">;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-name`} className="text-fg-muted text-xs font-medium">
          Exame
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          type="text"
          list={DATALIST_EXAMES}
          defaultValue={defaults?.name}
          maxLength={MAX_TEST_NAME_LENGTH}
          placeholder="Displasia coxofemoral"
          className={INPUT_CLS}
        />
        {errors.name ? (
          <p role="alert" className="text-danger text-xs">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-result`} className="text-fg-muted text-xs font-medium">
          Resultado
        </label>
        <input
          id={`${idPrefix}-result`}
          name="result"
          type="text"
          list={DATALIST_RESULTADOS}
          defaultValue={defaults?.result}
          maxLength={MAX_TEST_RESULT_LENGTH}
          placeholder="Livre, Portador, A/A…"
          className={INPUT_CLS}
        />
        {errors.result ? (
          <p role="alert" className="text-danger text-xs">
            {errors.result}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-date`} className="text-fg-muted text-xs font-medium">
          Data do laudo (opcional)
        </label>
        <DateField
          id={`${idPrefix}-date`}
          name="tested_on"
          defaultValue={defaults?.tested_on ?? undefined}
        />
        {errors.tested_on ? (
          <p role="alert" className="text-danger text-xs">
            {errors.tested_on}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-lab`} className="text-fg-muted text-xs font-medium">
          Laboratório (opcional)
        </label>
        <input
          id={`${idPrefix}-lab`}
          name="lab"
          type="text"
          defaultValue={defaults?.lab ?? undefined}
          maxLength={MAX_TEST_NAME_LENGTH}
          className={INPUT_CLS}
        />
      </div>
    </div>
  );
}

function TestRow({
  test,
  dogId,
  readOnly,
}: {
  test: GeneticTest;
  dogId: string;
  readOnly?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction] = useActionState<GeneticTestFormState, FormData>(
    updateGeneticTest,
    {},
  );

  // Salvou: volta para a exibição. A lista já foi revalidada pelo servidor,
  // então o que aparece é o valor novo, vindo do banco — não um eco do que
  // estava no formulário.
  //
  // Ajuste DURANTE O RENDER, o padrão do React para reagir a uma mudança de
  // valor — não um efeito (o lint do projeto proíbe `setState` dentro de
  // `useEffect`, e com razão: aqui produziria um render extra visível).
  //
  // A comparação é com o OBJETO `state`, não com `state.ok`: `useActionState`
  // devolve um objeto novo a cada submissão, então cada salvamento é detectado.
  // Guardar só o booleano quebraria de duas formas — a segunda edição não
  // fecharia (o `true` não muda), e reabrir a linha a fecharia na hora.
  const [ultimoState, setUltimoState] = useState(state);
  if (state !== ultimoState) {
    setUltimoState(state);
    if (state.ok) setEditando(false);
  }

  if (editando) {
    return (
      <li className="border-border bg-surface rounded-control flex flex-col gap-3 border px-3 py-3">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={test.id} />
          <input type="hidden" name="dog_id" value={dogId} />

          <TestFields idPrefix={`edit-${test.id}`} errors={state.errors ?? {}} defaults={test} />

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
      <span className="text-fg text-sm font-medium">{test.name}</span>
      <span className="text-data font-mono text-sm font-medium">{test.result}</span>
      {test.tested_on ? (
        <span className="text-fg-muted font-mono text-sm tabular-nums">
          {isoToBr(test.tested_on)}
        </span>
      ) : null}
      {test.lab ? <span className="text-fg-faint text-xs">{test.lab}</span> : null}

      {!readOnly ? (
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
          >
            Editar
          </button>
          <form action={deleteGeneticTest}>
            <input type="hidden" name="id" value={test.id} />
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

export function GeneticSection({
  dogId,
  tests,
  readOnly,
}: {
  dogId: string;
  tests: GeneticTest[];
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState<GeneticTestFormState, FormData>(addGeneticTest, {});

  return (
    <div className="flex flex-col gap-4">
      {/* Uma vez por seção — ver o comentário das constantes acima. */}
      <datalist id={DATALIST_EXAMES}>
        {GENETIC_TEST_SUGGESTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id={DATALIST_RESULTADOS}>
        {GENETIC_RESULT_SUGGESTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {tests.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {tests.map((test) => (
            <TestRow key={test.id} test={test} dogId={dogId} readOnly={readOnly} />
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted text-sm">
          {readOnly
            ? "Nenhum exame cadastrado para este cão."
            : "Nenhum exame ainda. O que você cadastrar aqui aparece em toda ninhada em que este cão for pai ou mãe."}
        </p>
      )}

      {readOnly ? null : (
        <form action={formAction} className="border-border flex flex-col gap-3 border-t pt-4">
          <input type="hidden" name="dog_id" value={dogId} />

          <TestFields idPrefix="test" errors={state.errors ?? {}} />

          <div className="flex items-center gap-3">
            <Submit label="Adicionar exame" />
            {state.formError ? (
              <p role="alert" className="text-danger text-xs">
                {state.formError}
              </p>
            ) : null}
            {state.ok ? (
              <p role="status" className="text-success text-xs">
                Exame adicionado.
              </p>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
