import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusChip } from "@/modules/admin/components/status-chip";
import { SuspendUserDialog } from "@/modules/admin/components/suspend-user-dialog";
import { formatDateTime } from "@/modules/admin/format";
import {
  countDogsByOwner,
  countKennelsByOwner,
  getProfileById,
  getProfileEmail,
} from "@/modules/admin/queries";
import { getAuthUser } from "@/modules/auth/queries";

export const metadata: Metadata = { title: "Usuário — Admin" };

/**
 * `getAuthUser()`, não `requireAdmin()` de novo: o layout de `/admin` já é o
 * portão. A página só precisa saber QUEM é o admin atual, para decidir se
 * mostra o botão de suspender (nunca na própria linha) — mesmo padrão que
 * `/painel/caes/[id]/page.tsx` já usa.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [me, profile] = await Promise.all([getAuthUser(), getProfileById(id)]);
  if (!profile) notFound();

  const [email, kennelCount, dogCount] = await Promise.all([
    getProfileEmail(id),
    countKennelsByOwner(id),
    countDogsByOwner(id),
  ]);

  const isSelf = me?.id === profile.id;

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/admin/usuarios"
        className="text-fg-muted hover:text-fg self-start text-sm transition-colors"
      >
        ← Usuários
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
            Usuário
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {profile.full_name ?? "—"}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {profile.role === "admin" ? (
              <span className="text-accent-text font-mono text-[0.65rem] tracking-wider uppercase">
                Admin
              </span>
            ) : null}
            {profile.deleted_at ? <StatusChip tone="danger">Excluído</StatusChip> : null}
            {!profile.deleted_at && profile.suspended_at ? (
              <StatusChip tone="danger">Suspenso</StatusChip>
            ) : null}
          </div>
        </div>

        {isSelf ? (
          <p className="text-fg-faint text-sm">Você não pode suspender a própria conta.</p>
        ) : (
          <SuspendUserDialog
            profileId={profile.id}
            name={profile.full_name ?? "este usuário"}
            isSuspended={Boolean(profile.suspended_at)}
            targetIsAdmin={profile.role === "admin"}
          />
        )}
      </div>

      <dl className="border-border bg-surface rounded-card divide-border divide-y border">
        <Row label="E-mail" value={email ?? "—"} mono />
        <Row
          label="Cidade/Estado"
          value={[profile.city, profile.state].filter(Boolean).join("/") || "—"}
        />
        <Row label="Cadastrado em" value={formatDateTime(profile.created_at)} mono />
      </dl>

      {/*
        Sem link para Canis/Cães filtrado: aquelas listas buscam por NOME do
        registro (`ilike` em `kennels.name`/`dogs.name`), não por dono — um
        link com `?q=<nome da pessoa>` pareceria "ver os canis dela" e na
        verdade buscaria canil cujo NOME batesse com o nome da pessoa, coisa
        diferente. Só a contagem, honesta.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border-border bg-surface rounded-card flex flex-col gap-1 border p-5">
          <span className="text-fg-muted text-sm">Canis</span>
          <span className="font-mono text-3xl font-semibold tracking-tight">{kennelCount}</span>
        </div>
        <div className="border-border bg-surface rounded-card flex flex-col gap-1 border p-5">
          <span className="text-fg-muted text-sm">Cães</span>
          <span className="font-mono text-3xl font-semibold tracking-tight">{dogCount}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className={`text-fg text-sm break-all ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
