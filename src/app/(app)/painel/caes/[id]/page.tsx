import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/modules/auth/queries";
import { softDeleteDog } from "@/modules/dogs/actions";
import { isGhostAncestor, type AncestorCandidate } from "@/modules/dogs/ancestors";
import { DogForm } from "@/modules/dogs/components/dog-form";
import { IdentifiersForm } from "@/modules/dogs/components/identifiers-form";
import { getDogIdentifiers, getDogsByIds, getManageableDogById } from "@/modules/dogs/queries";
import { getMyKennel } from "@/modules/kennels/queries";
import { GalleryUploader } from "@/modules/media/components/gallery-uploader";
import { MediaGallery } from "@/modules/media/components/media-gallery";
import { PublishToggle } from "@/modules/media/components/publish-toggle";
import { MAX_GALLERY_ITEMS } from "@/modules/media/constraints";
import { getDogGallery, getUsedBytes } from "@/modules/media/queries";
import { QrCard } from "@/modules/qr/components/qr-card";
import { VideoUploader } from "@/modules/video/components/video-uploader";
import { getDogVideo } from "@/modules/video/queries";
import { videoConfigurado } from "@/modules/video/stream";
import { reconcileDogVideo } from "@/modules/video/sync";

export const metadata: Metadata = { title: "Editar cão" };

export default async function EditarCaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getAuthUser();
  if (!user) notFound();

  // `getManageableDogById`, não `getDogById`: a policy de leitura devolve também
  // cão publicado de terceiro, e esta tela monta formulário de edição.
  const dog = await getManageableDogById(id, user.id);
  if (!dog) notFound();

  const supabase = await createClient();
  const [kennel, parents, gallery, usedBytes, identifiers, videoGravado] = await Promise.all([
    getMyKennel(user.id),
    getDogsByIds([dog.sire_id, dog.dam_id].filter((v): v is string => Boolean(v))),
    getDogGallery(dog.id),
    getUsedBytes(user.id),
    getDogIdentifiers(dog.id),
    getDogVideo(dog.id, supabase),
  ]);

  // Rede de segurança para quem fechou a aba no meio da transcodificação: o
  // polling do navegador morreu junto com a aba, então quem põe o status em dia
  // é a abertura da página. Vídeo já pronto (ou com erro) NÃO gera chamada
  // nenhuma ao Cloudflare — `reconcileDogVideo` sai antes.
  const video = videoGravado ? await reconcileDogVideo(supabase, videoGravado) : null;

  const toCandidate = (id: string | null): AncestorCandidate | null => {
    const found = parents.find((p) => p.id === id);
    if (!found) return null;
    return {
      id: found.id,
      name: found.name,
      sex: found.sex as "male" | "female",
      born_on: found.born_on,
      breed: found.breed,
      kennel_id: found.kennel_id,
      owner_id: found.owner_id,
    };
  };

  const ghost = isGhostAncestor(dog);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href="/painel/caes" label="Cães" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">{dog.name}</h1>
        <p className="text-fg-faint font-mono text-xs">/d/{dog.public_id}</p>
      </div>

      {/*
        DUAS COLUNAS NO DESKTOP, e a divisão não é arbitrária: à esquerda o que
        se EDITA (formulários, galeria, vídeo), à direita o que se CONSULTA (o
        QR para levar à gráfica) e a saída destrutiva. Alargar a coluna única
        seria pior que não mexer — campo de texto com 1100px de largura é ruim
        de usar.

        A DIVISÃO RESPEITA A ORDEM DO MOBILE, e foi ela que ditou o corte.
        Abaixo de `xl` os dois `<div>` são `flex flex-col gap-8` e renderizam em
        sequência, então a ordem visual continua sendo exatamente
        `ghost → publicar → dados → identificação → galeria → vídeo → QR →
        excluir`. Era o que impedia mover o "publicar" para a direita: ele é o
        segundo item no celular, e empurrá-lo para o fim da pilha mudaria a
        página aprovada. QR e excluir já eram os dois últimos, nessa ordem —
        por isso são exatamente eles que sobem para o trilho.
      */}
      <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-10">
        <div className="flex flex-col gap-8">
          {ghost ? (
            <div className="border-border-strong bg-surface-raised rounded-card border border-dashed p-4">
              <p className="text-fg text-sm font-medium">Este registro é um ancestral.</p>
              <p className="text-fg-muted mt-1 text-sm">
                Ele existe para compor pedigrees: não tem dono nem canil. Vincular um canil ou
                definir um dono transforma-o em cão gerenciável, e ele deixa de ficar visível como
                nó público de árvore.
              </p>
            </div>
          ) : null}

          <PublishToggle
            kind="dog"
            id={dog.id}
            publicPath={`/d/${dog.public_id}`}
            isPublished={Boolean(dog.published_at)}
          />

          <DogForm
            dog={dog}
            kennel={kennel && { id: kennel.id, name: kennel.name }}
            sire={toCandidate(dog.sire_id)}
            dam={toCandidate(dog.dam_id)}
            ownerId={user.id}
          />

          <IdentifiersForm dogId={dog.id} identifiers={identifiers} />

          <section className="border-border flex flex-col gap-4 border-t pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-base font-semibold">Galeria</h2>
              <p className="text-fg-muted text-sm">
                Até {MAX_GALLERY_ITEMS} imagens. Cada uma é reduzida no seu aparelho antes de subir.
              </p>
            </div>

            <MediaGallery items={gallery} usedBytes={usedBytes} emptyText="Nenhuma imagem ainda." />

            <GalleryUploader
              entityId={dog.id}
              ownerId={user.id}
              remaining={MAX_GALLERY_ITEMS - gallery.length}
            />
          </section>

          <section className="border-border flex flex-col gap-4 border-t pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-base font-semibold">Vídeo</h2>
              <p className="text-fg-muted text-sm">
                Um vídeo curto no perfil público — andamento, temperamento, o que a foto não conta.
                Ele carrega só quando o visitante der play.
              </p>
            </div>

            <VideoUploader
              dogId={dog.id}
              dogName={dog.name}
              video={video}
              habilitado={videoConfigurado()}
            />
          </section>
        </div>

        {/* `xl:sticky`: o QR acompanha a rolagem enquanto o criador percorre o
            formulário. É o que ele confere antes de mandar imprimir. */}
        <div className="flex flex-col gap-8 xl:sticky xl:top-8">
          <QrCard
            kind="dog"
            entityId={dog.id}
            stableId={dog.public_id}
            label="Aponta para o perfil público do cão. Codifica o identificador permanente, não o nome — o QR impresso continua valendo depois de qualquer edição do cadastro."
          />

          <section className="border-border flex flex-col gap-3 border-t pt-6">
            <h2 className="text-fg text-sm font-medium">Excluir cão</h2>
            <p className="text-fg-muted text-sm">
              O cão sai das listagens e do perfil público. O registro permanece, porque pedigrees de
              descendentes apontam para ele — apagá-lo de verdade quebraria a árvore de outros
              criadores.
            </p>
            <form action={softDeleteDog}>
              <input type="hidden" name="id" value={dog.id} />
              <button
                type="submit"
                className="border-danger text-danger hover:bg-danger-subtle rounded-control self-start border px-4 py-2 text-sm font-medium transition-colors"
              >
                Excluir cão
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
