import type { Metadata } from "next";

import { BackLink } from "@/components/back-link";
import { ResetRequestForm } from "@/modules/auth/components/reset-request-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function EsqueciSenhaPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="text-fg-muted text-sm">
          <BackLink href="/login" label="Voltar para o login" variant="link" />
        </p>
      </div>

      <ResetRequestForm />
    </div>
  );
}
