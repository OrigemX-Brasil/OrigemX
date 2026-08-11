import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HideEntityDialog } from "@/modules/admin/components/hide-entity-dialog";
import { StatusChip } from "@/modules/admin/components/status-chip";
import { formatDateTime } from "@/modules/admin/format";
import { getAdminDogById, kennelName, ownerName } from "@/modules/admin/queries";
import { DOG_STATUS_LABEL, DOG_STATUS_TONE, dogStatus } from "@/modules/admin/status";

export const metadata: Metadata = { title: "Cão — Admin" };

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

/**
 * Visão do admin — mesma decisão de `/admin/canis/[id]`: leitura só, ação
 * única é ocultar/reativar via `admin_set_dog_hidden`.
 */
export default async function AdminDogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const dog = await getAdminDogById(id);
  if (!dog) notFound();

  const status = dogStatus(dog);
  const canToggleHidden = status !== "deleted";

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/admin/caes"
        className="text-fg-muted hover:text-fg self-start text-sm transition-colors"
      >
        ← Cães
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
            Cão · visão do admin
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{dog.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={DOG_STATUS_TONE[status]}>{DOG_STATUS_LABEL[status]}</StatusChip>
            <span className="text-fg-faint font-mono text-xs">{dog.public_id}</span>
          </div>
        </div>

        {canToggleHidden ? (
          <HideEntityDialog
            entityType="dog"
            entityId={dog.id}
            name={dog.name}
            isHidden={Boolean(dog.hidden_at)}
          />
        ) : (
          <p className="text-fg-faint text-sm">Registro excluído — nada para ocultar.</p>
        )}
      </div>

      <dl className="border-border bg-surface rounded-card divide-border divide-y border">
        <Row label="Sexo" value={SEX_LABEL[dog.sex] ?? dog.sex} />
        <Row label="Nascimento" value={dog.born_on ?? "—"} mono />
        <Row label="Raça" value={dog.breed ?? "—"} />
        <Row label="Cor" value={dog.color ?? "—"} />
        <Row label="Pelagem" value={dog.coat ?? "—"} />
        <Row
          label="Canil"
          value={kennelName(dog.kennel) ?? "—"}
          href={dog.kennel_id ? `/admin/canis/${dog.kennel_id}` : undefined}
        />
        <Row
          label="Dono"
          value={ownerName(dog.owner) ?? "—"}
          href={dog.owner_id ? `/admin/usuarios/${dog.owner_id}` : undefined}
        />
        <Row label="Pai" value={dog.sire_id ?? "—"} href={dog.sire_id ? `/admin/caes/${dog.sire_id}` : undefined} mono />
        <Row label="Mãe" value={dog.dam_id ?? "—"} href={dog.dam_id ? `/admin/caes/${dog.dam_id}` : undefined} mono />
        <Row label="Cadastrado em" value={formatDateTime(dog.created_at)} mono />
      </dl>

      {status === "published" ? (
        <Link
          href={`/d/${dog.public_id}`}
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
