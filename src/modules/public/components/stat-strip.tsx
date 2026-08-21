import type { ReactNode } from "react";

/**
 * ============================================================================
 * Faixa de leituras curtas — ícone, rótulo e valor.
 * ============================================================================
 *
 * Nasceu dentro da página da ninhada e saiu para cá quando a página do cão
 * passou a precisar da mesma faixa (a "LITTER CARD" do mockup do filhote). A
 * renderização é a MESMA nas duas: quem muda é só o número de células e o que
 * entra em cada uma.
 *
 * O valor é `font-mono tabular-nums` porque quase sempre é número ou data —
 * alinhado por coluna, sem os dígitos dançando entre uma célula e outra. Texto
 * (raça, cidade) também cai bem no mono, e a alternativa seria uma variante a
 * mais para ganhar pouco.
 */
export function Stat({
  icon,
  label,
  value,
  compact = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  /**
   * Valor em corpo menor. Existe para a faixa de SETE células da página do
   * cão: a 1152px cada célula fica com ~164px, dos quais 64 vão em respiro e
   * ícone — e "Canil Power Chronos" em `text-base` quebrava em três linhas,
   * desalinhando a faixa inteira. A faixa de quatro da ninhada, com valores
   * curtos, continua no corpo cheio.
   */
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span aria-hidden="true" className="text-fg-faint shrink-0">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-fg-faint text-[0.625rem] font-medium tracking-widest uppercase">
          {label}
        </span>
        <span
          className={`text-fg font-mono font-medium tabular-nums ${compact ? "text-sm" : "text-base"}`}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

/**
 * Os ícones da faixa.
 *
 * SVG inline, como todo ícone deste projeto (não há biblioteca) — mesmo
 * precedente do `CalendarIcon` em `dogs/components/date-field.tsx`. Todos com
 * `currentColor` e sem `aria`: quem anuncia é o rótulo de texto ao lado, e o
 * `aria-hidden` está no `<span>` que os envolve em `Stat`.
 */
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function CalendarIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/** Pata — quatro dedos e o coxim, a marca da contagem de filhotes. */
export function PawIcon() {
  return (
    <svg {...ICON_PROPS}>
      <ellipse cx="8" cy="7" rx="1.9" ry="2.5" />
      <ellipse cx="16" cy="7" rx="1.9" ry="2.5" />
      <ellipse cx="4.5" cy="12.5" rx="1.7" ry="2.2" />
      <ellipse cx="19.5" cy="12.5" rx="1.7" ry="2.2" />
      <path d="M12 12.5c3 0 5 2.2 5 4.5 0 2-1.7 3.2-3.4 2.7-1-.3-2.2-.3-3.2 0C8.7 20.2 7 19 7 17c0-2.3 2-4.5 5-4.5Z" />
    </svg>
  );
}

export function MaleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="10" cy="14" r="5" />
      <path d="M15 9l5-5M15 4h5v5" />
    </svg>
  );
}

export function FemaleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7M9 18h6" />
    </svg>
  );
}

/** Silhueta de cão, para a célula de raça. */
export function DogIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M10 5.5 7.5 3v3.2A4 4 0 0 0 5 10v9h3v-4h6v4h3v-7l3-1.5V7l-3 1.5h-3.5A3.5 3.5 0 0 0 10 5.5Z" />
    </svg>
  );
}

/** Casa com telhado — o canil. */
export function HouseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

/** Alfinete de mapa — a localização. */
export function PinIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
