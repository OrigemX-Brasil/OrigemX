import Link from "next/link";

import type { ResolvedMedia } from "@/modules/media/queries";
import type { PublicDog } from "@/modules/public/queries";

import { PublicImage } from "./public-image";

/**
 * ============================================================================
 * Os progenitores — duas apresentações do mesmo dado.
 * ============================================================================
 *
 * `ParentCard` (retângulo 4:3) é o da página da NINHADA, onde o par é a
 * abertura e as duas fotos dividem a largura em pé de igualdade.
 *
 * `ParentPortrait` (círculo com anel colorido) é o da página do FILHOTE no
 * desktop, seguindo `assets/fotos/filhote-mockup.jpg`: ali o par é um
 * antecedente do filhote, não o assunto, e o retrato circular resolve o
 * enquadramento sem competir com a foto grande do herói logo acima.
 *
 * As duas leem `PublicDog & { cover }`, que é o que `getPublicLitterParents`
 * devolve — a mesma função serve as duas páginas porque recebe dois ids
 * quaisquer, não "os progenitores de uma ninhada".
 */

export type PublicParent = PublicDog & { cover: ResolvedMedia | null };

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

export function ParentCard({
  parent,
  fallback,
}: {
  parent: PublicParent | null;
  fallback: string;
}) {
  // `row-span-2` também na ausência: as duas colunas precisam ocupar as mesmas
  // duas linhas, senão a auto-alocação do grid empurra o X para fora do lugar
  // quando só um dos progenitores é conhecido.
  if (!parent) {
    return (
      <div className="text-fg-faint row-span-2 flex items-center justify-center text-center text-sm">
        {fallback}
      </div>
    );
  }

  return (
    <Link
      href={`/d/${parent.public_id}`}
      // `grid-rows-subgrid`: as duas linhas deste card SÃO as duas do grid dos
      // progenitores, então as fotos alinham entre si e os nomes também —
      // mesmo com um nome de uma linha e outro de duas. Exatamente DOIS
      // filhos, um por linha; o nome e o chip de sexo vão juntos no segundo.
      className="focus-visible:outline-ring row-span-2 grid grid-rows-subgrid gap-2 text-center focus-visible:outline-2"
    >
      <div className="bg-surface-hover rounded-card aspect-[4/3] w-full overflow-hidden">
        <PublicImage
          src={parent.cover?.url ?? null}
          alt=""
          fallbackText={parent.name}
          width={parent.cover?.width ?? 4}
          height={parent.cover?.height ?? 3}
          className="size-full object-cover"
        />
      </div>

      {/* `justify-between` com o bloco esticado na linha 2: o chip de sexo
          encosta no fim da linha nos DOIS cards, então eles alinham entre si
          mesmo quando um nome ocupa três linhas e o outro uma — que é o caso
          real de "Ring Legend's Athena da Casa Grande" ao lado de "Power
          Chronos" num celular de 360px. */}
      <div className="flex flex-col items-center justify-between gap-2">
        <span className="text-fg text-sm font-semibold">{parent.name}</span>
        <span className="border-border-strong bg-surface-raised text-fg-muted rounded-control border px-2 py-0.5 text-xs font-medium">
          {SEX_LABEL[parent.sex]}
        </span>
      </div>
    </Link>
  );
}

/** Troféu — os títulos do progenitor, quando há. */
function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 14v6" />
    </svg>
  );
}

/**
 * O retrato circular do desktop do filhote.
 *
 * O ANEL É COLORIDO POR SEXO — azul (`--color-accent`) para macho, violeta
 * (`--color-secondary`) para fêmea. Os dois já são tokens do projeto; nenhuma
 * cor nova entrou por causa desta seção.
 *
 * A cor NÃO é o único portador da informação: o sexo está escrito logo abaixo,
 * ao lado da raça. O anel é reforço visual, não o dado — sem isso a seção
 * falharia em 1.4.1 para quem não distingue as duas matizes.
 */
export function ParentPortrait({
  parent,
  fallback,
}: {
  parent: PublicParent | null;
  fallback: string;
}) {
  if (!parent) {
    return (
      <div className="text-fg-faint flex min-h-32 items-center justify-center text-center text-sm">
        {fallback}
      </div>
    );
  }

  const anel = parent.sex === "female" ? "ring-secondary" : "ring-accent";

  return (
    <div className="flex items-center gap-5">
      <div
        className={`bg-surface-hover size-32 shrink-0 overflow-hidden rounded-full ring-2 ring-offset-4 ring-offset-[var(--color-surface)] ${anel}`}
      >
        <PublicImage
          src={parent.cover?.url ?? null}
          alt=""
          fallbackText={parent.name}
          width={1}
          height={1}
          className="size-full object-cover"
        />
      </div>

      <div className="flex min-w-0 flex-col items-start gap-2">
        <span className="font-display text-fg text-lg font-semibold tracking-tight uppercase">
          {parent.name}
        </span>
        <span className="text-fg-muted text-sm">
          {[SEX_LABEL[parent.sex], parent.breed].filter(Boolean).join(" · ")}
        </span>

        {/* Títulos são texto livre digitado pelo criador (`dogs.titles`). Sem
            nenhum, o chip não existe — nunca um contorno vazio.

            NÃO É DOURADO, embora o mockup mostre assim: `--color-selo` é
            reservado ao selo de fundador, e o bloco de tokens diz por quê — se
            a cor de conquista aparecer em UI comum, o selo deixa de significar
            algo. O troféu é quem carrega o sentido aqui. */}
        {parent.titles?.length ? (
          <span className="text-fg-muted inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <TrophyIcon />
            {parent.titles.join(" · ")}
          </span>
        ) : null}

        <Link
          href={`/d/${parent.public_id}`}
          prefetch={false}
          className="border-border-strong text-fg-muted hover:text-fg hover:border-fg-faint rounded-control focus-visible:outline-ring mt-1 border px-3 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors focus-visible:outline-2"
        >
          Ver perfil completo
        </Link>
      </div>
    </div>
  );
}
