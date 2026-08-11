import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/modules/admin/components/empty-state";
import { StatusChip } from "@/modules/admin/components/status-chip";
import { formatDateTime } from "@/modules/admin/format";
import { listProfiles } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Usuários — Admin" };

/**
 * Sem e-mail nesta listagem: `profiles` não tem a coluna — o e-mail mora em
 * `auth.users`, que o PostgREST não expõe. Decisão registrada no plano desta
 * seção; buscar por nome continua funcionando.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const { q, cursor } = await searchParams;
  const { items, nextCursor } = await listProfiles({ search: q ?? null }, { cursor });

  const queryFor = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const s = sp.toString();
    return s ? `/admin/usuarios?${s}` : "/admin/usuarios";
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Admin</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Usuários</h1>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "12rem" }}>
          <span className="text-fg-muted text-xs">Buscar por nome</span>
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nome do usuário"
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
          <Link href="/admin/usuarios" className="text-fg-muted hover:text-fg py-2 text-sm transition-colors">
            Limpar
          </Link>
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          title={q ? "Nenhum usuário encontrado com essa busca." : "Nenhum usuário cadastrado ainda."}
        />
      ) : (
        <div className="border-border bg-surface rounded-card divide-border divide-y border">
          {items.map((row) => (
            <Link
              key={row.id}
              href={`/admin/usuarios/${row.id}`}
              className="hover:bg-surface-hover flex flex-col gap-2 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-fg font-medium">{row.full_name ?? "—"}</span>
                <span className="text-fg-faint font-mono text-xs">
                  {[row.city, row.state].filter(Boolean).join("/") || "—"} · desde{" "}
                  {formatDateTime(row.created_at)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {row.role === "admin" ? (
                  <span className="text-accent-text font-mono text-[0.65rem] tracking-wider uppercase">
                    Admin
                  </span>
                ) : null}
                {row.deleted_at ? <StatusChip tone="danger">Excluído</StatusChip> : null}
                {!row.deleted_at && row.suspended_at ? (
                  <StatusChip tone="danger">Suspenso</StatusChip>
                ) : null}
              </div>
            </Link>
          ))}
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
