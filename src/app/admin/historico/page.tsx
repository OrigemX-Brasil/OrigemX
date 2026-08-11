import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/modules/admin/components/empty-state";
import { ACTION_LABEL, actionLabel, detailsSummary, entityHref, entityLabel, formatDateTime } from "@/modules/admin/format";
import { actorName, listAuditLog } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Histórico — Admin" };

/**
 * `audit_log` inteiro, mais recente primeiro — mesma ordenação do índice
 * `audit_log_recent_idx`. Filtro por ação (lista fechada, mesma de
 * `ACTION_LABEL`) e por período (dois `<input type="date">`, fronteira do
 * dia em America/Sao_Paulo — ver `startOfDaySaoPaulo`/`endOfDaySaoPaulo`).
 * Busca por ator/entidade fica de fora desta rodada: não foi pedido.
 */
export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; de?: string; ate?: string; cursor?: string }>;
}) {
  const { action, de, ate, cursor } = await searchParams;
  const { items, nextCursor } = await listAuditLog(
    { action: action ?? null, dateFrom: de ?? null, dateTo: ate ?? null },
    { cursor },
  );

  const hasFilter = Boolean(action || de || ate);

  const queryFor = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (action) sp.set("action", action);
    if (de) sp.set("de", de);
    if (ate) sp.set("ate", ate);
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const s = sp.toString();
    return s ? `/admin/historico?${s}` : "/admin/historico";
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Admin</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Histórico</h1>
        <p className="text-fg-muted text-sm">
          Toda ação administrativa, com quem fez, quando e em qual registro.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-fg-muted text-xs">Ação</span>
          <select
            name="action"
            defaultValue={action ?? ""}
            className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
          >
            <option value="">Todas</option>
            {Object.entries(ACTION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-fg-muted text-xs">De</span>
          <input
            type="date"
            name="de"
            defaultValue={de ?? ""}
            className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-fg-muted text-xs">Até</span>
          <input
            type="date"
            name="ate"
            defaultValue={ate ?? ""}
            className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
          />
        </label>
        <button
          type="submit"
          className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm transition-colors"
        >
          Filtrar
        </button>
        {hasFilter ? (
          <Link
            href="/admin/historico"
            className="text-fg-muted hover:text-fg py-2 text-sm transition-colors"
          >
            Limpar
          </Link>
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          title={
            hasFilter
              ? "Nenhuma ação administrativa encontrada com esses filtros."
              : "Nenhuma ação administrativa ainda."
          }
        />
      ) : (
        <div className="border-border bg-surface rounded-card divide-border divide-y border">
          {items.map((row) => {
            const summary = detailsSummary(row.details);
            const href = entityHref(row.entity_type, row.entity_id);
            return (
              <div key={row.id} className="flex flex-col gap-1 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-fg font-medium">{actionLabel(row.action)}</span>
                  <span className="text-fg-faint font-mono text-xs">
                    {formatDateTime(row.created_at)}
                  </span>
                </div>
                <span className="text-fg-muted text-sm">{row.reason}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-fg-faint font-mono text-xs">
                    {actorName(row.actor) ?? "—"}
                    {summary ? ` · ${summary}` : ""}
                  </span>
                  {href ? (
                    <Link
                      href={href}
                      className="text-link hover:text-link-hover font-mono text-xs underline underline-offset-4 transition-colors"
                    >
                      Ver {entityLabel(row.entity_type).toLowerCase()} →
                    </Link>
                  ) : null}
                </div>
              </div>
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
