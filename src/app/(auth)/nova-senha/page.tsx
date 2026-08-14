import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/back-link";
import { NewPasswordForm } from "@/modules/auth/components/new-password-form";
import { getAuthUser } from "@/modules/auth/queries";

export const metadata: Metadata = { title: "Nova senha" };

/**
 * Esta rota é pública no proxy de propósito: quem chega pelo link do e-mail
 * pode ter chegado com o token já expirado. Barrar no proxy jogaria a pessoa
 * no login sem explicar nada. Aqui dá para dizer o que aconteceu.
 *
 * A sessão de recuperação é criada em /auth/confirm. Sem ela, o Supabase recusa
 * o updateUser de qualquer forma — a checagem abaixo é só para a mensagem.
 */
export default async function NovaSenhaPage() {
  const user = await getAuthUser();

  if (!user) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/login" label="Voltar para o login" variant="link" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Link expirado</h1>
        <p className="text-fg-muted text-sm">
          O link para redefinir a senha vale por uma hora e só pode ser usado uma vez.
        </p>
        <Link
          href="/esqueci-senha"
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          Pedir um link novo
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/" label="Início" variant="link" />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nova senha</h1>
        <p className="text-fg-muted text-sm">
          Defina a senha que você vai usar de agora em diante.
        </p>
      </div>
      <NewPasswordForm />
    </div>
  );
}
