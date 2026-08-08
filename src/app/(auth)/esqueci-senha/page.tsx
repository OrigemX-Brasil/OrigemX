import type { Metadata } from "next";
import Link from "next/link";

import { ResetRequestForm } from "@/modules/auth/components/reset-request-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function EsqueciSenhaPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="text-fg-muted text-sm">
          <Link
            href="/login"
            className="text-link hover:text-link-hover underline underline-offset-4 transition-colors"
          >
            ← Voltar para o login
          </Link>
        </p>
      </div>

      <ResetRequestForm />
    </div>
  );
}
