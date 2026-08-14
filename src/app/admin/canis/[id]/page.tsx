import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { FounderNumberDialog } from "@/modules/admin/components/founder-number-dialog";
import { HideEntityDialog } from "@/modules/admin/components/hide-entity-dialog";
import { StatusChip } from "@/modules/admin/components/status-chip";
import { formatDateTime } from "@/modules/admin/format";
import { getAdminKennelById, ownerName } from "@/modules/admin/queries";
import { KENNEL_STATUS_LABEL, KENNEL_STATUS_TONE, kennelStatus } from "@/modules/admin/status";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";

export const metadata: Metadata = { title: "Canil — Admin" };

/**
 * Visão do admin — leitura só, sem formulário de edição e sem botão de
 * publicar/despublicar (isso continua sendo do dono, em `/painel/canis`).
 * A única ação daqui é ocultar/reativar, e ela passa por `admin_set_kennel_hidden`
 * → `private.audit()`, nunca pelo caminho de escrita do dono — o rastro não
 * tem como confundir "admin agiu" com "dono editou o próprio".
 */
export default async function AdminKennelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const kennel = await getAdminKennelById(id);
  if (!kennel) notFound();

  const status = kennelStatus(kennel);
  const canToggleHidden = status !== "deleted";

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/admin/canis" label="Canis" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
            Canil · visão do admin
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{kennel.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <FounderBadge number={kennel.founder_number} size="sm" />
            <StatusChip tone={KENNEL_STATUS_TONE[status]}>{KENNEL_STATUS_LABEL[status]}</StatusChip>
          </div>
        </div>

        {canToggleHidden ? (
          <div className="flex flex-wrap items-center gap-3">
            {kennel.founder_number != null ? (
              <FounderNumberDialog
                kennelId={kennel.id}
                name={kennel.name}
                currentNumber={kennel.founder_number}
              />
            ) : null}
            <HideEntityDialog
              entityType="kennel"
              entityId={kennel.id}
              name={kennel.name}
              isHidden={Boolean(kennel.hidden_at)}
            />
          </div>
        ) : (
          <p className="text-fg-faint text-sm">Registro excluído — nada para ocultar.</p>
        )}
      </div>

      <dl className="border-border bg-surface rounded-card divide-border divide-y border">
        <Row label="URL" value={`/c/${kennel.slug}`} mono />
        <Row
          label="Cidade/Estado"
          value={[kennel.city, kennel.state].filter(Boolean).join("/") || "—"}
        />
        <Row label="Descrição" value={kennel.description ?? "—"} />
        <Row label="Site" value={kennel.website_url ?? "—"} mono />
        <Row label="Instagram" value={kennel.instagram_handle ?? "—"} mono />
        <Row label="Registro" value={kennel.registration_number ?? "—"} mono />
        <Row
          label="Dono"
          value={ownerName(kennel.owner) ?? "—"}
          href={`/admin/usuarios/${kennel.owner_id}`}
        />
        <Row label="Cadastrado em" value={formatDateTime(kennel.created_at)} mono />
      </dl>

      {status === "published" ? (
        <Link
          href={`/c/${kennel.slug}`}
          target="_blank"
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          Ver perfil público ↗
        </Link>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  href,
  mono = false,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className={`text-fg text-sm break-all ${mono ? "font-mono" : ""}`}>
        {href ? (
          <Link href={href} className="text-link hover:text-link-hover underline underline-offset-4">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
