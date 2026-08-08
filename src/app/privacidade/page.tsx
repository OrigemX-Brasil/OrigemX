import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { publicMetadata } from "@/modules/public/metadata";

/**
 * Página estática, irmã de `page.tsx` — sem `searchParams`/`headers()`/
 * `cookies()`, mesmo motivo: pode ser o destino de um link de rodapé clicado
 * a partir da página de captura, então precisa sair do CDN igual a ela.
 *
 * O TEXTO É UM RASCUNHO HONESTO, NÃO PEÇA JURÍDICA FECHADA — dito na própria
 * página. Descreve o que o produto REALMENTE faz com dado (conta via Supabase
 * Auth/Google, perfil de canil/cão publicado por escolha do criador, capture
 * sem PII — ver `src/modules/capture/events.ts`), não boilerplate genérico de
 * gerador de política. Existe para dar transparência mínima de LGPD enquanto
 * a versão revisada por jurídico não sai — pedido direto do cliente.
 */
export const metadata: Metadata = publicMetadata({
  title: "Política de privacidade",
  description: "Como o OrigemX trata dado de conta, canil e cão.",
  path: "/privacidade",
});

export default function PrivacidadePage() {
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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-10 lg:px-8">
        <div className="flex flex-col gap-2">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
            Privacidade
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Política de privacidade
          </h1>
        </div>

        <p className="border-accent bg-accent-subtle text-fg rounded-card border px-4 py-3 text-sm">
          Isto é um resumo do que o OrigemX realmente faz com dados, para ler em menos de dois minutos
          — não é uma peça jurídica fechada. Estamos revisando com jurídico antes de tratar este
          texto como definitivo.
        </p>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-base font-semibold">Sua conta</h2>
            <p className="text-fg-muted text-sm">
              Para criar conta, pedimos e-mail e senha, ou login com Google — nesse caso, o Google
              compartilha seu nome e e-mail com a gente. É o mínimo necessário para saber quem é o
              dono de cada canil.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-base font-semibold">Canil e cães</h2>
            <p className="text-fg-muted text-sm">
              Nome, cidade, foto, Instagram, número de registro e a genealogia que você cadastra
              ficam públicos quando você publica o perfil — é para isso que ele existe: é o que abre
              no QR Code impresso. Nada fica público antes de você decidir publicar.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-base font-semibold">Visitas à página inicial</h2>
            <p className="text-fg-muted text-sm">
              Contamos quantas pessoas chegam pela página inicial e de qual origem (por exemplo, um
              QR Code específico), sem guardar IP, cookie ou qualquer identificador de quem visitou —
              o dado é agregado por origem, nunca ligado a uma pessoa.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-base font-semibold">Seus direitos</h2>
            <p className="text-fg-muted text-sm">
              Você pode pedir a exclusão da sua conta e dos dados que cadastrou, ou uma cópia do que
              temos, a qualquer momento, escrevendo para{" "}
              <a
                href="mailto:contato@origemxbr.com"
                className="text-link hover:text-link-hover underline underline-offset-4 transition-colors"
              >
                contato@origemxbr.com
              </a>
              .
            </p>
          </section>
        </div>

        <Link
          href="/"
          className="text-fg-muted hover:text-fg self-start text-sm transition-colors"
        >
          ← Início
        </Link>
      </main>
    </div>
  );
}
