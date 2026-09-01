import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { AdminLitterForm } from "@/modules/admin/components/admin-litter-form";
import { getAdminKennelById, getProfileById, ownerName } from "@/modules/admin/queries";
import { KENNEL_STATUS_LABEL, kennelStatus } from "@/modules/admin/status";
import { requireAdmin } from "@/modules/auth/queries";

export const metadata: Metadata = { title: "Cadastrar ninhada — Admin" };

/**
 * Cadastro de ninhada EM NOME DO DONO do canil.
 *
 * `requireAdmin()` mesmo com o layout de `/admin` já sendo o portão: nenhuma
 * tela deste projeto confia num portão só, e aqui a sessão também é o dado —
 * o id do admin vai para o `ParentPicker`.
 *
 * `getAdminKennelById`, e não `getManageableKennelById`: aquela é dono-only e
 * devolveria `null` para todo canil que não fosse do próprio admin, que é
 * exatamente o caso de uso desta tela.
 */
export default async function AdminNovaNinhadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin();

  const kennel = await getAdminKennelById(id);
  if (!kennel) notFound();

  // Canil excluído não tem onde receber cadastro — a própria RPC recusa com
  // `no_data_found`. Oferecer a tela seria oferecer um erro.
  const status = kennelStatus(kennel);
  if (status === "deleted") notFound();

  const owner = await getProfileById(kennel.owner_id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href={`/admin/canis/${kennel.id}`} label={kennel.name} />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cadastrar ninhada</h1>
      </div>

      <AdminLitterForm
        kennelId={kennel.id}
        kennelName={kennel.name}
        kennelStatusLabel={KENNEL_STATUS_LABEL[status]}
        ownerName={ownerName(kennel.owner) ?? "o dono deste canil"}
        ownerSuspended={Boolean(owner?.suspended_at)}
        adminId={admin.id}
      />
    </div>
  );
}
