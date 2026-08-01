import type { Metadata } from "next";
import Link from "next/link";

import { GoogleButton } from "@/modules/auth/components/google-button";
import { SignupForm } from "@/modules/auth/components/signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
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

      <SignupForm />

      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="bg-border h-px flex-1" />
        <span className="text-fg-faint font-mono text-xs tracking-widest uppercase">ou</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <GoogleButton next="/painel" />
    </div>
  );
}
