import type { Metadata } from "next";
import Link from "next/link";

import { GoogleButton } from "@/modules/auth/components/google-button";
import { LoginForm } from "@/modules/auth/components/login-form";
import { sanitizeNext } from "@/modules/auth/redirect";

export const metadata: Metadata = { title: "Entrar" };

const ERROS: Record<string, string> = {
  oauth: "Não foi possível entrar com o Google. Tente de novo.",
  link: "Esse link expirou ou já foi usado. Peça um novo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const params = await searchParams;
  const next = sanitizeNext(params.next);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          ← Início
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-fg-muted text-sm">
          Ainda não tem conta?{" "}
          <Link
            href="/cadastro"
            className="text-link hover:text-link-hover underline underline-offset-4 transition-colors"
          >
            Criar conta
          </Link>
        </p>
      </div>

      <LoginForm next={next} initialError={params.erro ? ERROS[params.erro] : undefined} />

      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="bg-border h-px flex-1" />
        <span className="text-fg-faint font-mono text-xs tracking-widest uppercase">ou</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <GoogleButton next={next} />
    </div>
  );
}
