import Image from "next/image";

import { PedigreeMark } from "@/modules/auth/components/pedigree-mark";

/**
 * Casca das telas de autenticação.
 *
 * Mobile-first: uma coluna, marca pequena no topo. A partir de `lg`, abre em
 * duas zonas e a chave de pedigree ganha espaço — é o único elemento com
 * presença aqui, e o resto fica quieto de propósito.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[1fr_minmax(0,28rem)]">
      <aside className="border-border flex flex-col justify-between gap-10 border-b px-6 py-8 lg:border-r lg:border-b-0 lg:px-12 lg:py-14">
        <div className="flex items-center gap-3">
          <span className="text-border-strong lg:hidden">
            <PedigreeMark generations={1} />
          </span>
          <Image
            src="/brand/logo-header.png"
            alt="OrigemX"
            width={662}
            height={132}
            priority
            className="h-8 w-auto"
          />
        </div>

        <div className="hidden max-w-md flex-col gap-8 lg:flex">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
            Registro de origem
          </span>
          <p className="text-fg-muted text-2xl leading-snug text-balance">
            A linhagem de cada cão em cinco gerações, num endereço que não muda.
          </p>
          <span className="text-border-strong" aria-hidden="true">
            <PedigreeMark generations={3} />
          </span>
        </div>

        <p className="text-fg-faint hidden font-mono text-xs lg:block">
          Cada cão, um identificador permanente.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-10 lg:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
