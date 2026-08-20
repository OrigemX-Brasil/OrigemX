import { isoToBr } from "@/modules/dogs/br-date";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";

/**
 * ============================================================================
 * Selos de confiança — cada um só existe se o DADO existir.
 * ============================================================================
 *
 * NENHUM BADGE FALSO, e isso decidiu os rótulos:
 *
 *   - NÃO existe "Criador Verificado". Nesta página, canil não-nulo já
 *     significa canil publicado — o badge apareceria para todo cão com canil e
 *     afirmaria uma verificação que a OrigemX não faz. A distinção REAL é o
 *     selo de fundador, atribuído pelo banco (`try_assign_founder_number`), e
 *     é esse que aparece, com o número. Sem selo, sem badge.
 *
 *   - NÃO existe "Vacinas em dia" nem "Exames em dia". "Em dia" é julgamento
 *     clínico sobre um calendário vacinal que a plataforma não conhece. O que
 *     sabemos é a DATA do registro mais recente, e é ela que o badge mostra —
 *     mesma distinção que `health/summary.ts` já documenta ao trocar "Primeira
 *     vacina" por "Última vacina".
 *
 * Cor: os badges usam o par `border-<estado>/40 bg-<estado>-subtle
 * text-<estado>` já canônico nos chips de filhote. Dourado fica fora — é
 * exclusivo do selo, e o `FounderBadge` é quem o carrega.
 */

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function SyringeIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="m18 2 4 4M17 7l-1.5-1.5M20.5 3.5 19 2M14 8 6 16v2h2l8-8" />
      <path d="m11 5 8 8M9 11l2 2" />
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M6 4h5v4H6zM6 16h5v4H6zM15 10h5v4h-5z" />
      <path d="M11 6h2v10h-2M13 12h2" />
    </svg>
  );
}

function Badge({
  icon,
  children,
  tone,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone: "success" | "data";
}) {
  const cls =
    tone === "success"
      ? "border-success/40 bg-success-subtle text-success"
      : "border-data/40 bg-data-subtle text-data";

  return (
    <span
      className={`rounded-control inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      {children}
    </span>
  );
}

export function TrustBadges({
  founderNumber,
  vaccineDate,
  geneticTestCount,
  knownAncestors,
}: {
  /** `kennels.founder_number` — o `FounderBadge` já se auto-oculta se nulo. */
  founderNumber: number | null | undefined;
  /** ISO da vacina mais recente, ou `null` se o cão não tem nenhuma. */
  vaccineDate: string | null;
  geneticTestCount: number;
  /** `pedigree.knownAncestors` — 0 significa árvore vazia. */
  knownAncestors: number;
}) {
  const temAlgum =
    Boolean(founderNumber) || Boolean(vaccineDate) || geneticTestCount > 0 || knownAncestors > 0;

  // Sem nenhum dado, a fileira inteira some — nem um contorno vazio fica.
  if (!temAlgum) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {founderNumber ? (
        <li>
          <FounderBadge number={founderNumber} size="sm" />
        </li>
      ) : null}

      {vaccineDate ? (
        <li>
          <Badge icon={<SyringeIcon />} tone="success">
            Vacina em {isoToBr(vaccineDate)}
          </Badge>
        </li>
      ) : null}

      {geneticTestCount > 0 ? (
        <li>
          <Badge icon={<FlaskIcon />} tone="data">
            {geneticTestCount} {geneticTestCount === 1 ? "exame genético" : "exames genéticos"}
          </Badge>
        </li>
      ) : null}

      {knownAncestors > 0 ? (
        <li>
          <Badge icon={<TreeIcon />} tone="data">
            Pedigree · {knownAncestors} {knownAncestors === 1 ? "ancestral" : "ancestrais"}
          </Badge>
        </li>
      ) : null}
    </ul>
  );
}
