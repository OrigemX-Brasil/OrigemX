import type { Metadata } from "next";
import Link from "next/link";

import { AlertPanel } from "@/modules/alerts/components/alert-panel";
import { getAlertsForUser } from "@/modules/alerts/queries";
import { getAuthUser, getCurrentProfile } from "@/modules/auth/queries";
import { getMyKennel } from "@/modules/kennels/queries";
import { getLatestLitterId } from "@/modules/litters/queries";

export const metadata: Metadata = { title: "Painel" };

export default async function PainelPage() {
  const [user, profile] = await Promise.all([getAuthUser(), getCurrentProfile()]);

  // Alertas do Anexo I.8: derivados do dado de agora, nunca armazenados. Não
  // levantam exceção — se o levantamento falhar, o painel abre sem a seção.
  //
  // `kennel` decide se os atalhos de ninhada aparecem: sem canil não há onde
  // eles levarem.
  const [alerts, kennel] = user
    ? await Promise.all([getAlertsForUser(user.id), getMyKennel(user.id)])
    : [null, null];

  // Segunda onda: não dá para saber o `kennel.id` antes do `Promise.all`
  // acima resolver. Decide o destino de "Ver minhas ninhadas" logo abaixo.
  const latestLitterId = kennel ? await getLatestLitterId(kennel.id) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Painel</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {profile?.full_name ?? "Bem-vindo"}
        </h1>
      </div>

      {alerts ? <AlertPanel result={alerts} /> : null}

      {/* Identificação do usuário logado, lida no servidor. Mono nos valores
          porque são dado de registro, não texto corrido.

          No desktop as três linhas viram três colunas: são dados CURTOS, e
          empilhados numa faixa de 1152px cada um ocupava a largura toda para
          exibir um e-mail. `divide-y` vira `divide-x` junto, senão as réguas
          continuariam horizontais cortando colunas verticais. */}
      <dl className="border-border bg-surface rounded-card divide-border divide-y border xl:grid xl:grid-cols-3 xl:divide-x xl:divide-y-0">
        <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-start xl:justify-start">
          <dt className="text-fg-muted text-sm">E-mail</dt>
          <dd className="text-fg font-mono text-sm break-all">{user?.email ?? "—"}</dd>
        </div>
        <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-start xl:justify-start">
          <dt className="text-fg-muted text-sm">Identificador</dt>
          <dd className="text-fg-faint font-mono text-xs break-all">{user?.id ?? "—"}</dd>
        </div>
        <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-start xl:justify-start">
          <dt className="text-fg-muted text-sm">Perfil</dt>
          <dd className="text-fg font-mono text-sm">{profile?.role ?? "—"}</dd>
        </div>
      </dl>

      {/* Os atalhos lado a lado no desktop. O `<div>` é só o container da
          grade — abaixo de `xl` é uma pilha com o mesmo `gap-8` de antes.

          Com canil são QUATRO cards, que fecham a grade de 2 colunas em 2×2
          exatos; sem canil sobram os dois primeiros, numa linha só. Nenhuma
          célula órfã em nenhum dos dois casos. */}
      <div className="flex flex-col gap-8 xl:grid xl:grid-cols-2 xl:gap-8">
        <Link
          href="/painel/canis"
          className="border-border bg-surface hover:bg-surface-hover rounded-card flex items-center justify-between gap-4 border p-5 transition-colors"
        >
          <span className="flex flex-col gap-1">
            <span className="text-fg font-medium">Meu canil</span>
            <span className="text-fg-muted text-sm">Cadastre e edite seu canil.</span>
          </span>
          <span className="text-fg-faint" aria-hidden="true">
            →
          </span>
        </Link>

        <Link
          href="/painel/caes"
          className="border-border bg-surface hover:bg-surface-hover rounded-card flex items-center justify-between gap-4 border p-5 transition-colors"
        >
          <span className="flex flex-col gap-1">
            <span className="text-fg font-medium">Cães</span>
            <span className="text-fg-muted text-sm">Cadastre cães e defina pai e mãe.</span>
          </span>
          <span className="text-fg-faint" aria-hidden="true">
            →
          </span>
        </Link>

        {/* Sem canil não há onde estes links levarem — somem os dois em vez de
            apontar para uma rota que só rejeitaria o usuário.

            SÃO DOIS, e é de propósito. Numa rodada anterior existia um atalho
            só, indo direto pra `/ninhadas/novo` — e isso foi reportado como
            bug depois de subir pra produção: quem já tinha ninhada caía num
            formulário de criar OUTRA, sem ver o que já havia cadastrado.
            Trocar o destino pela âncora consertou aquele caso e criou o
            oposto: cadastrar virou dois passos.

            Separar resolve os dois lados sem escolher um. "Ver minhas
            ninhadas" leva à seção #ninhadas, que já resolve lista OU
            empty-state sozinha; "Cadastrar nova ninhada" vai direto ao
            formulário, para quem sabe o que quer. Nenhum dos dois some, então
            nenhum caminho fica escondido atrás do outro.

            "VER MINHAS NINHADAS" TEM UM SEGUNDO DESVIO, e não é o mesmo erro
            do parágrafo acima: quando já existe ninhada, ele pula a lista e
            vai direto para EDITAR a mais recente (`latestLitterId`) — a tela
            de editar já chega com os dados dela carregados no formulário, ao
            contrário da de criar, que era o problema original (formulário
            vazio escondendo o que já existia). Sem ninhada nenhuma, cai de
            volta na âncora, como sempre foi. Com duas ou mais, vai para a
            mais recente — as outras continuam na lista, só não são o destino
            direto do atalho. */}
        {kennel ? (
          <>
            <Link
              href={
                latestLitterId
                  ? `/painel/canis/${kennel.id}/ninhadas/${latestLitterId}`
                  : `/painel/canis/${kennel.id}#ninhadas`
              }
              className="border-border bg-surface hover:bg-surface-hover rounded-card flex items-center justify-between gap-4 border p-5 transition-colors"
            >
              <span className="flex flex-col gap-1">
                <span className="text-fg font-medium">Ver minhas ninhadas</span>
                <span className="text-fg-muted text-sm">
                  Edite sua ninhada mais recente, ou veja todas as cadastradas.
                </span>
              </span>
              <span className="text-fg-faint" aria-hidden="true">
                →
              </span>
            </Link>

            {/* O único card de AÇÃO da home, com o mesmo par
                `bg-accent`/`text-fg-on-accent` dos botões primários do resto do
                painel. Sobre o azul, `text-fg-muted`/`text-fg-faint` (feitos
                para fundo escuro) sumiriam — daí a hierarquia sair de opacidade
                sobre a cor de cima, não de outro token.

                O rótulo repete literalmente o botão que já existe na seção do
                canil: mesma ação, mesmo nome. */}
            <Link
              href={`/painel/canis/${kennel.id}/ninhadas/novo`}
              className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-card flex items-center justify-between gap-4 p-5 transition-colors"
            >
              <span className="flex flex-col gap-1">
                <span className="font-medium">Cadastrar nova ninhada</span>
                <span className="text-fg-on-accent/85 text-sm">
                  Registre uma ninhada e cadastre os filhotes.
                </span>
              </span>
              <span className="text-fg-on-accent/70" aria-hidden="true">
                →
              </span>
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
