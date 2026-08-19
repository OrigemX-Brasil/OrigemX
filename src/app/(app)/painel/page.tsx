import type { Metadata } from "next";
import Link from "next/link";

import { AlertPanel } from "@/modules/alerts/components/alert-panel";
import { getAlertsForUser } from "@/modules/alerts/queries";
import { getAuthUser, getCurrentProfile } from "@/modules/auth/queries";
import { getMyKennel } from "@/modules/kennels/queries";

export const metadata: Metadata = { title: "Painel" };

export default async function PainelPage() {
  const [user, profile] = await Promise.all([getAuthUser(), getCurrentProfile()]);

  // Alertas do Anexo I.8: derivados do dado de agora, nunca armazenados. Não
  // levantam exceção — se o levantamento falhar, o painel abre sem a seção.
  //
  // `kennel` decide se o atalho de Ninhadas aparece: sem canil não há onde
  // ele levar.
  const [alerts, kennel] = user
    ? await Promise.all([getAlertsForUser(user.id), getMyKennel(user.id)])
    : [null, null];

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

      {/* Os dois atalhos lado a lado no desktop. O `<div>` é só o container da
          grade — abaixo de `xl` ele não tem classe nenhuma, então os dois
          `<Link>` continuam sendo irmãos empilhados pelo `gap-8` do pai, como
          antes. */}
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

        {/* Sem canil não há onde este link levar — some em vez de apontar
            para uma rota que só rejeitaria o usuário.

            Vai pra página do canil, não direto pro formulário de criação: a
            seção #ninhadas de lá já lista o que existe (ou mostra o
            empty-state com "Cadastrar nova ninhada"). Pular pra `/novo`
            jogaria quem já tem ninhada dentro de um formulário de criar
            outra, sem ver o que já cadastrou. */}
        {kennel ? (
          <Link
            href={`/painel/canis/${kennel.id}#ninhadas`}
            className="border-border bg-surface hover:bg-surface-hover rounded-card flex items-center justify-between gap-4 border p-5 transition-colors"
          >
            <span className="flex flex-col gap-1">
              <span className="text-fg font-medium">Ninhadas</span>
              <span className="text-fg-muted text-sm">
                Registre uma ninhada e cadastre os filhotes.
              </span>
            </span>
            <span className="text-fg-faint" aria-hidden="true">
              →
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
