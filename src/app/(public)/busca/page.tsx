import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { publicMetadata } from "@/modules/public/metadata";
import {
  countPublishedDogsByKennel,
  getPublicKennelLogos,
  searchPublicKennels,
} from "@/modules/public/queries";
import { KennelResultCard } from "@/modules/search/components/kennel-result-card";
import { KennelSearch } from "@/modules/search/components/kennel-search";

/**
 * Resultado completo da busca de canis.
 *
 * `?q=`/`?cursor=` em query string, não rota-irmã como `/c/[slug]/p/[cursor]`
 * — aquela outra existe pra preservar ISR num conjunto finito de slugs. Termo
 * de busca é livre e não-cacheável de qualquer forma, então não há cache pra
 * proteger aqui; query string é o padrão universal de busca (URL
 * compartilhável, volta/avança do navegador de graça).
 *
 * `robots: { index: false }`: resultado com querystring livre não deveria
 * ser indexado, mesmo padrão do `not-found.tsx`.
 */
export const metadata: Metadata = {
  ...publicMetadata({
    title: "Buscar canil",
    description: "Encontre o perfil público de um canil no OrigemX.",
    path: "/busca",
  }),
  robots: { index: false, follow: true },
};

const MIN_QUERY_LENGTH = 2;

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const { q, cursor } = await searchParams;
  const term = (q ?? "").trim();

  const results =
    term.length >= MIN_QUERY_LENGTH
      ? await searchPublicKennels({ q: term, cursor })
      : { items: [], nextCursor: null };

  const ids = results.items.map((k) => k.id);
  const [logos, counts] = await Promise.all([
    getPublicKennelLogos(ids),
    countPublishedDogsByKennel(ids),
  ]);

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

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 lg:px-8">
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
              placeholder="Buscar canil pelo nome..."
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

        {term.length < MIN_QUERY_LENGTH ? (
          <p className="text-fg-muted text-sm">Digite ao menos 2 letras para buscar um canil.</p>
        ) : results.items.length === 0 ? (
          <p className="text-fg-muted text-sm">Nenhum canil encontrado para “{term}”.</p>
        ) : (
          <>
            <p className="text-fg-faint mb-4 text-sm">Resultados para “{term}”</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.items.map((kennel) => (
                <KennelResultCard
                  key={kennel.id}
                  kennel={kennel}
                  logo={logos.get(kennel.id)}
                  dogCount={counts.get(kennel.id) ?? 0}
                />
              ))}
            </div>

            {results.nextCursor ? (
              <div className="mt-8 flex justify-center">
                <Link
                  href={`/busca?q=${encodeURIComponent(term)}&cursor=${results.nextCursor}`}
                  prefetch={false}
                  className="border-border-strong text-fg hover:bg-surface-hover rounded-control focus-visible:outline-ring border px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Ver mais canis
                </Link>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
