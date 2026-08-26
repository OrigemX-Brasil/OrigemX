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
 * E NÃO redireciona direto para `/novo` quando não há canil: isso jogaria o
 * criador dentro de um formulário sem contexto. A decisão continua valendo, com
 * a mesma intenção de sempre — ninguém deve encontrar campos antes de entender
 * o que está criando.
 *
 * O QUE MUDOU FOI QUEM EXPLICA. Antes era o alerta `conta-sem-canil`, passivo,
 * um cartão entre outros na lista de Pendências. Agora é a tela de boas-vindas
 * do painel (`modules/onboarding`), que aparece para quem não tem cão nenhum e
 * leva a `/painel/comecar` — onde o canil nasce junto com o primeiro cão, num
 * envio só, sem o criador precisar saber que são duas entidades.
 *
 * O alerta continua existindo, e agora com o papel que sempre coube a ele:
 * rede de segurança para quem JÁ tem cão e não tem canil — estado alcançável
 * por quem dispensou as boas-vindas e cadastrou por `/painel/caes/novo`, onde
 * o vínculo com canil é opcional.
 *
 * Esta página segue sendo o destino de quem chega pelo alerta ou pelo menu, e
 * por isso mantém a explicação abaixo em vez de encurtar o caminho.
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
