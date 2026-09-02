import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { AssistStartDialog } from "@/modules/admin/components/assist-start-dialog";
import { StatusChip } from "@/modules/admin/components/status-chip";
import { SuspendUserDialog } from "@/modules/admin/components/suspend-user-dialog";
import { formatDateTime } from "@/modules/admin/format";
import {
  countDogsByOwner,
  getKennelByOwner,
  getProfileById,
  getProfileEmail,
  type KennelListItem,
} from "@/modules/admin/queries";
import { KENNEL_STATUS_LABEL, KENNEL_STATUS_TONE, kennelStatus } from "@/modules/admin/status";
import { getAuthUser } from "@/modules/auth/queries";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";

export const metadata: Metadata = { title: "Usuário — Admin" };

/**
 * `getAuthUser()`, não `requireAdmin()` de novo: o layout de `/admin` já é o
 * portão. A página só precisa saber QUEM é o admin atual, para decidir se
 * mostra o botão de suspender (nunca na própria linha) — mesmo padrão que
 * `/painel/caes/[id]/page.tsx` já usa.
 *
 * ESTA TELA É O PONTO DE PARTIDA do cadastro em nome do dono. Antes ela era só
 * leitura, com duas contagens que não levavam a lugar nenhum — e foi
 * exatamente assim que um usuário com "Canis 0" apareceu sem nenhuma ação
 * possível. O caminho agora nasce daqui, e ele tem uma ordem obrigatória: sem
 * canil não existe cão nem ninhada, porque as duas RPCs exigem canil de
 * destino.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [me, profile] = await Promise.all([getAuthUser(), getProfileById(id)]);
  if (!profile) notFound();

  const [email, kennel, dogCount] = await Promise.all([
    getProfileEmail(id),
    getKennelByOwner(id),
    countDogsByOwner(id),
  ]);

  const isSelf = me?.id === profile.id;
  const nome = profile.full_name ?? "este usuário";
  // Perfil excluído não recebe cadastro: as RPCs recusam com `no_data_found`.
  // Oferecer o controle já seria o erro — mesma regra da tela do canil.
  const podeCadastrar = !profile.deleted_at;

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/admin/usuarios" label="Usuários" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
            Usuário
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {profile.full_name ?? "—"}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {profile.role === "admin" ? (
              <span className="text-accent-text font-mono text-[0.65rem] tracking-wider uppercase">
                Admin
              </span>
            ) : null}
            {profile.deleted_at ? <StatusChip tone="danger">Excluído</StatusChip> : null}
            {!profile.deleted_at && profile.suspended_at ? (
              <StatusChip tone="danger">Suspenso</StatusChip>
            ) : null}
          </div>
        </div>

        {isSelf ? (
          <p className="text-fg-faint text-sm">Você não pode suspender a própria conta.</p>
        ) : (
          <SuspendUserDialog
            profileId={profile.id}
            name={profile.full_name ?? "este usuário"}
            isSuspended={Boolean(profile.suspended_at)}
            targetIsAdmin={profile.role === "admin"}
          />
        )}
      </div>

      <dl className="border-border bg-surface rounded-card divide-border divide-y border">
        <Row label="E-mail" value={email ?? "—"} mono />
        <Row
          label="Cidade/Estado"
          value={[profile.city, profile.state].filter(Boolean).join("/") || "—"}
        />
        <Row label="Cadastrado em" value={formatDateTime(profile.created_at)} mono />
      </dl>

      {podeCadastrar ? (
        <section className="border-warning-subtle bg-warning-subtle rounded-card flex flex-col gap-4 border p-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-base font-semibold">Cadastrar em nome de {nome}</h2>
            <p className="text-fg-muted text-sm">
              O registro nasce pertencendo a {nome} — aparece no painel dele e ele edita
              normalmente. A autoria fica sua, e cada cadastro vai para o Histórico com o motivo
              que você escrever.
              {profile.suspended_at
                ? " O dono está suspenso: ele não vai conseguir editar enquanto isso durar."
                : ""}
            </p>
          </div>

          {/*
            O cadastro assistido é o caminho para tudo que NÃO cabe numa RPC de
            criação: cidade do canil, filhotes da ninhada, identificadores,
            saúde, exames, medidas, vídeo, FAQ, depoimentos. Fica antes dos
            atalhos porque é o que o PO pediu — guiar o criador do zero — e
            porque os atalhos abaixo criam a casca que ele vai preencher aqui.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <AssistStartDialog
              profileId={profile.id}
              name={nome}
              hasKennel={Boolean(kennel)}
            />
            <span className="text-fg-muted text-sm">
              Edita canil, cães e ninhadas pelo painel dele, com trilha.
            </span>
          </div>

          {kennel ? (
            <KennelCard kennel={kennel} />
          ) : (
            <>
              <p className="text-fg-muted text-sm">
                <span className="text-fg font-medium">Ainda não há canil.</span> Cão e ninhada
                precisam de um canil de destino, então este é o primeiro passo — e o endereço
                público que você escolher fica reservado para sempre.
              </p>
              <div>
                <Link
                  href={`/admin/usuarios/${profile.id}/canis/novo`}
                  className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control inline-block px-4 py-2 text-sm font-semibold transition-colors"
                >
                  Cadastrar canil
                </Link>
              </div>
            </>
          )}
        </section>
      ) : (
        <p className="text-fg-faint text-sm">Usuário excluído — não há onde cadastrar.</p>
      )}

      {/*
        A contagem de cães continua aqui, e sem link: as listas de `/admin/caes`
        buscam por NOME do registro (`ilike` em `dogs.name`), não por dono — um
        link com `?q=<nome da pessoa>` pareceria "ver os cães dela" e na verdade
        buscaria cão cujo NOME batesse com o nome da pessoa, coisa diferente. O
        caminho honesto até os cães dela é pelo canil, logo acima.
      */}
      <div className="border-border bg-surface rounded-card flex flex-col gap-1 border p-5 sm:max-w-xs">
        <span className="text-fg-muted text-sm">Cães</span>
        <span className="font-mono text-3xl font-semibold tracking-tight">{dogCount}</span>
      </div>
    </div>
  );
}

/**
 * O canil do usuário, com os atalhos que dependem dele.
 *
 * Os atalhos apontam DIRETO para os formulários, sem passar pela tela do canil,
 * e isso só é possível porque `kennels_owner_uk` garante no máximo um canil vivo
 * por criador: não existe "em qual canil?" a perguntar.
 */
function KennelCard({ kennel }: { kennel: KennelListItem }) {
  const status = kennelStatus(kennel);

  return (
    <div className="border-border bg-bg rounded-card flex flex-col gap-4 border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href={`/admin/canis/${kennel.id}`}
            className="text-link hover:text-link-hover font-medium underline underline-offset-4 transition-colors"
          >
            {kennel.name}
          </Link>
          <span className="text-fg-faint font-mono text-xs">/c/{kennel.slug}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FounderBadge number={kennel.founder_number} size="sm" />
          <StatusChip tone={KENNEL_STATUS_TONE[status]}>{KENNEL_STATUS_LABEL[status]}</StatusChip>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/canis/${kennel.id}/caes/novo`}
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors"
        >
          Cadastrar cão
        </Link>
        <Link
          href={`/admin/canis/${kennel.id}/ninhadas/nova`}
          className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm font-medium transition-colors"
        >
          Cadastrar ninhada
        </Link>
        <Link
          href={`/admin/canis/${kennel.id}/logo`}
          className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm font-medium transition-colors"
        >
          Enviar logo
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className={`text-fg text-sm break-all ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
