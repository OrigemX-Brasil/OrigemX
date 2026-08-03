import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Wordmark } from "@/modules/auth/components/wordmark";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";
import { getKennelBySlug, listPublishedDogs } from "@/modules/kennels/queries";
import { getKennelLogo } from "@/modules/media/queries";

/**
 * Perfil público do canil. Abre SEM sessão — é o produto.
 *
 * Nenhum filtro de publicação aqui: a policy `kennels_select` só devolve canil
 * publicado para quem não gerencia, então "não achou" já significa "não é
 * público". Repetir a regra na consulta faria as duas divergirem.
 */

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const kennel = await getKennelBySlug(slug);
  if (!kennel) return { title: "Canil não encontrado" };

  return {
    title: kennel.name,
    description:
      kennel.description?.slice(0, 160) ??
      `Perfil e cães do ${kennel.name}${kennel.city ? ` em ${kennel.city}` : ""}.`,
  };
}

export default async function CanilPublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kennel = await getKennelBySlug(slug);
  if (!kennel) notFound();

  const [logo, dogs] = await Promise.all([getKennelLogo(kennel.id), listPublishedDogs(kennel.id)]);

  const local = [kennel.city, kennel.state].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border border-b px-5 py-4 lg:px-8">
        <Link href="/" className="rounded-control">
          <Wordmark className="text-base" />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 lg:px-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            {/* Thumbnail, nunca o arquivo cheio — vale também no perfil público. */}
            {logo?.thumbUrl ? (
              <Image
                src={logo.thumbUrl}
                alt={logo.alt ?? `Logo do ${kennel.name}`}
                width={112}
                height={112}
                className="border-border rounded-card shrink-0 border object-cover"
                unoptimized
              />
            ) : null}

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
              // noopener/noreferrer em link para fora: sem eles a página de
              // destino recebe window.opener e pode redirecionar esta aba.
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
        </div>
      </main>
    </div>
  );
}
