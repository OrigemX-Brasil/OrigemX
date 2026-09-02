import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { AdminLogoUploader } from "@/modules/admin/components/admin-media-uploader";
import { getAdminKennelById, getProfileById, ownerName } from "@/modules/admin/queries";
import { kennelStatus } from "@/modules/admin/status";
import { getKennelLogo } from "@/modules/media/queries";

export const metadata: Metadata = { title: "Logo do canil — Admin" };

/**
 * Envio do logo EM NOME DO DONO.
 *
 * Tela separada, e não um bloco dentro de `/admin/canis/[id]`, por uma razão
 * concreta: o envio pode CONCEDER o Selo Criador Fundador, que é irreversível.
 * Uma ação dessas não deve dividir espaço com moderação e cadastro, onde alguém
 * chega procurando outra coisa e clica de passagem.
 */
export default async function AdminLogoDoCanilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const kennel = await getAdminKennelById(id);
  if (!kennel) notFound();

  // Canil excluído não recebe mídia: a RPC recusa com `no_data_found`.
  if (kennelStatus(kennel) === "deleted") notFound();

  const [owner, logo] = await Promise.all([getProfileById(kennel.owner_id), getKennelLogo(id)]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href={`/admin/canis/${kennel.id}`} label={kennel.name} />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Enviar logo</h1>
      </div>

      <AdminLogoUploader
        kennelId={kennel.id}
        kennelName={kennel.name}
        ownerId={kennel.owner_id}
        ownerName={ownerName(kennel.owner) ?? "o dono deste canil"}
        ownerSuspended={Boolean(owner?.suspended_at)}
        temLogo={Boolean(logo)}
        jaTemSelo={kennel.founder_number != null}
      />
    </div>
  );
}
