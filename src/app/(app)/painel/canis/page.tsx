import type { Metadata } from "next";
import Link from "next/link";

import { getAuthUser } from "@/modules/auth/queries";
import { calculateCompleteness } from "@/modules/kennels/completeness";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";
import { listMyKennels } from "@/modules/kennels/queries";

export const metadata: Metadata = { title: "Canis" };

export default async function CanisPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const user = await getAuthUser();
  if (!user) return null;

  // Paginada desde já: sem limite, o painel de um criador com centenas de
  // canis viraria uma consulta sem teto.
  const { items, nextCursor } = await listMyKennels(user.id, { cursor });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Canis</span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Seus canis</h1>
        </div>
        <Link
          href="/painel/canis/novo"
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          Novo canil
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="border-border bg-surface rounded-card flex flex-col items-start gap-3 border p-6">
          <p className="text-fg text-sm font-medium">Você ainda não cadastrou nenhum canil.</p>
          <p className="text-fg-muted text-sm">
            O canil é o que dá endereço público aos seus cães.
          </p>
          <Link
            href="/painel/canis/novo"
            className="text-link hover:text-link-hover text-sm underline underline-offset-4 transition-colors"
          >
            Cadastrar o primeiro
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((kennel) => {
            const { percent } = calculateCompleteness(kennel);
            return (
              <li key={kennel.id}>
                <Link
                  href={`/painel/canis/${kennel.id}`}
                  className="border-border bg-surface hover:bg-surface-hover rounded-card flex flex-col gap-2 border p-5 transition-colors sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-fg font-medium">{kennel.name}</span>
                    <span className="text-fg-faint font-mono text-xs">/c/{kennel.slug}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <FounderBadge number={kennel.founder_number} size="sm" />
                    {kennel.published_at ? (
                      <span className="text-fg-faint text-xs">Publicado</span>
                    ) : (
                      <span className="text-fg-faint text-xs">Rascunho</span>
                    )}
                    <span className="text-fg-muted font-mono text-sm tabular-nums">{percent}%</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <Link
          href={`/painel/canis?cursor=${encodeURIComponent(nextCursor)}`}
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          Carregar mais
        </Link>
      ) : null}
    </div>
  );
}
