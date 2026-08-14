import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { getAuthUser } from "@/modules/auth/queries";
import { getManageableKennelById } from "@/modules/kennels/queries";
import { registerLitterPhoto, softDeleteLitter } from "@/modules/litters/actions";
import { LitterForm } from "@/modules/litters/components/litter-form";
import { LitterPhotoGrid } from "@/modules/litters/components/litter-photo-grid";
import { MAX_LITTER_PHOTOS } from "@/modules/litters/constraints";
import { getManageableLitterById } from "@/modules/litters/queries";
import { GalleryUploader } from "@/modules/media/components/gallery-uploader";
import { PublishToggle } from "@/modules/media/components/publish-toggle";
import { getLitterGallery } from "@/modules/media/queries";

export const metadata: Metadata = { title: "Editar ninhada" };

export default async function EditarNinhadaPage({
  params,
}: {
  params: Promise<{ id: string; litterId: string }>;
}) {
  const { id, litterId } = await params;
  const user = await getAuthUser();
  if (!user) notFound();

  const [kennel, litter] = await Promise.all([
    getManageableKennelById(id, user.id),
    getManageableLitterById(litterId, user.id),
  ]);
  // `litter.kennel_id !== id`: a URL pode ter os dois ids de canis
  // diferentes — sem esta checagem, o dono do canil A conseguiria abrir
  // (embora não editar, a RLS ainda barraria) a ninhada de outro canil que
  // ele também possui só trocando o segmento.
  if (!kennel || !litter || litter.kennel_id !== id) notFound();

  const photos = await getLitterGallery(litterId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href={`/painel/canis/${id}`} label={kennel.name} />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Ninhada</h1>
      </div>

      <PublishToggle
        kind="litter"
        id={litter.id}
        publicPath={`/c/${kennel.slug}`}
        isPublished={Boolean(litter.published_at)}
        kennelPublished={Boolean(kennel.published_at)}
      />

      <LitterForm kennelId={id} litter={litter} />

      <section className="border-border flex flex-col gap-4 border-t pt-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold">Fotos</h2>
          <p className="text-fg-muted text-sm">
            Até {MAX_LITTER_PHOTOS} fotos. Cada uma é reduzida no seu aparelho antes de subir.
          </p>
        </div>

        <LitterPhotoGrid items={photos} />

        <GalleryUploader
          entityId={litter.id}
          ownerId={user.id}
          role="litter_gallery"
          maxItems={MAX_LITTER_PHOTOS}
          remaining={MAX_LITTER_PHOTOS - photos.length}
          registerAction={registerLitterPhoto}
        />
      </section>

      <section className="border-border flex flex-col gap-3 border-t pt-6">
        <h2 className="text-fg text-sm font-medium">Excluir ninhada</h2>
        <p className="text-fg-muted text-sm">
          A ninhada sai do painel e do perfil público. A exclusão é lógica — o registro permanece
          no banco.
        </p>
        <form action={softDeleteLitter}>
          <input type="hidden" name="id" value={litter.id} />
          <input type="hidden" name="kennel_id" value={id} />
          <button
            type="submit"
            className="border-danger text-danger hover:bg-danger-subtle rounded-control self-start border px-4 py-2 text-sm font-medium transition-colors"
          >
            Excluir ninhada
          </button>
        </form>
      </section>
    </div>
  );
}
