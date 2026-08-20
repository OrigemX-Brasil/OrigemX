import { isoToBr } from "@/modules/dogs/br-date";

import type { TimelineEvent } from "../timeline";

/**
 * ============================================================================
 * A história do cão — trilho horizontal de eventos datados.
 * ============================================================================
 *
 * Rola na horizontal em vez de quebrar linha: uma linha do tempo que embrulha
 * deixa de ser linha do tempo. O `overflow-x-auto` fica no PRÓPRIO trilho, e o
 * pai carrega `min-w-0` — sem isso, um filho de flex/grid com conteúdo largo
 * estoura o container em vez de rolar dentro dele, que é exatamente o defeito
 * que o teste de 360px existe para pegar.
 *
 * O fio que liga os pontos é uma borda do primeiro item ao último, e não um
 * elemento absoluto atravessando tudo: assim ele acompanha a rolagem sem
 * precisar de medida em JS.
 */
export function DogTimeline({ events }: { events: readonly TimelineEvent[] }) {
  if (events.length === 0) return null;

  return (
    <ol
      aria-label="Linha do tempo"
      className="-mx-5 flex snap-x snap-mandatory gap-0 overflow-x-auto px-5 pb-1 lg:-mx-8 lg:px-8"
    >
      {events.map((event, i) => (
        <li
          key={event.id}
          className="flex w-32 shrink-0 snap-start flex-col gap-2 sm:w-40"
          aria-label={`${event.label} em ${isoToBr(event.date)}`}
        >
          {/* O ponto e o fio. O fio é a borda superior de dois blocos que
              crescem para os lados — o primeiro item não tem fio à esquerda,
              o último não tem à direita, e a linha nunca sobra na ponta. */}
          <div aria-hidden="true" className="flex items-center">
            <span
              className={`border-border-strong h-px flex-1 ${i === 0 ? "border-t-0" : "border-t"}`}
            />
            <span className="bg-accent ring-bg size-2.5 shrink-0 rounded-full ring-4" />
            <span
              className={`border-border h-px flex-1 ${i === events.length - 1 ? "border-t-0" : "border-t"}`}
            />
          </div>

          <div className="flex flex-col gap-0.5 px-2 text-center">
            <span className="text-fg-faint font-mono text-[0.6875rem] tabular-nums">
              {isoToBr(event.date)}
            </span>
            <span className="text-fg text-xs font-medium text-balance">{event.label}</span>
            {event.detail ? (
              <span className="text-fg-muted text-[0.6875rem] text-balance">{event.detail}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
