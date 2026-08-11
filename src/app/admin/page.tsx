import type { Metadata } from "next";
import Link from "next/link";

import {
  actorName,
  countDogs,
  countFounderKennels,
  countKennels,
  countProfiles,
  countPublishedKennels,
  getLandingRollup,
  listProfiles,
  recentAuditLog,
} from "@/modules/admin/queries";
import { actionLabel, formatDateTime } from "@/modules/admin/format";
import { formatRate } from "@/modules/capture/events";

export const metadata: Metadata = { title: "Admin" };

const RECENT_AUDIT_LIMIT = 5;
const RECENT_SIGNUPS_LIMIT = 5;
const LANDING_WINDOW_DAYS = 7;

/**
 * Visão geral — os números que importam de relance: totais, canis por
 * status, selos de Fundador emitidos, e cadastros recentes. Nove consultas
 * (a maioria `count:'exact', head:true`, barata) em paralelo com
 * `Promise.all`. Aceitável aqui: é superfície só-de-admin, fora do caminho
 * crítico público que justifica cautela de round-trip em outro lugar do
 * projeto (ex.: a página de captura).
 *
 * "Rascunho" não tem consulta própria: é `canis − publicados`, aritmética
 * sobre dois números que já vieram do banco — não é trazer linha nenhuma
 * para contar no client.
 *
 * Selo Fundador aparece SEM "/100": o teto foi removido do banco pela
 * migration `founder_number_sem_teto` (2026-08-06), a pedido do produto —
 * mostrar um denominador que não existe mais seria informação falsa.
 */
export default async function AdminOverviewPage() {
  const [
    profiles,
    kennels,
    publishedKennels,
    founderKennels,
    dogs,
    recentSignups,
    recentActions,
    landing,
  ] = await Promise.all([
    countProfiles(),
    countKennels(),
    countPublishedKennels(),
    countFounderKennels(),
    countDogs(),
    listProfiles({}, { limit: RECENT_SIGNUPS_LIMIT }),
    recentAuditLog(RECENT_AUDIT_LIMIT),
    getLandingRollup(LANDING_WINDOW_DAYS),
  ]);

  const draftKennels = kennels - publishedKennels;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Admin</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Visão geral</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <CountCard label="Usuários" value={profiles} href="/admin/usuarios" />
        <CountCard label="Canis" value={kennels} href="/admin/canis" />
        <CountCard label="Cães" value={dogs} href="/admin/caes" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/canis"
          className="border-border bg-surface hover:bg-surface-hover rounded-card flex flex-col gap-3 border p-5 transition-colors"
        >
          <span className="text-fg-muted text-sm">Canis por status</span>
          <div className="flex gap-6">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-2xl font-semibold tracking-tight">
                {publishedKennels}
              </span>
              <span className="text-fg-faint text-xs">Publicados</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-2xl font-semibold tracking-tight">
                {draftKennels}
              </span>
              <span className="text-fg-faint text-xs">Rascunho</span>
            </div>
          </div>
        </Link>

        <CountCard label="Selos Fundador emitidos" value={founderKennels} href="/admin/selo-fundador" />
      </div>

      <section className="border-border bg-surface rounded-card flex flex-col gap-3 border p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Cadastros recentes</h2>
          <Link
            href="/admin/usuarios"
            className="text-link hover:text-link-hover text-sm underline underline-offset-4 transition-colors"
          >
            Ver todos os usuários
          </Link>
        </div>

        {recentSignups.items.length === 0 ? (
          <p className="text-fg-faint text-sm">Nenhum usuário cadastrado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {recentSignups.items.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3">
                <span className="text-fg text-sm">{row.full_name ?? "—"}</span>
                <span className="text-fg-faint font-mono text-xs">
                  {formatDateTime(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border-border bg-surface rounded-card flex flex-col gap-3 border p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">Últimas ações</h2>
            <Link
              href="/admin/historico"
              className="text-link hover:text-link-hover text-sm underline underline-offset-4 transition-colors"
            >
              Ver histórico completo
            </Link>
          </div>

          {recentActions.length === 0 ? (
            <p className="text-fg-faint text-sm">Nenhuma ação administrativa ainda.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentActions.map((row) => (
                <li key={row.id} className="flex flex-col gap-0.5">
                  <span className="text-fg text-sm">{actionLabel(row.action)}</span>
                  <span className="text-fg-faint font-mono text-xs">
                    {actorName(row.actor) ?? "—"} · {formatDateTime(row.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-border bg-surface rounded-card flex flex-col gap-3 border p-5">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Captura, últimos {LANDING_WINDOW_DAYS} dias
          </h2>

          {landing.rollup.length === 0 ? (
            <p className="text-fg-faint text-sm">Nenhum acesso registrado no período.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-fg-faint flex items-center justify-between text-xs">
                <span>Origem</span>
                <span>Acessos · Cadastros · Conversão</span>
              </div>
              <ul className="divide-border divide-y">
                {landing.rollup.slice(0, 6).map((row) => (
                  <li key={row.source} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-fg text-sm">{row.source}</span>
                    <span className="text-fg-faint font-mono text-xs">
                      {row.views} · {row.signups} · {formatRate(row.rate)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-border text-fg-muted flex items-center justify-between border-t pt-2 text-xs">
                <span>Total</span>
                <span className="font-mono">
                  {landing.totals.views} · {landing.totals.signups} ·{" "}
                  {formatRate(landing.totals.rate)}
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CountCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="border-border bg-surface hover:bg-surface-hover rounded-card flex flex-col gap-1 border p-5 transition-colors"
    >
      <span className="text-fg-muted text-sm">{label}</span>
      <span className="font-mono text-3xl font-semibold tracking-tight">{value}</span>
    </Link>
  );
}
