import Painel from "@/app/(app)/painel/page";

/**
 * Cadastro assistido — a MESMA tela do criador, servida sob /admin.
 *
 * Invólucro, não cópia: o componente é literalmente o do painel dele.
 * Duplicar qualquer um destes formulários criaria uma segunda implementação
 * para divergir na primeira mudança de campo — e o admin passaria a aceitar
 * o que a tela do dono recusa.
 *
 * O `profileId` da rota NÃO é lido aqui, e isso é deliberado: quem decide em
 * nome de quem se está escrevendo é `private.assisting_profile()`, no banco.
 * Ele está na URL para o admin enxergar de quem é o cadastro sem depender da
 * faixa — trocá-lo à mão não muda permissão nenhuma.
 */
export default async function AssistirPage({ searchParams }: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Painel searchParams={searchParams} />;
}
