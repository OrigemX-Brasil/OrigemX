import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/modules/admin/components/empty-state";
import { FounderNumberDialog } from "@/modules/admin/components/founder-number-dialog";
import { HideEntityDialog } from "@/modules/admin/components/hide-entity-dialog";
import { PublishEntityDialog } from "@/modules/admin/components/publish-entity-dialog";
import { StatusChip } from "@/modules/admin/components/status-chip";
import { formatDateTime } from "@/modules/admin/format";
import {
  getAdminKennelById,
  getProfileById,
  listKennelLitters,
  ownerName,
  type LitterListItem,
} from "@/modules/admin/queries";
import {
  KENNEL_STATUS_LABEL,
  KENNEL_STATUS_TONE,
  kennelStatus,
  LITTER_STATUS_LABEL,
  LITTER_STATUS_TONE,
  litterStatus,
} from "@/modules/admin/status";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";

export const metadata: Metadata = { title: "Canil — Admin" };

/**
 * Visão do admin. Duas famílias de ação, e a separação entre elas é o ponto:
 *
 * MODERAÇÃO — ocultar/reativar e corrigir o número do selo. Passam por
 * `admin_set_*` → `private.audit()`, nunca pelo caminho de escrita do dono: o
 * rastro não tem como confundir "admin agiu" com "dono editou o próprio".
 *
 * CADASTRO EM NOME DO DONO — cão, ninhada e logo, via `admin_create_*` e
 * `admin_register_media_for_user`. Mesma regra e o mesmo motivo: `owner_id` sai
 * DESTE canil (a aplicação nunca nomeia o dono, então não tem como errá-lo),
 * `created_by` é o admin, e a linha de `audit_log` commita na mesma transação
 * do INSERT.
 *
 * PUBLICAÇÃO — desde `admin_cadastra_tudo_para_usuario`, também mora aqui. Não
 * é porta nova: `kennels_update_own` sempre teve `or private.is_admin()` e
 * `publishKennel` nunca filtrou posse, então um admin já publicava qualquer
 * canil pelo `/painel` do dono, SEM rastro. O que mudou é que agora existe um
 * caminho que audita — e o do dono passou a recusar quem não é dono.
 *
 * O QUE CONTINUA FORA DAQUI: editar os campos do canil. Isso é do dono, em
 * `/painel`. O que o admin cadastra nasce rascunho por construção — as RPCs de
 * criação não aceitam `published_at` —, e colocar no ar é sempre uma SEGUNDA
 * ação, com motivo próprio e linha própria no Histórico.
 */
