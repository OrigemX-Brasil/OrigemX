import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/modules/admin/components/empty-state";
import { StatusChip } from "@/modules/admin/components/status-chip";
import { listKennels, ownerName } from "@/modules/admin/queries";
import { kennelStatus, KENNEL_STATUS_LABEL, KENNEL_STATUS_TONE } from "@/modules/admin/status";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";

export const metadata: Metadata = { title: "Canis — Admin" };

/**
 * Sem `.is("deleted_at", null)` na consulta — o admin precisa enxergar o
 * excluído também, e é o próprio ponto da tela. `kennelStatus` decide o que
 * mostrar em cada linha.
 */
export default async function AdminKennelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const { q, cursor } = await searchParams;
  const { items, nextCursor } = await listKennels({ search: q ?? null }, { cursor });

  const queryFor = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const s = sp.toString();
    return s ? `/admin/canis?${s}` : "/admin/canis";
  };

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/admin" label="Visão geral" />

      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Admin</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Canis</h1>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "12rem" }}>
          <span className="text-fg-muted text-xs">Buscar por nome</span>
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nome do canil"
            className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
          />
        </label>
        <button
          type="submit"
          className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm transition-colors"
        >
          Filtrar
        </button>
        {q ? (
          <Link href="/admin/canis" className="text-fg-muted hover:text-fg py-2 text-sm transition-colors">
            Limpar
          </Link>
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          title={q ? "Nenhum canil encontrado com essa busca." : "Nenhum canil cadastrado ainda."}
        />
      ) : (
        <div className="border-border bg-surface rounded-card divide-border divide-y border">
          {items.map((row) => {
            const status = kennelStatus(row);
            return (
              <Link
                key={row.id}
                href={`/admin/canis/${row.id}`}
                className="hover:bg-surface-hover flex flex-col gap-2 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-fg font-medium">{row.name}</span>
                  <span className="text-fg-faint font-mono text-xs">
                    /{row.slug} · {ownerName(row.owner) ?? "—"}
                    {row.city || row.state
                      ? ` · ${[row.city, row.state].filter(Boolean).join("/")}`
                      : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <FounderBadge number={row.founder_number} size="sm" />
                  <StatusChip tone={KENNEL_STATUS_TONE[status]}>
                    {KENNEL_STATUS_LABEL[status]}
                  </StatusChip>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {nextCursor ? (
        <Link
          href={queryFor({ cursor: nextCursor })}
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          Carregar mais
        </Link>
      ) : null}
    </div>
  );
}
