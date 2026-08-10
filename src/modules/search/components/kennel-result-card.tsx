import Link from "next/link";

import { FounderBadge } from "@/modules/kennels/components/founder-badge";
import type { ResolvedMedia } from "@/modules/media/queries";
import { PublicImage } from "@/modules/public/components/public-image";
import type { PublicKennel } from "@/modules/public/queries";

/**
 * Card de canil na grade de `/busca`. Mesmo padrão de `ExampleProfileCard`.
 *
 * Profundidade e movimento aqui são CSS puro, e isso é o ponto: este é um
 * Server Component. Animá-lo com framer-motion o converteria em componente de
 * cliente E colocaria a biblioteca no carregamento inicial da `/busca` — o
 * oposto exato da decisão de carregá-la sob demanda.
 *
 * Sem `backdrop-blur` nestes cards: atrás deles só existe `--color-bg`
 * chapado. Não há o que desfocar — seria custo de GPU por zero pixel de
 * diferença. Vidro é para o painel, que de fato flutua sobre conteúdo.
 */
export function KennelResultCard({
  kennel,
  logo,
  dogCount,
}: {
  kennel: PublicKennel;
  logo: ResolvedMedia | undefined;
  dogCount: number;
}) {
  const local = [kennel.city, kennel.state].filter(Boolean).join(", ");

  return (
    <Link
      href={`/c/${kennel.slug}`}
      prefetch={false}
      className="border-border-glass bg-surface hover:bg-surface-hover shadow-card hover:shadow-card-hover inset-shadow-glass rounded-card focus-visible:outline-ring ease-panel flex flex-col gap-4 border p-5 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center gap-4">
        <PublicImage
          src={logo?.thumbUrl ?? logo?.url}
          alt={`Logo do ${kennel.name}`}
          fallbackText={kennel.name}
          width={96}
          height={96}
          sizes="64px"
          className="border-border rounded-card size-16 shrink-0 border object-cover"
        />
        <div className="flex min-w-0 flex-col gap-1">
          {/* Duas linhas em vez de `truncate`: numa grade de três colunas o
              corte comia metade de nomes comuns ("Canil New Creation" virava
              "Canil New ..."). Nome de canil é o dado principal do card — é o
              que a pessoa veio procurar. */}
          <h3 className="font-display line-clamp-2 text-base font-semibold tracking-tight">
            {kennel.name}
          </h3>
          {local ? <p className="text-fg-muted truncate text-sm">{local}</p> : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-fg-faint text-xs">
          {dogCount} {dogCount === 1 ? "cão cadastrado" : "cães cadastrados"}
        </span>
        <FounderBadge number={kennel.founder_number} size="sm" />
      </div>
    </Link>
  );
}
