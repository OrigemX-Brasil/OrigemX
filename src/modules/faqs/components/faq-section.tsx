"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { addFaq, moveFaq, softDeleteFaq, updateFaq, type FaqFormState } from "../actions";
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH, SUGGESTED_QUESTIONS } from "../constraints";
import type { Faq } from "../queries";

/**
 * ============================================================================
 * FAQ — lista REPETÍVEL, editável e REORDENÁVEL, no painel.
 * ============================================================================
 *
 * Sem estado de array no client: a lista vem pronta do servidor, cada linha
 * tem os próprios formulários de editar/excluir/mover. Mesmo padrão de
 * `HealthSection`.
 */

const INPUT_CLS =
  "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2 text-sm outline-none transition-colors";

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

/** Campos compartilhados por adicionar e editar. */
function FaqFields({
  idPrefix,
  errors,
  defaults,
  question,
  onQuestionChange,
}: {
  idPrefix: string;
  errors: Partial<Record<"question" | "answer", string>>;
  defaults?: Pick<Faq, "answer">;
  /** Controlado só quando há chips de sugestão (form de adicionar) — ver `FaqSection`. */
  question?: string;
  onQuestionChange?: (value: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-question`} className="text-fg-muted text-xs font-medium">
          Pergunta
        </label>
        <input
          id={`${idPrefix}-question`}
          name="question"
          type="text"
          {...(onQuestionChange
            ? { value: question ?? "", onChange: (e) => onQuestionChange(e.target.value) }
            : { defaultValue: question })}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="Como funciona a entrega?"
          className={INPUT_CLS}
        />
        {errors.question ? (
          <p role="alert" className="text-danger text-xs">
            {errors.question}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-answer`} className="text-fg-muted text-xs font-medium">
          Resposta
        </label>
        <textarea
          id={`${idPrefix}-answer`}
          name="answer"
          rows={3}
          defaultValue={defaults?.answer}
          maxLength={MAX_ANSWER_LENGTH}
          className={INPUT_CLS}
        />
        {errors.answer ? (
          <p role="alert" className="text-danger text-xs">
            {errors.answer}
          </p>
        ) : null}
      </div>
    </>
  );
}

function MoveButtons({ faqId, kennelId, disabled }: { faqId: string; kennelId: string; disabled: { up: boolean; down: boolean } }) {
  return (
    <div className="flex flex-col">
      <form action={moveFaq}>
        <input type="hidden" name="id" value={faqId} />
        <input type="hidden" name="kennel_id" value={kennelId} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={disabled.up}
          aria-label="Mover para cima"
          className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control px-1.5 py-0.5 text-xs transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ▲
        </button>
      </form>
      <form action={moveFaq}>
        <input type="hidden" name="id" value={faqId} />
        <input type="hidden" name="kennel_id" value={kennelId} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={disabled.down}
          aria-label="Mover para baixo"
          className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control px-1.5 py-0.5 text-xs transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ▼
        </button>
      </form>
    </div>
  );
}

function FaqRow({
  faq,
  kennelId,
  isFirst,
  isLast,
}: {
  faq: Faq;
  kennelId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction] = useActionState<FaqFormState, FormData>(updateFaq, {});

  // Ajuste DURANTE O RENDER, mesmo padrão de `HealthSection`.
  const [ultimoState, setUltimoState] = useState(state);
  if (state !== ultimoState) {
    setUltimoState(state);
    if (state.ok) setEditando(false);
  }

  if (editando) {
    return (
      <li className="border-border bg-surface rounded-control flex flex-col gap-3 border px-3 py-3">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={faq.id} />
          <input type="hidden" name="kennel_id" value={kennelId} />

          <FaqFields idPrefix={`edit-${faq.id}`} errors={state.errors ?? {}} defaults={faq} question={faq.question} />

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
    <li className="border-border bg-surface rounded-control flex items-start gap-3 border px-3 py-2.5">
      <MoveButtons faqId={faq.id} kennelId={kennelId} disabled={{ up: isFirst, down: isLast }} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-fg text-sm font-medium">{faq.question}</span>
        <p className="text-fg-muted text-sm">{faq.answer}</p>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
        >
          Editar
        </button>
        <form action={softDeleteFaq}>
          <input type="hidden" name="id" value={faq.id} />
          <input type="hidden" name="kennel_id" value={kennelId} />
          <button
            type="submit"
            className="text-fg-faint hover:text-danger focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
          >
            Remover
          </button>
        </form>
      </div>
    </li>
  );
}

export function FaqSection({ kennelId, faqs }: { kennelId: string; faqs: Faq[] }) {
  const [state, formAction] = useActionState<FaqFormState, FormData>(addFaq, {});
  const [question, setQuestion] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {faqs.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {faqs.map((faq, i) => (
            <FaqRow
              key={faq.id}
              faq={faq}
              kennelId={kennelId}
              isFirst={i === 0}
              isLast={i === faqs.length - 1}
            />
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted text-sm">Nenhuma pergunta cadastrada ainda.</p>
      )}

      <form action={formAction} className="border-border flex flex-col gap-3 border-t pt-4">
        <input type="hidden" name="kennel_id" value={kennelId} />

        {/* Clicar preenche a pergunta — a resposta é sempre digitada pelo
            criador, nunca pré-preenchida (garantia e política variam por
            canil). */}
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuestion(suggestion)}
              className="border-border-strong text-fg-muted hover:bg-surface-hover rounded-control border px-2.5 py-1 text-xs transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <FaqFields
          idPrefix="faq"
          errors={state.errors ?? {}}
          question={question}
          onQuestionChange={setQuestion}
        />

        <div className="flex items-center gap-3">
          <Submit label="Adicionar pergunta" />
          {state.formError ? (
            <p role="alert" className="text-danger text-xs">
              {state.formError}
            </p>
          ) : null}
          {state.ok ? (
            <p role="status" className="text-success text-xs">
              Pergunta adicionada.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
