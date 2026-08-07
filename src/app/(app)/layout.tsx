import Image from "next/image";
import Link from "next/link";

import { signOut } from "@/modules/auth/actions";
import { requireUser } from "@/modules/auth/queries";

/**
 * Casca da área autenticada.
 *
 * `requireUser` roda no servidor, no request de cada página. O proxy já
 * redirecionou antes, mas aquilo é checagem otimista de borda — esta é a que
 * garante que nada privado renderize sem sessão, e a que continua valendo se o
 * matcher do proxy mudar por engano.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/painel");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-4 lg:px-8">
        <Link href="/painel" className="rounded-control">
          {/* Intrínseco 662×132 (a proporção real do arquivo); a altura fixa
              em CSS + `w-auto` é o que evita distorcer — sem `w-auto` o
              navegador usaria os 662px do atributo `width` como caixa. */}
          <Image
            src="/brand/logo-header.png"
            alt="OrigemX"
            width={662}
            height={132}
            priority
            className="h-8 w-auto"
          />
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="text-fg-muted hover:text-fg rounded-control text-sm transition-colors"
          >
            Sair
          </button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 lg:px-8">{children}</main>
    </div>
  );
}
