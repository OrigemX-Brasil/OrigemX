import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { AdminGalleryUploader } from "@/modules/admin/components/admin-media-uploader";
import { getAdminDogById, getProfileById, kennelName, ownerName } from "@/modules/admin/queries";
import { dogStatus } from "@/modules/admin/status";
import { countDogGallery } from "@/modules/media/queries";

export const metadata: Metadata = { title: "Fotos do cão — Admin" };

/**
 * Envio de fotos do cão EM NOME DO DONO.
 *
 * Diferente do logo, aqui NÃO há efeito colateral irreversível: foto de galeria
 * não entra em `kennel_is_founder_eligible`, então nenhum número de selo é
 * consumido por esta tela.
 */
export default async function AdminFotosDoCaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const dog = await getAdminDogById(id);
  if (!dog) notFound();

  const status = dogStatus(dog);
  if (status === "deleted") notFound();

  // Ancestral fantasma não tem dono (`owner_id` é NULLABLE, e é o que o define
  // junto com `kennel_id` nulo). Sem dono não há prefixo de Storage nem plano a
  // que cobrar o arquivo — a RPC recusa, então a tela nem se oferece.
  if (!dog.owner_id) notFound();

  const [owner, jaEnviadas] = await Promise.all([
    getProfileById(dog.owner_id),
    countDogGallery(id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href={`/admin/caes/${dog.id}`} label={dog.name} />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Enviar fotos</h1>
      </div>

      <AdminGalleryUploader
        dogId={dog.id}
        dogName={dog.name}
        kennelName={kennelName(dog.kennel) ?? undefined}
        ownerId={dog.owner_id}
        ownerName={ownerName(dog.owner) ?? "o dono deste cão"}
        ownerSuspended={Boolean(owner?.suspended_at)}
        jaEnviadas={jaEnviadas}
      />
    </div>
  );
}
