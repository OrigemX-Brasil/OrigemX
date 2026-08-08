import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PedigreeMark } from "@/modules/auth/components/pedigree-mark";
import { publicMetadata } from "@/modules/public/metadata";

/**
 * Página estática, sem route group — pega TODA URL não mapeada, e é também
 * onde os `notFound()` de `/d/[public_id]`, `/painel/canis/[id]` e
 * `/painel/caes/[id]` desembocam, já que nenhum dos route groups tem
 * `not-found.tsx` próprio.
 *
 * Quando o `notFound()` de dentro de `(app)` propaga até aqui, o layout de
 * `(app)` (logo + Sair) NÃO entra — o Next resolve pro not-found mais próximo
 * acima na árvore, e este fica fora de qualquer layout de route group. Por
 * isso a página tem seu próprio cabeçalho, igual a `privacidade/page.tsx`: é
 * o único jeito de garantir que sempre exista um.
 *
 * `robots: { index: false }` porque, diferente de toda outra página pública
 * daqui, esta não deveria aparecer em busca.
 */
export const metadata: Metadata = {
  ...publicMetadata({
    title: "Página não encontrada",
    description: "Essa página não existe no OrigemX.",
    path: "/404",
  }),
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border border-b px-5 py-4 lg:px-8">
        <Link href="/" className="rounded-control">
          <Image
            src="/brand/logo-header.png"
            alt="OrigemX"
            width={662}
            height={132}
            className="h-8 w-auto"
          />
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-16 text-center">
        <span className="text-border-strong" aria-hidden="true">
          <PedigreeMark generations={2} />
        </span>

        <div className="flex flex-col gap-3">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">404</span>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Essa página não existe.
          </h1>
          <p className="text-fg-muted max-w-sm text-sm text-balance">
            O endereço pode estar errado, ou a página que você procurava não existe mais.
          </p>
        </div>

        <Link
          href="/"
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring px-6 py-3 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Voltar para o início
        </Link>
      </main>
    </div>
  );
}
