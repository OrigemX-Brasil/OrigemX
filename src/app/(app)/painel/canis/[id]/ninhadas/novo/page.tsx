import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { getAuthUser } from "@/modules/auth/queries";
import { getManageableKennelById } from "@/modules/kennels/queries";
import { LitterForm } from "@/modules/litters/components/litter-form";

export const metadata: Metadata = { title: "Nova ninhada" };

/**
 * Só a descrição — sem upload de foto. `litter_id` não existe até o INSERT
 * acontecer, mesma restrição que já vale para logo de canil e galeria de
 * cão: as duas só aparecem na tela de EDIÇÃO, depois que a entidade dona já
 * existe. `LitterForm` redireciona para lá ao salvar.
 */
export default async function NovaNinhadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) notFound();

  const kennel = await getManageableKennelById(id, user.id);
  if (!kennel) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href={`/painel/canis/${kennel.id}`} label={kennel.name} />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nova ninhada</h1>
      </div>

      <LitterForm kennelId={kennel.id} />
    </div>
  );
}
