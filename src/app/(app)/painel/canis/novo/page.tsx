import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { getAuthUser } from "@/modules/auth/queries";
import { KennelForm } from "@/modules/kennels/components/kennel-form";
import { getMyKennel } from "@/modules/kennels/queries";

export const metadata: Metadata = { title: "Criar canil" };

export default async function NovoCanilPage() {
  const user = await getAuthUser();
  if (!user) return null;

  // Quem já tem canil não vê formulário de criação. A garantia continua sendo o
  // índice `kennels_owner_uk` — isto é só para a pessoa não preencher uma tela
  // inteira antes de descobrir que não pode.
  const kennel = await getMyKennel(user.id);
  if (kennel) redirect(`/painel/canis/${kennel.id}`);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href="/painel" label="Painel" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Criar seu canil</h1>
      </div>

      <KennelForm />
    </div>
  );
}
