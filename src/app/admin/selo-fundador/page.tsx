import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/modules/admin/components/empty-state";
import { countFounderKennels, listKennels, ownerName } from "@/modules/admin/queries";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";

export const metadata: Metadata = { title: "Selo Fundador — Admin" };

/**
 * `listKennels({ onlyFounders: true })` — mesma consulta de Canis, filtrada.
 * Ordenação continua `created_at desc`, como todo o resto do app, NÃO por
 * `founder_number`: isso pediria um formato de cursor novo (`pagination.ts`
 * só sabe `{createdAt, id}`), e o ganho não paga a complexidade nesta rodada.
 *
 * Contagem sem denominador: a emissão não tem mais teto
 * (`20260806234150_founder_number_sem_teto.sql`) — "de 100" pararia de ser
 * verdade no primeiro canil além do centésimo.
 */
export default async function AdminFounderPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const [{ items, nextCursor }, total] = await Promise.all([
    listKennels({ onlyFounders: true }, { cursor }),
    countFounderKennels(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/admin" label="Visão geral" />

      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Admin</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Selo Fundador</h1>
        <p className="text-fg-muted text-sm">
          Canis com número atribuído, do mais recente para o mais antigo.
        </p>
      </div>

      <div className="border-border bg-surface rounded-card flex flex-col gap-1 border p-5 sm:max-w-xs">
        <span className="text-fg-muted text-sm">Selos emitidos</span>
        <span className="font-mono text-3xl font-semibold tracking-tight">{total}</span>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nenhum canil com selo ainda." />
      ) : (
        <div className="border-border bg-surface rounded-card divide-border divide-y border">
          {items.map((row) => (
            <Link
              key={row.id}
              href={`/admin/canis/${row.id}`}
              className="hover:bg-surface-hover flex flex-col gap-2 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-fg font-medium">{row.name}</span>
                <span className="text-fg-faint font-mono text-xs">
                  /{row.slug} · {ownerName(row.owner) ?? "—"}
                </span>
              </div>
              <FounderBadge number={row.founder_number} size="sm" />
            </Link>
          ))}
        </div>
      )}

      {nextCursor ? (
        <Link
          href={`/admin/selo-fundador?cursor=${nextCursor}`}
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          Carregar mais
        </Link>
      ) : null}
    </div>
  );
}
