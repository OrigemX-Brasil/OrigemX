import type { Metadata } from "next";

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

      <p className="text-fg-faint text-sm">Canis e cães entram nas próximas etapas.</p>
    </div>
  );
}
