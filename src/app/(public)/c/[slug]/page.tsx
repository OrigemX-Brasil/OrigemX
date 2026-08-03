import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Wordmark } from "@/modules/auth/components/wordmark";
import { SignupInvite } from "@/modules/capture/components/signup-invite";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";
import { PublicImage } from "@/modules/public/components/public-image";
import { excerpt, publicMetadata } from "@/modules/public/metadata";
import {
  getPublicKennelBySlug,
  getPublicMedia,
  listPublicDogsOfKennel,
} from "@/modules/public/queries";

/**
 * Perfil público do canil.
 *
 * ISR de 5 minutos, client anônimo, sem cookies. Ver a rota do cão para o
 * raciocínio completo — vale igual aqui.
 *
 * Nenhum filtro de publicação na consulta: a policy `kennels_select` só devolve
 * canil publicado para quem não gerencia, e o client é anônimo. Repetir a regra
 * aqui faria as duas divergirem no primeiro ajuste.
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

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

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
    type: "profile",
  });
}

export default async function CanilPublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kennel = await getPublicKennelBySlug(slug);
  if (!kennel) notFound();

  const [media, dogs] = await Promise.all([
    getPublicMedia({ kennelId: kennel.id }),
    listPublicDogsOfKennel(kennel.id),
  ]);

  const logo = media[0];
  const local = [kennel.city, kennel.state].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border border-b px-5 py-4 lg:px-8">
        <Link href="/" className="rounded-control">
          <Wordmark className="text-base" />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 lg:px-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <PublicImage
              src={logo?.thumbUrl ?? logo?.url}
              alt={logo?.alt ?? `Logo do ${kennel.name}`}
              fallbackText={kennel.name}
              width={112}
              height={112}
              priority
              sizes="112px"
              className="border-border rounded-card shrink-0 border object-cover"
            />

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
                  Canil
                </span>
                <h1 className="font-display text-3xl font-semibold tracking-tight">
                  {kennel.name}
                </h1>
                {local ? <p className="text-fg-muted text-sm">{local}</p> : null}
              </div>

              <FounderBadge number={kennel.founder_number} />
            </div>
          </div>

          {kennel.description ? (
            <p className="text-fg-muted max-w-prose text-base whitespace-pre-line">
              {kennel.description}
            </p>
          ) : null}

          {kennel.website_url ? (
            <a
              href={kennel.website_url}
              // noopener/noreferrer: sem eles a página de destino recebe
              // window.opener e pode redirecionar esta aba.
              rel="noopener noreferrer nofollow"
              target="_blank"
              className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
            >
              {kennel.website_url}
            </a>
          ) : null}

          <section className="border-border flex flex-col gap-4 border-t pt-8">
            <h2 className="font-display text-lg font-semibold tracking-tight">Cães</h2>

            {dogs.length === 0 ? (
              <p className="text-fg-muted text-sm">Nenhum cão publicado ainda.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {dogs.map((dog) => (
                  <li key={dog.id}>
                    <Link
                      href={`/d/${dog.public_id}`}
                      className="border-border bg-surface hover:bg-surface-hover rounded-card flex flex-col gap-1 border p-4 transition-colors"
                    >
                      <span className="text-fg font-medium">{dog.name}</span>
                      <span className="text-fg-faint font-mono text-xs">
                        {[SEX_LABEL[dog.sex], dog.breed, dog.born_on?.slice(0, 4)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <SignupInvite source="perfil-canil" />
        </div>
      </main>
    </div>
  );
}
