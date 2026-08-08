import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { resolveSignupSource, SOURCE_PARAM } from "@/modules/capture/events";
import { GoogleButton } from "@/modules/auth/components/google-button";
import { SignupForm } from "@/modules/auth/components/signup-form";
import { siteUrl } from "@/modules/public/metadata";

export const metadata: Metadata = { title: "Criar conta" };

/**
 * DINÂMICA de propósito, ao contrário da página de captura.
 *
 * Ler `headers()` tira esta rota do cache de borda — e aqui isso não custa
 * nada: ninguém chega no `/cadastro` por QR impresso, chega por clique, já
 * dentro do site. A página de captura é que precisa vir do CDN.
 *
 * O `Referer` é lido para recuperar de qual campanha veio o clique, já que a
 * landing estática não pode carimbar isso no link. Ele é usado e descartado:
 * o que sobra é uma origem normalizada de até 40 caracteres, sem nada pessoal.
 */
export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const explicito = params[SOURCE_PARAM];

  const referer = (await headers()).get("referer");
  const source = resolveSignupSource(
    typeof explicito === "string" ? explicito : null,
    referer,
    siteUrl().hostname,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          ← Início
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Criar conta</h1>
        <p className="text-fg-muted text-sm">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="text-link hover:text-link-hover underline underline-offset-4 transition-colors"
          >
            Entrar
          </Link>
        </p>
      </div>

      <SignupForm source={source} />

      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="bg-border h-px flex-1" />
        <span className="text-fg-faint font-mono text-xs tracking-widest uppercase">ou</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <GoogleButton next="/painel" source={source} />
    </div>
  );
}
