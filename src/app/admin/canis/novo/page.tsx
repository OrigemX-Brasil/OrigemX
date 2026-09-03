import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/modules/admin/components/empty-state";
import { StatusChip } from "@/modules/admin/components/status-chip";
import { kennelsByOwners, listProfiles } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Cadastrar canil — Admin" };

/**
 * "Para quem?" — a pergunta que a criação de canil sempre exigiu e que nenhuma
 * tela fazia.
 *
 * O FORMULÁRIO NÃO MORA AQUI. Ele já existe em
 * `/admin/usuarios/[id]/canis/novo`, com `AdminKennelForm` e a RPC auditada
 * `admin_create_kennel_for_user`; esta tela só resolve o destino e encaminha.
 * Duplicar o formulário criaria uma segunda implementação para divergir na
 * primeira mudança de campo — o mesmo motivo pelo qual `/admin/assistir` é
 * invólucro das telas do painel, e não cópia.
 *
 * Por que existir, então: o botão de cadastro só aparecia dentro do perfil do
 * dono, e só para quem ainda não tinha canil. Quem precisa atender vários
 * criadores não tinha por onde começar nem como saber quem faltava.
 *
 * MOSTRA TAMBÉM QUEM JÁ TEM CANIL, em vez de filtrar. Some com a linha e o
 * admin que procura alguém específico conclui que a pessoa sumiu da base; a
 * linha presente responde a pergunta de verdade ("essa pessoa já está
 * atendida") e ainda leva ao canil dela em um clique.
 */
export default async function AdminEscolherDonoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const { q, cursor } = await searchParams;
  const { items, nextCursor } = await listProfiles({ search: q ?? null }, { cursor });
  const canis = await kennelsByOwners(items.map((row) => row.id));

  const queryFor = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const s = sp.toString();
    return s ? `/admin/canis/novo?${s}` : "/admin/canis/novo";
  };

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/admin/canis" label="Canis" />

      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Admin</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cadastrar canil</h1>
        <p className="text-fg-muted text-sm">
          Escolha o criador. O canil nasce pertencendo a ele e em rascunho — aparece no painel dele,
          e ele edita normalmente. A autoria fica sua, e o cadastro vai para o Histórico com o
          motivo que você escrever.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "12rem" }}>
          <span className="text-fg-muted text-xs">Buscar por nome</span>
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nome do criador"
            className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
          />
        </label>
        <button
          type="submit"
          className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm transition-colors"
        >
          Filtrar
        </button>
        {q ? (
          <Link
            href="/admin/canis/novo"
            className="text-fg-muted hover:text-fg py-2 text-sm transition-colors"
          >
            Limpar
          </Link>
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          title={
            q ? "Nenhum usuário encontrado com essa busca." : "Nenhum usuário cadastrado ainda."
          }
        />
      ) : (
        <div className="border-border bg-surface rounded-card divide-border divide-y border">
          {items.map((row) => {
            const kennel = canis.get(row.id);

            return (
              <div
                key={row.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <Link
                    href={`/admin/usuarios/${row.id}`}
                    className="text-fg hover:text-link font-medium transition-colors"
                  >
                    {row.full_name ?? "—"}
                  </Link>
                  <span className="text-fg-faint font-mono text-xs">
                    {[row.city, row.state].filter(Boolean).join("/") || "—"}
                  </span>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {row.suspended_at && !row.deleted_at ? (
                    <StatusChip tone="danger">Suspenso</StatusChip>
                  ) : null}

                  {/*
                    Excluído não recebe cadastro: a RPC recusa com
                    `no_data_found`, e a própria tela do formulário faz
                    `notFound()`. Oferecer o link seria oferecer um erro.
                  */}
                  {row.deleted_at ? (
                    <StatusChip tone="danger">Excluído</StatusChip>
                  ) : kennel ? (
                    <Link
                      href={`/admin/canis/${kennel.id}`}
                      className="border-border-strong text-fg-muted hover:bg-surface-hover hover:text-fg rounded-control border px-3 py-1.5 text-sm transition-colors"
                    >
                      Já tem canil — abrir {kennel.name}
                    </Link>
                  ) : (
                    <Link
                      href={`/admin/usuarios/${row.id}/canis/novo`}
                      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors"
                    >
                      Cadastrar canil
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {nextCursor ? (
        <Link
          href={queryFor({ cursor: nextCursor })}
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          Carregar mais
        </Link>
      ) : null}
    </div>
  );
}
