import Link from "next/link";

import { PedigreeMark } from "@/modules/auth/components/pedigree-mark";
import { Wordmark } from "@/modules/auth/components/wordmark";

/**
 * Home pública. Rota aberta no proxy — junto de /d/ e /c/, que são o produto.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-10 px-5 py-16">
      <Wordmark className="text-xl" />

      <div className="flex flex-col gap-5">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
          Registro de origem
        </span>
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          A linhagem de cada cão em cinco gerações, num endereço que não muda.
        </h1>
        <p className="text-fg-muted max-w-xl text-base">
          Perfis públicos de canis, pedigree navegável e um identificador permanente por animal — o
          mesmo que vai impresso no QR Code.
        </p>
      </div>

      <span className="text-border-strong" aria-hidden="true">
        <PedigreeMark generations={3} />
      </span>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/cadastro"
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-5 py-2.5 text-sm font-semibold transition-colors"
        >
          Criar conta
        </Link>
        <Link
          href="/login"
          className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Entrar
        </Link>
      </div>
    </main>
  );
}