export default async function AdminKennelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criada?: string; cursor?: string }>;
}) {
  const { id } = await params;
  const { criada, cursor } = await searchParams;

  const kennel = await getAdminKennelById(id);
  if (!kennel) notFound();

  const status = kennelStatus(kennel);
  const canToggleHidden = status !== "deleted";
  // Canil excluído não tem onde receber cadastro: a RPC recusa com
  // `no_data_found`. Oferecer o controle já seria o erro — mesma regra que o
  // painel aplica à auto-suspensão.
  const canCreate = status !== "deleted";

  const [owner, litters] = await Promise.all([
    getProfileById(kennel.owner_id),
    listKennelLitters(kennel.id, { cursor }),
  ]);

  const dono = ownerName(kennel.owner) ?? "o dono deste canil";
  // Só confirma o que está REALMENTE na lista: uma URL guardada com `?criada=`
  // de outro dia não pode afirmar que algo acabou de acontecer.
  const recemCriada = criada && litters.items.some((l) => l.id === criada) ? criada : null;

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/admin/canis" label="Canis" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
            Canil · visão do admin
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{kennel.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <FounderBadge number={kennel.founder_number} size="sm" />
            <StatusChip tone={KENNEL_STATUS_TONE[status]}>{KENNEL_STATUS_LABEL[status]}</StatusChip>
          </div>
        </div>

        {canToggleHidden ? (
          <div className="flex flex-wrap items-center gap-3">
            {kennel.founder_number != null ? (
              <FounderNumberDialog
                kennelId={kennel.id}
                name={kennel.name}
                currentNumber={kennel.founder_number}
              />
            ) : null}
            {/*
              Publicar e ocultar convivem porque são coisas DIFERENTES:
              `hidden_at` é moderação (o admin tirou do ar), `published_at` é
              estado editorial (está pronto para o público). Um canil reativado
              mas em rascunho continua invisível.
            */}
            <PublishEntityDialog
              entityType="kennel"
              entityId={kennel.id}
              name={kennel.name}
              isPublished={Boolean(kennel.published_at)}
              ownerName={dono}
            />
            <HideEntityDialog
              entityType="kennel"
              entityId={kennel.id}
              name={kennel.name}
              isHidden={Boolean(kennel.hidden_at)}
            />
          </div>
        ) : (
          <p className="text-fg-faint text-sm">Registro excluído — nada para ocultar.</p>
        )}
      </div>

      <dl className="border-border bg-surface rounded-card divide-border divide-y border">
        <Row label="URL" value={`/c/${kennel.slug}`} mono />
        <Row
          label="Cidade/Estado"
          value={[kennel.city, kennel.state].filter(Boolean).join("/") || "—"}
        />
        <Row label="Descrição" value={kennel.description ?? "—"} />
        <Row label="Site" value={kennel.website_url ?? "—"} mono />
        <Row label="Instagram" value={kennel.instagram_handle ?? "—"} mono />
        <Row label="Registro" value={kennel.registration_number ?? "—"} mono />
        <Row
          label="Dono"
          value={ownerName(kennel.owner) ?? "—"}
          href={`/admin/usuarios/${kennel.owner_id}`}
        />
        <Row label="Cadastrado em" value={formatDateTime(kennel.created_at)} mono />
      </dl>

      {canCreate ? (
        <section className="border-warning-subtle bg-warning-subtle rounded-card flex flex-col gap-4 border p-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-base font-semibold">Cadastrar em nome de {dono}</h2>
            <p className="text-fg-muted text-sm">
              O registro nasce pertencendo ao dono e em rascunho — aparece no painel dele, e ele
              edita normalmente. Colocar no ar é uma segunda decisão, com botão próprio acima. A
              autoria fica sua, e cada ação vai para o Histórico com o motivo que você escrever.
              {owner?.suspended_at
                ? " O dono está suspenso: ele não vai conseguir editar nem publicar enquanto isso durar."
                : ""}
            </p>
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
            {/*
              Tela à parte, e não um campo aqui: o envio do logo pode CONCEDER o
              Selo Criador Fundador, que é irreversível. Uma ação dessas não
              divide espaço com o resto, onde alguém clica de passagem.
            */}
            <Link
              href={`/admin/canis/${kennel.id}/logo`}
              className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm font-medium transition-colors"
            >
              Enviar logo
            </Link>
          </div>
        </section>
      ) : (
        <p className="text-fg-faint text-sm">Canil excluído — não há onde cadastrar.</p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-base font-semibold">Ninhadas</h2>

        {recemCriada ? (
          <p className="border-accent bg-accent-subtle text-fg rounded-card border px-4 py-3 text-sm">
            Ninhada cadastrada. Nasceu rascunho em nome de {dono}, e está destacada na lista
            abaixo.
          </p>
        ) : null}

        {litters.items.length === 0 ? (
          <EmptyState title="Nenhuma ninhada neste canil." />
        ) : (
          <ul className="border-border bg-surface rounded-card divide-border divide-y border">
            {litters.items.map((litter) => (
              <LitterRow key={litter.id} litter={litter} highlight={litter.id === recemCriada} />
            ))}
          </ul>
        )}

        {litters.nextCursor ? (
          <Link
            href={`/admin/canis/${kennel.id}?cursor=${litters.nextCursor}`}
            className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
          >
            Carregar mais
          </Link>
        ) : null}
      </section>

      {status === "published" ? (
        <Link
          href={`/c/${kennel.slug}`}
          target="_blank"
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          Ver perfil público ↗
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Linha da ninhada. NÃO é link, e não é esquecimento: não existe
 * `/admin/ninhadas/[id]` para onde ir — a decisão está registrada no
 * `entityHref` de `admin/format.ts`, que também deixa `litter` de fora.
 */
function LitterRow({ litter, highlight }: { litter: LitterListItem; highlight: boolean }) {
  const status = litterStatus(litter);

  return (
    <li
      className={`flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
        highlight ? "bg-accent-subtle" : ""
      }`}
    >
      <div className="flex flex-col gap-1">
        <p className="text-fg text-sm">{litter.description ?? "Sem descrição"}</p>
        <p className="text-fg-faint font-mono text-xs">
          {litter.public_id}
          {litter.mated_on ? ` · cobrição ${litter.mated_on}` : ""}
          {litter.born_on ? ` · nascimento ${litter.born_on}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {highlight ? <span className="text-fg-muted text-xs">recém-cadastrada</span> : null}
        <StatusChip tone={LITTER_STATUS_TONE[status]}>{LITTER_STATUS_LABEL[status]}</StatusChip>
      </div>
    </li>
  );
}

function Row({
  label,
  value,
  href,
  mono = false,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className={`text-fg text-sm break-all ${mono ? "font-mono" : ""}`}>
        {href ? (
          <Link href={href} className="text-link hover:text-link-hover underline underline-offset-4">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
