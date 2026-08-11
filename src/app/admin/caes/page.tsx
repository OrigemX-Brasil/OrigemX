import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/modules/admin/components/empty-state";
import { StatusChip } from "@/modules/admin/components/status-chip";
import { kennelName, listDogs, ownerName } from "@/modules/admin/queries";
import { dogStatus, DOG_STATUS_LABEL, DOG_STATUS_TONE } from "@/modules/admin/status";

export const metadata: Metadata = { title: "Cães — Admin" };

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

export default async function AdminDogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const { q, cursor } = await searchParams;
  const { items, nextCursor } = await listDogs({ search: q ?? null }, { cursor });

  const queryFor = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const s = sp.toString();
    return s ? `/admin/caes?${s}` : "/admin/caes";
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Admin</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cães</h1>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "12rem" }}>
          <span className="text-fg-muted text-xs">Buscar por nome</span>
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nome do cão"
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
          <Link href="/admin/caes" className="text-fg-muted hover:text-fg py-2 text-sm transition-colors">
            Limpar
          </Link>
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          title={q ? "Nenhum cão encontrado com essa busca." : "Nenhum cão cadastrado ainda."}
        />
      ) : (
        <div className="border-border bg-surface rounded-card divide-border divide-y border">
          {items.map((row) => {
            const status = dogStatus(row);
            return (
              <Link
                key={row.id}
                href={`/admin/caes/${row.id}`}
                className="hover:bg-surface-hover flex flex-col gap-2 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-fg font-medium">{row.name}</span>
                  <span className="text-fg-faint font-mono text-xs">
                    {[SEX_LABEL[row.sex], row.breed, kennelName(row.kennel), ownerName(row.owner)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusChip tone={DOG_STATUS_TONE[status]}>{DOG_STATUS_LABEL[status]}</StatusChip>
                  <span className="text-fg-faint font-mono text-xs">{row.public_id}</span>
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
