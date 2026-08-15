import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BackLink } from "@/components/back-link";
import { searchPublicDogs } from "@/modules/dogs/queries";
import { publicMetadata } from "@/modules/public/metadata";
import {
  countPublishedDogsByKennel,
  getPublicKennelLogos,
  searchPublicKennels,
} from "@/modules/public/queries";
import { DogResultCard } from "@/modules/search/components/dog-result-card";
import { KennelResultCard } from "@/modules/search/components/kennel-result-card";
import { KennelSearch } from "@/modules/search/components/kennel-search";

/**
 * Resultado completo da busca de canis e cães.
 *
 * `?q=`/`?kcursor=`/`?dcursor=` em query string, não rota-irmã como
 * `/c/[slug]/p/[cursor]` — aquela outra existe pra preservar ISR num
 * conjunto finito de slugs. Termo de busca é livre e não-cacheável de
 * qualquer forma, então não há cache pra proteger aqui; query string é o
 * padrão universal de busca (URL compartilhável, volta/avança do navegador
 * de graça). Dois cursores, não um: canil e cão paginam de forma
 * independente, então avançar uma seção não pode resetar a outra.
 *
 * `robots: { index: false }`: resultado com querystring livre não deveria
 * ser indexado, mesmo padrão do `not-found.tsx`.
 */
export const metadata: Metadata = {
  ...publicMetadata({
    title: "Buscar canil ou cão",
    description: "Encontre o perfil público de um canil ou de um cão no OrigemX.",
    path: "/busca",
  }),
  robots: { index: false, follow: true },
};

const MIN_QUERY_LENGTH = 2;

/** Constrói a URL de "ver mais", preservando o cursor da OUTRA seção. */
function paginationHref(term: string, kcursor: string | null, dcursor: string | null): string {
  const params = new URLSearchParams({ q: term });
  if (kcursor) params.set("kcursor", kcursor);
  if (dcursor) params.set("dcursor", dcursor);
  return `/busca?${params.toString()}`;
}

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kcursor?: string; dcursor?: string }>;
}) {
  const { q, kcursor, dcursor } = await searchParams;
  const term = (q ?? "").trim();
  const searchable = term.length >= MIN_QUERY_LENGTH;

  // Duas buscas independentes, cada uma com o próprio cursor — canil não
  // pausa enquanto cão pagina, e vice-versa.
  const [kennelResults, dogResults] = await Promise.all([
    searchable
      ? searchPublicKennels({ q: term, cursor: kcursor })
      : Promise.resolve({ items: [], nextCursor: null }),
    searchable
      ? searchPublicDogs(term, { cursor: dcursor })
      : Promise.resolve({ items: [], nextCursor: null, ownDrafts: [] }),
  ]);

  const ids = kennelResults.items.map((k) => k.id);
  const [logos, counts] = await Promise.all([
    getPublicKennelLogos(ids),
    countPublishedDogsByKennel(ids),
  ]);

  const noKennels = kennelResults.items.length === 0;
  const noDogs = dogResults.items.length === 0 && dogResults.ownDrafts.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-4 lg:px-8">
        <Link href="/" prefetch={false} className="rounded-control">
          <Image
            src="/brand/logo-header.png"
            alt="OrigemX"
            width={662}
            height={132}
            className="h-8 w-auto"
          />
        </Link>
        <KennelSearch />
      </header>

      <main className="xl:max-w-6xl mx-auto w-full max-w-3xl flex-1 px-5 py-10 lg:px-8">
        <div className="mb-8">
          <BackLink href="/" label="Início" variant="link" />
        </div>

        {/* Funciona sem JavaScript: GET simples pra própria página. */}
        <form action="/busca" className="mb-8 flex gap-2">
          {/*
            Mesmo token de foco do painel da lupa, para os dois campos de busca
            do produto se comportarem igual. O anel sólido do token É o
            indicador de foco; o `outline-transparent` cobre o modo de alto
            contraste, onde sombra não sobrevive.
          */}
          <div className="border-border-strong bg-bg focus-within:shadow-input-focus rounded-control ease-panel flex flex-1 items-center border transition-shadow duration-200 focus-within:outline-2 focus-within:outline-transparent motion-reduce:transition-none">
            <input
              type="search"
              name="q"
              defaultValue={term}
              placeholder="Buscar canil ou cão pelo nome..."
              className="text-fg placeholder:text-fg-faint w-full bg-transparent px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <button
            type="submit"
            className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring ease-panel px-5 py-2.5 text-sm font-semibold transition-[background-color,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Buscar
          </button>
        </form>

        {!searchable ? (
          <p className="text-fg-muted text-sm">Digite ao menos 2 letras para buscar.</p>
        ) : noKennels && noDogs ? (
          <p className="text-fg-muted text-sm">Nenhum resultado para “{term}”.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {!noKennels ? (
              <section>
                <h2 className="text-fg-faint mb-4 font-mono text-xs tracking-[0.2em] uppercase">
                  Canis
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {kennelResults.items.map((kennel) => (
                    <KennelResultCard
                      key={kennel.id}
                      kennel={kennel}
                      logo={logos.get(kennel.id)}
                      dogCount={counts.get(kennel.id) ?? 0}
                    />
                  ))}
                </div>

                {kennelResults.nextCursor ? (
                  <div className="mt-8 flex justify-center">
                    <Link
                      href={paginationHref(term, kennelResults.nextCursor, dcursor ?? null)}
                      prefetch={false}
                      className="border-border-strong text-fg hover:bg-surface-hover rounded-control focus-visible:outline-ring border px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      Ver mais canis
                    </Link>
                  </div>
                ) : null}
              </section>
            ) : null}

            {!noDogs ? (
              <section>
                <h2 className="text-fg-faint mb-4 font-mono text-xs tracking-[0.2em] uppercase">
                  Cães
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {dogResults.ownDrafts.map((dog) => (
                    <DogResultCard key={dog.id} dog={dog} />
                  ))}
                  {dogResults.items.map((dog) => (
                    <DogResultCard key={dog.id} dog={dog} />
                  ))}
                </div>

                {dogResults.nextCursor ? (
                  <div className="mt-8 flex justify-center">
                    <Link
                      href={paginationHref(term, kcursor ?? null, dogResults.nextCursor)}
                      prefetch={false}
                      className="border-border-strong text-fg hover:bg-surface-hover rounded-control focus-visible:outline-ring border px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      Ver mais cães
                    </Link>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
