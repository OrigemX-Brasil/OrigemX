import Link from "next/link";
import { notFound } from "next/navigation";

import { Wordmark } from "@/modules/auth/components/wordmark";
import { SignupInvite } from "@/modules/capture/components/signup-invite";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";
import { PublicImage } from "@/modules/public/components/public-image";
import {
  getPublicKennelBySlug,
  getPublicMedia,
  listPublicDogsOfKennel,
} from "@/modules/public/queries";

/**
 * ============================================================================
 * Perfil público do canil — o corpo, compartilhado pelas duas rotas.
 * ============================================================================
 *
 * Existe porque a paginação **não podia ir por query string**. Ler
 * `searchParams` numa página torna a rota DINÂMICA no Next, e esta é servida do
 * CDN com ISR — é alvo de QR impresso. Trocar o cache de borda por um `?cursor=`
 * seria pagar com a coisa mais valiosa da página para ganhar a menos importante.
 *
 * Por isso a página seguinte é uma ROTA: `/c/{slug}/p/{cursor}`. Cada página
 * vira uma entrada estática própria, cacheada igual à primeira, e o cursor
 * (base64url) passa inteiro num segmento de caminho.
 */

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

export async function KennelProfile({ slug, cursor }: { slug: string; cursor?: string }) {
  const kennel = await getPublicKennelBySlug(slug);
  if (!kennel) notFound();

  const [media, dogs] = await Promise.all([
    getPublicMedia({ kennelId: kennel.id }),
    listPublicDogsOfKennel(kennel.id, { cursor }),
  ]);

  // Cursor apontando para o nada devolve lista vazia. Na primeira página isso é
  // "canil sem cães"; numa página seguinte é URL inventada, e aí 404 é a
  // resposta honesta em vez de uma página vazia que parece quebrada.
  if (cursor && dogs.items.length === 0) notFound();

  const logo = media[0];
  const local = [kennel.city, kennel.state].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border border-b px-5 py-4 lg:px-8">
        {/* Wordmark do cabeçalho entra na viewport sempre. Ver a rota do cão. */}
        <Link href="/" prefetch={false} className="rounded-control">
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

            {dogs.items.length === 0 ? (
              <p className="text-fg-muted text-sm">Nenhum cão publicado ainda.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {dogs.items.map((dog) => (
                    <li key={dog.id}>
                      <Link
                        href={`/d/${dog.public_id}`}
                        // Sem prefetch: com a lista cheia, abrir o perfil de um
                        // canil baixaria um payload por cão de uma vez. Ver
                        // pedigree-tree.tsx.
                        prefetch={false}
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

                {dogs.nextCursor ? (
                  <Link
                    href={`/c/${kennel.slug}/p/${dogs.nextCursor}`}
                    prefetch={false}
                    className="border-border-strong text-fg hover:bg-surface-hover rounded-control focus-visible:outline-ring self-start border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    Ver mais cães
                  </Link>
                ) : null}

                {cursor ? (
                  <Link
                    href={`/c/${kennel.slug}`}
                    prefetch={false}
                    className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
                  >
                    ← Voltar ao início da lista
                  </Link>
                ) : null}
              </>
            )}
          </section>

          <SignupInvite source="perfil-canil" />
        </div>
      </main>
    </div>
  );
}
