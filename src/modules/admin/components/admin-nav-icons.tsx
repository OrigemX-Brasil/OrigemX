/**
 * Ícones da navegação administrativa, um por seção.
 *
 * SVG inline, mesma forma exata de `modules/search/components/search-icons.tsx`
 * — não há biblioteca de ícones no projeto, por decisão (ver o comentário
 * daquele arquivo), e seis a mais não é motivo para reabrir isso. Traço
 * herda `currentColor` do pai: a cor vem sempre de um token `text-*`.
 */

type IconProps = { className?: string };

const BASE = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function OverviewIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  );
}

export function KennelIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function DogIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="16" r="4" />
      <circle cx="6" cy="10" r="2" />
      <circle cx="10" cy="5" r="2" />
      <circle cx="14" cy="5" r="2" />
      <circle cx="18" cy="10" r="2" />
    </svg>
  );
}

export function BadgeIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="9" r="6" />
      <path d="M9 14.5 7 21l5-3 5 3-2-6.5" />
    </svg>
  );
}

export function HistoryIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
