import Link from "next/link";

import { getAssistSession } from "@/lib/assist";

import { endAssistSession } from "../actions";

/**
 * A faixa de "você está cadastrando em nome de outra pessoa".
 *
 * VAI NO LAYOUT, não na página, e isso é o requisito — não estética. O admin
 * trabalha nas telas do CRIADOR durante a sessão, e a única coisa que impede o
 * engano de achar que está no próprio cadastro é este aviso estar presente em
 * TODAS elas, inclusive nas que ninguém lembrou de tocar.
 *
 * Server Component: lê a sessão e renderiza um `<form action={...}>` puro. Sem
 * ilha cliente, sem JavaScript — encerrar precisa funcionar mesmo se o bundle
 * falhar, porque uma sessão que não fecha é uma sessão que continua autorizando
 * escrita.
 *
 * Renderiza `null` quando não há sessão, então pendurá-la num layout não custa
 * nada para o criador comum — que é quem mais usa aquelas telas.
 */
export async function AssistBanner() {
  const sessao = await getAssistSession();
  if (!sessao) return null;

  const nome = sessao.targetName ?? "outro criador";

  return (
    <div className="border-warning-subtle bg-warning-subtle border-b">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="text-fg text-sm font-medium">
            Cadastro assistido — você está editando em nome de {nome}.
          </p>
          <p className="text-fg-muted text-xs">
            Tudo que você salvar pertence a {nome} e vai para o Histórico com o motivo que você
            declarou: “{sessao.reason}”.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={`/admin/usuarios/${sessao.targetProfileId}`}
            className="text-link hover:text-link-hover text-sm underline underline-offset-4 transition-colors"
          >
            Ver o usuário
          </Link>
          <form action={endAssistSession}>
            <button
              type="submit"
              className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Encerrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
