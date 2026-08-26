import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { getAuthUser } from "@/modules/auth/queries";
import { getMyKennel } from "@/modules/kennels/queries";
import { FirstDogForm } from "@/modules/onboarding/components/first-dog-form";

export const metadata: Metadata = { title: "Começar" };

/**
 * ============================================================================
 * Primeiro acesso — /painel/comecar
 * ============================================================================
 *
 * Existe só para o caso SEM CANIL. Quem já tem um vai para `/painel/caes/novo`:
 * pedir de novo o nome do canil a quem já cadastrou seria absurdo, e duplicar
 * aqui o formulário completo de cão seria pior — passaria a haver duas telas
 * para cadastrar cão, divergindo na primeira mudança.
 *
 * O redirecionamento segue o mesmo padrão de `painel/canis/page.tsx`, que manda
 * para o canil existente em vez de mostrar uma lista de um item só.
 */
export default async function ComecarPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const kennel = await getMyKennel(user.id);
  if (kennel) redirect("/painel/caes/novo");

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/painel" label="Painel" />

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Seu primeiro cão</h1>
        {/* Diz de saída que o canil vem junto. O criador não precisa entender
            que são duas tabelas, mas precisa saber o que está criando — é a
            mesma intenção da decisão registrada em `painel/canis/page.tsx`. */}
        <p className="text-fg-muted max-w-prose text-sm">
          Vamos criar seu canil e o primeiro cão de uma vez. Leva menos de um minuto.
        </p>
      </div>

      <FirstDogForm />
    </div>
  );
}
