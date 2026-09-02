import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { AdminKennelForm } from "@/modules/admin/components/admin-kennel-form";
import { getKennelByOwner, getProfileById } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Cadastrar canil — Admin" };

/**
 * Cadastro do CANIL de outra pessoa — o primeiro degrau do "cadastrar tudo".
 *
 * Sem canil não há cão nem ninhada: as duas RPCs anteriores exigem canil de
 * destino. Era exatamente isto que faltava para o usuário com "Canis 0", que
 * abria a tela e não encontrava nenhum ponto de partida.
 *
 * REDIRECIONA em vez de mostrar erro quando já existe canil. `kennels_owner_uk`
 * garante no máximo UM canil vivo por criador, então esta tela não teria o que
 * fazer — e a tela do canil é justamente onde ficam as ações que a pessoa
 * queria. Mesma filosofia de `/painel/canis/novo`, que já redireciona quem tem
 * canil: oferecer um formulário que o banco vai recusar já é o erro.
 */
export default async function AdminNovoCanilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const profile = await getProfileById(id);
  if (!profile) notFound();

  // Perfil excluído não recebe cadastro: a RPC recusa com `no_data_found`, e
  // oferecer a tela seria oferecer um erro.
  if (profile.deleted_at) notFound();

  const existente = await getKennelByOwner(id);
  if (existente) redirect(`/admin/canis/${existente.id}`);

  const dono = profile.full_name ?? "este usuário";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href={`/admin/usuarios/${id}`} label={dono} />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cadastrar canil</h1>
      </div>

      <AdminKennelForm
        ownerId={profile.id}
        ownerName={dono}
        ownerSuspended={Boolean(profile.suspended_at)}
      />
    </div>
  );
}
