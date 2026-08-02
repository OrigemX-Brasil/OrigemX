import type { Metadata } from "next";
import Link from "next/link";

import { getAuthUser, getCurrentProfile } from "@/modules/auth/queries";

export const metadata: Metadata = { title: "Painel" };

export default async function PainelPage() {
  const [user, profile] = await Promise.all([getAuthUser(), getCurrentProfile()]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Painel</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {profile?.full_name ?? "Bem-vindo"}
        </h1>
      </div>

      {/* Identificação do usuário logado, lida no servidor. Mono nos valores
          porque são dado de registro, não texto corrido. */}
      <dl className="border-border bg-surface rounded-card divide-border divide-y border">
        <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-fg-muted text-sm">E-mail</dt>
          <dd className="text-fg font-mono text-sm break-all">{user?.email ?? "—"}</dd>
        </div>
        <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-fg-muted text-sm">Identificador</dt>
          <dd className="text-fg-faint font-mono text-xs break-all">{user?.id ?? "—"}</dd>
        </div>
        <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-fg-muted text-sm">Perfil</dt>
          <dd className="text-fg font-mono text-sm">{profile?.role ?? "—"}</dd>
        </div>
      </dl>

      <Link
        href="/painel/canis"
        className="border-border bg-surface hover:bg-surface-hover rounded-card flex items-center justify-between gap-4 border p-5 transition-colors"
      >
        <span className="flex flex-col gap-1">
          <span className="text-fg font-medium">Canis</span>
          <span className="text-fg-muted text-sm">Cadastre e edite seus canis.</span>
        </span>
        <span className="text-fg-faint" aria-hidden="true">
          →
        </span>
      </Link>

      <Link
        href="/painel/caes"
        className="border-border bg-surface hover:bg-surface-hover rounded-card flex items-center justify-between gap-4 border p-5 transition-colors"
      >
        <span className="flex flex-col gap-1">
          <span className="text-fg font-medium">Cães</span>
          <span className="text-fg-muted text-sm">Cadastre cães e defina pai e mãe.</span>
        </span>
        <span className="text-fg-faint" aria-hidden="true">
          →
        </span>
      </Link>
    </div>
  );
}
