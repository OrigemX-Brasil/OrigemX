import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { StatusChip } from "@/modules/admin/components/status-chip";
import { formatDateTime } from "@/modules/admin/format";
import { getAdminDogById, kennelName, ownerName } from "@/modules/admin/queries";
import { DOG_STATUS_LABEL, DOG_STATUS_TONE, dogStatus } from "@/modules/admin/status";

export const metadata: Metadata = { title: "Cão cadastrado — Admin" };

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

/**
 * Confirmação do cadastro feito EM NOME DO DONO.
 *
 * Segmento `criado`, e não `pronto`, de propósito: `/painel/caes/[id]/pronto`
 * renderiza `DogCreated`, que traz botão de PUBLICAR e o cartão de QR. Nenhuma
 * das duas coisas é do admin — publicar é decisão do dono, e o QR é material
 * que ele imprime. Rotas distintas tornam as duas telas impossíveis de
 * confundir num link ou numa busca.
 *
 * O que esta tela faz é o que foi pedido: mostrar o registro criado e o
 * caminho para ele.
 */
export default async function AdminDogCreatedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const dog = await getAdminDogById(id);
  if (!dog) notFound();

  const status = dogStatus(dog);
  const dono = ownerName(dog.owner) ?? "o dono";

  return (
    <div className="flex flex-col gap-8">
      <BackLink
        href={dog.kennel_id ? `/admin/canis/${dog.kennel_id}` : "/admin/caes"}
        label={kennelName(dog.kennel) ?? "Cães"}
      />

      <div className="flex flex-col gap-2">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
          Cadastro em nome do dono
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cão cadastrado</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={DOG_STATUS_TONE[status]}>{DOG_STATUS_LABEL[status]}</StatusChip>
          <span className="text-fg-faint font-mono text-xs">{dog.public_id}</span>
        </div>
      </div>

      <p className="border-accent bg-accent-subtle text-fg rounded-card border px-4 py-3 text-sm">
        Cadastrado em nome de {dono}. O registro é dele — aparece no painel dele, e publicar
        continua sendo decisão dele. A criação ficou no Histórico, com o motivo que você escreveu.
      </p>

      <dl className="border-border bg-surface rounded-card divide-border divide-y border">
        <Row label="Nome" value={dog.name} />
        <Row label="Sexo" value={SEX_LABEL[dog.sex] ?? dog.sex} />
        <Row label="Nascimento" value={dog.born_on ?? "—"} mono />
        <Row label="Raça" value={dog.breed ?? "—"} />
        <Row
          label="Canil"
          value={kennelName(dog.kennel) ?? "—"}
          href={dog.kennel_id ? `/admin/canis/${dog.kennel_id}` : undefined}
        />
        <Row
          label="Dono"
          value={dono}
          href={dog.owner_id ? `/admin/usuarios/${dog.owner_id}` : undefined}
        />
        <Row label="Cadastrado em" value={formatDateTime(dog.created_at)} mono />
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        {dog.kennel_id ? (
          <Link
            href={`/admin/canis/${dog.kennel_id}/caes/novo`}
            className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Cadastrar outro neste canil
          </Link>
        ) : null}

        <Link
          href={`/admin/caes/${dog.id}`}
          className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2.5 text-sm font-medium transition-colors"
        >
          Ver o registro no admin
        </Link>

        {dog.kennel_id ? (
          <Link
            href={`/admin/canis/${dog.kennel_id}`}
            className="text-fg-muted hover:text-fg px-2 py-2.5 text-sm transition-colors"
          >
            Voltar ao canil
          </Link>
        ) : null}
      </div>
    </div>
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
          <Link
            href={href}
            className="text-link hover:text-link-hover underline underline-offset-4"
          >
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
