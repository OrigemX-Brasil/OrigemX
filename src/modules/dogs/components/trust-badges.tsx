import { isoToBr } from "@/modules/dogs/br-date";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";
import { formatFounderDigits } from "@/modules/kennels/founder";

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

/**
 * ============================================================================
 * A MESMA verdade, na forma de faixa — o desktop do mockup do filhote.
 * ============================================================================
 *
 * `assets/fotos/filhote-mockup.jpg` desenha quatro células grandes: ícone à
 * esquerda, rótulo em cima, estado embaixo. Esta função adota essa FORMA, e
 * só ela — os rótulos continuam sendo os de `TrustBadges`, pelas razões que o
 * cabeçalho deste arquivo já registra:
 *
 *   - o mockup escreve "Criador Verificado"; aqui é "Criador Fundador", com o
 *     número. A OrigemX não verifica criador nenhum, e um selo que diz o
 *     contrário é pior que selo nenhum;
 *   - o mockup escreve "Vacinas · Em dia" e "Exames · Em dia"; aqui é a DATA
 *     da última vacina e a CONTAGEM de laudos. "Em dia" é juízo clínico sobre
 *     um calendário vacinal que a plataforma não conhece.
 *
 * O dourado da célula de fundador é o uso RESERVADO do token — é literalmente
 * o selo, o mesmo que `FounderBadge` carrega. Nas outras três, não.
 *
 * `hidden lg:grid`: no mobile quem aparece é `TrustBadges`, em chips. Os dois
 * leem exatamente os mesmos props, então não há como um afirmar o que o outro
 * nega.
 */
function ShieldIcon() {
  return (
    <svg {...ICON_PROPS} width={28} height={28} aria-hidden="true">
      <path d="M12 3l7 3v5.5c0 4-2.9 7.6-7 8.5-4.1-.9-7-4.5-7-8.5V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function Cell({
  icon,
  label,
  state,
  gold = false,
}: {
  icon: React.ReactNode;
  label: string;
  state: string;
  gold?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 p-5">
      <span aria-hidden="true" className={`shrink-0 ${gold ? "text-selo" : "text-fg-faint"}`}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`text-base font-semibold ${gold ? "text-selo" : "text-fg"}`}>{label}</span>
        <span className="text-fg-muted text-sm">{state}</span>
      </span>
    </div>
  );
}

export function TrustStrip({
  founderNumber,
  vaccineDate,
  geneticTestCount,
  knownAncestors,
}: {
  founderNumber: number | null | undefined;
  vaccineDate: string | null;
  geneticTestCount: number;
  knownAncestors: number;
}) {
  const temAlgum =
    Boolean(founderNumber) || Boolean(vaccineDate) || geneticTestCount > 0 || knownAncestors > 0;

  // Mesma regra da fileira de chips: sem nenhum dado, a faixa inteira some.
  if (!temAlgum) return null;

  return (
    <section className="border-border bg-surface rounded-card divide-border hidden border lg:grid lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] lg:divide-x">
      {founderNumber ? (
        <Cell
          gold
          icon={<ShieldIcon />}
          label="Criador Fundador"
          state={`OrigemX · nº ${formatFounderDigits(founderNumber)}`}
        />
      ) : null}

      {vaccineDate ? (
        <Cell icon={<SyringeIcon />} label="Vacinas" state={`Última em ${isoToBr(vaccineDate)}`} />
      ) : null}

      {geneticTestCount > 0 ? (
        <Cell
          icon={<FlaskIcon />}
          label="Exames"
          state={`${geneticTestCount} ${geneticTestCount === 1 ? "laudo" : "laudos"}`}
        />
      ) : null}

      {knownAncestors > 0 ? (
        <Cell
          icon={<TreeIcon />}
          label="Pedigree"
          state={`${knownAncestors} ${knownAncestors === 1 ? "ancestral" : "ancestrais"}`}
        />
      ) : null}
    </section>
  );
}
