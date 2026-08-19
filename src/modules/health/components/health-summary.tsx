import { isoToBr } from "@/modules/dogs/br-date";

import { healthKindLabel } from "../constraints";
import { publicHealthLabel, type LatestHealth, type LitterHealthCoverage } from "../summary";

/**
 * ============================================================================
 * Resumo público de saúde, com checkmark.
 * ============================================================================
 *
 * Server component — não há nada interativo aqui, e a página pública é ISR.
 *
 * Usado pelas DUAS rotas públicas: `/d/[public_id]` (um cão) e
 * `/n/[public_id]` (a ninhada, agregada). O histórico completo NÃO aparece em
 * nenhuma das duas: público vê o mais recente de cada tipo, o dono vê o log
 * inteiro no painel (`HealthSection`).
 *
 * COR NUNCA SOZINHA. O texto carrega a informação inteira — "Vermífugo
 * aplicado em 10/08/2026", "Vacina: 2 de 6 filhotes" — então quem não
 * distingue verde de cinza lê exatamente o mesmo fato (WCAG 1.4.1). O check é
 * reforço visual, não o portador do significado. Mesma regra já aplicada em
 * `litters/components/puppy-status-chip.tsx`.
 *
 * O SVG é inline porque o projeto não tem biblioteca de ícone — mesmo
 * precedente do `CalendarIcon` em `dogs/components/date-field.tsx`.
 */

function CheckIcon({ muted }: { muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
        muted ? "border-border-strong text-fg-faint" : "border-success/40 bg-success-subtle text-success"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

function Item({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <CheckIcon muted={muted} />
      <span className={`text-sm ${muted ? "text-fg-muted" : "text-fg"}`}>{children}</span>
    </li>
  );
}

/**
 * Resumo de UM cão — `/d/[public_id]` e o card do filhote na ninhada.
 *
 * Devolve `null` quando não há registro nenhum: seção ausente é melhor que
 * título órfão sobre uma caixa vazia, mesmo critério que a rota do cão já
 * aplica a vídeo e fotos.
 */
export function DogHealthSummary({ entries }: { entries: readonly LatestHealth[] }) {
  if (entries.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <Item key={entry.kind}>
          {publicHealthLabel(entry.kind)} {isoToBr(entry.applied_on)}
          {entry.product ? (
            <span className="text-fg-muted"> · {entry.product}</span>
          ) : null}
        </Item>
      ))}
    </ul>
  );
}

/**
 * Resumo da NINHADA — agregado, com a ressalva de cobertura.
 *
 * `complete` decide entre afirmar e informar:
 *
 *   todos cobertos  → check verde + "Vermífugo aplicado em 10/08/2026"
 *   cobertura parcial → check apagado + "Vacina: 2 de 6 filhotes"
 *
 * A segunda forma existe porque a primeira, aplicada a uma ninhada
 * parcialmente vacinada, é uma afirmação falsa para quem está decidindo uma
 * compra. Ver o cabeçalho de `litterHealthCoverage`.
 */
export function LitterHealthSummary({
  coverage,
}: {
  coverage: readonly LitterHealthCoverage[];
}) {
  if (coverage.length === 0) return null;

  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {coverage.map((item) =>
        item.complete ? (
          <Item key={item.kind}>
            {publicHealthLabel(item.kind)} {isoToBr(item.applied_on)}
          </Item>
        ) : (
          <Item key={item.kind} muted>
            {healthKindLabel(item.kind)}: {item.covered} de {item.total}{" "}
            {item.total === 1 ? "filhote" : "filhotes"}
          </Item>
        ),
      )}
    </ul>
  );
}
