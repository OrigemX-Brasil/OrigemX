import type { Metadata } from "next";

import { KennelProfile } from "@/modules/public/components/kennel-profile";
import { publicMetadata } from "@/modules/public/metadata";
import { getPublicKennelBySlug } from "@/modules/public/queries";

/**
 * Páginas seguintes da lista de cães do canil.
 *
 * ROTA e não `?cursor=`: query string tornaria a página dinâmica e tiraria do
 * cache de borda uma página que abre por QR impresso. Aqui cada página vira uma
 * entrada estática própria, com o mesmo ISR de 300s da primeira. O cursor é
 * base64url, então cabe num segmento de caminho sem escapar nada.
 */
export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; cursor: string }>;
}): Promise<Metadata> {
  const { slug, cursor } = await params;
  const kennel = await getPublicKennelBySlug(slug);
  if (!kennel) return { title: "Canil não encontrado" };

  return publicMetadata({
    title: `${kennel.name} — mais cães`,
    description: `Continuação da lista de cães publicados do ${kennel.name}.`,
    // Canônico próprio: página de continuação é conteúdo distinto, e apontar
    // todas para a primeira faria o buscador ignorar os cães daqui para baixo.
    path: `/c/${kennel.slug}/p/${cursor}`,
    type: "profile",
  });
}

export default async function CanilPublicoPaginaPage({
  params,
}: {
  params: Promise<{ slug: string; cursor: string }>;
}) {
  const { slug, cursor } = await params;
  return <KennelProfile slug={slug} cursor={cursor} />;
}
