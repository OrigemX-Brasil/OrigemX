import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { getAuthUser } from "@/modules/auth/queries";
import { getMyKennel } from "@/modules/kennels/queries";

export const metadata: Metadata = { title: "Meu canil" };

/**
 * Não é mais uma lista: um criador tem no máximo UM canil vivo
 * (`kennels_owner_uk`). Esta rota virou o desvio para ele.
 *
 * O caminho continua sendo `/painel/canis` de propósito. Renomear para
 * `/painel/canil` só moveria links internos — a URL do painel não é impressa em
 * QR nem divulgada, e o teste de isolamento depende de `/painel/canis/[id]` de
 * terceiro dar 404.
 *
 * E não redireciona direto para `/novo` quando não há canil: isso jogaria o
 * criador dentro de um formulário sem contexto e mataria a explicação de
 * onboarding que o alerta `conta-sem-canil` aponta.
 */
export default async function CanisPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const kennel = await getMyKennel(user.id);
  if (kennel) redirect(`/painel/canis/${kennel.id}`);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href="/painel" label="Painel" />
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Canil</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Meu canil</h1>
      </div>

      <div className="border-border bg-surface rounded-card flex flex-col items-start gap-3 border p-6">
        <p className="text-fg text-sm font-medium">Você ainda não cadastrou seu canil.</p>
        <p className="text-fg-muted text-sm">O canil é o que dá endereço público aos seus cães.</p>
        <Link
          href="/painel/canis/novo"
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control mt-1 px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          Cadastrar meu canil
        </Link>
      </div>
    </div>
  );
}
