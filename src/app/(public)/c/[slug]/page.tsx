import type { Metadata } from "next";

import { KennelProfile } from "@/modules/public/components/kennel-profile";
import { excerpt, publicMetadata } from "@/modules/public/metadata";
import { getPublicKennelBySlug, getPublicMedia } from "@/modules/public/queries";

/**
 * Perfil público do canil.
 *
 * ISR de 5 minutos, client anônimo, sem cookies. Ver a rota do cão para o
 * raciocínio completo — vale igual aqui.
 *
 * Nenhum filtro de publicação na consulta: a policy `kennels_select` só devolve
 * canil publicado para quem não gerencia, e o client é anônimo. Repetir a regra
 * aqui faria as duas divergirem no primeiro ajuste.
 *
 * O corpo mora em `KennelProfile` porque a segunda página é uma ROTA irmã
 * (`/c/{slug}/p/{cursor}`) e não um `?cursor=` — query string tornaria esta
 * página dinâmica e mataria o cache de borda. Ver o componente.
 */
export const revalidate = 300;
export const dynamicParams = true;

/**
 * Lista vazia, e não ausência da função.
 *
 * Sem `generateStaticParams`, o Next trata a rota como dinâmica pura e nada é
 * cacheado. Com ela devolvendo `[]` mais `dynamicParams = true`, a rota vira
 * estática-com-fallback: nada é gerado no build (não sabemos os slugs), a
 * primeira visita gera e as seguintes leem do cache por 300s.
 *
 * Gerar no build seria pior: a lista de canis muda o tempo todo, e o build não
 * pode depender do estado do banco.
 */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const kennel = await getPublicKennelBySlug(slug);
  if (!kennel) return { title: "Canil não encontrado" };

  const media = await getPublicMedia({ kennelId: kennel.id });
  const local = [kennel.city, kennel.state].filter(Boolean).join(", ");

  return publicMetadata({
    title: kennel.name,
    description:
      excerpt(kennel.description) ??
      `Perfil, cães e pedigrees do ${kennel.name}${local ? ` em ${local}` : ""}.`,
    path: `/c/${kennel.slug}`,
    imageUrl: media[0]?.url ?? null,
    imageAlt: `Logo do ${kennel.name}`,
    // Dimensões REAIS — ver o comentário em `publicMetadata` sobre o
    // 1200×1200 cravado que valia para qualquer foto.
    imageWidth: media[0]?.width ?? null,
    imageHeight: media[0]?.height ?? null,
    type: "profile",
  });
}

export default async function CanilPublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <KennelProfile slug={slug} />;
}
