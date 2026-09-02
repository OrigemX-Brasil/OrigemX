"use client";

import { KennelForm } from "@/modules/kennels/components/kennel-form";

import { createKennelForUser } from "../actions";

import { OnBehalfNotice, SummaryItem, validateReason } from "./on-behalf-notice";

/**
 * O admin cadastrando o CANIL de outra pessoa.
 *
 * Mesmo desenho de `AdminDogForm`: injeta ação, aviso e confirmação no MESMO
 * `KennelForm` que o dono usa, em vez de duplicar o formulário. Um segundo
 * formulário aceitaria o que o do dono recusa e produziria um canil que o dono
 * não conseguiria reeditar.
 *
 * É AQUI que a ação entra, e não numa tabela dentro de `KennelForm`: este
 * arquivo já é client, então `createKennelForUser` é só uma referência dentro
 * do bundle — nada atravessa a fronteira RSC — e `kennels` continua sem
 * conhecer `admin`.
 *
 * SEM `kennelName` no aviso: o canil é justamente o que ainda não existe.
 */
export function AdminKennelForm({
  ownerId,
  ownerName,
  ownerSuspended,
}: {
  ownerId: string;
  ownerName: string;
  ownerSuspended: boolean;
}) {
  return (
    <KennelForm
      action={createKennelForUser}
      header={
        <>
          {/*
            O destino vai por campo escondido porque o `KennelForm` não tem
            (nem deve ter) noção de "dono de destino" — para ele isto é só mais
            um campo do envio. `createKennelForUser` o lê com `readId`, e a RPC
            NÃO aceita dono por parâmetro em nenhum outro lugar: `owner_id` do
            canil sai deste id, e `created_by` sai da sessão.
          */}
          <input type="hidden" name="owner_id" value={ownerId} />
          <OnBehalfNotice ownerName={ownerName} ownerSuspended={ownerSuspended}>
            O canil nasce pertencendo a {ownerName} e em rascunho: ele aparece no painel dele, e
            colocar no ar é uma segunda decisão, registrada à parte.
          </OnBehalfNotice>
        </>
      }
      confirm={{
        title: "Confirmar cadastro em nome de outra pessoa",
        openLabel: "Revisar e cadastrar",
        confirmLabel: "Confirmar e cadastrar",
        validate: validateReason,
        summary: (data) => (
          <dl className="border-border bg-bg rounded-card divide-border divide-y border text-sm">
            <SummaryItem label="Canil" value={String(data.get("name") ?? "") || "—"} />
            {/*
              O endereço é a linha mais importante deste resumo, e por isso vem
              logo depois do nome: `kennels_slug_key` é único GLOBAL e não
              parcial por `deleted_at`, então este endereço fica queimado para
              sempre — nem excluir o canil o devolve. O admin está escolhendo a
              URL pública definitiva de outra pessoa.
            */}
            <SummaryItem
              label="Endereço (definitivo)"
              value={`/c/${String(data.get("slug") ?? "") || "—"}`}
            />
            <SummaryItem label="Dono" value={ownerName} />
            <SummaryItem
              label="Cidade/Estado"
              value={
                [data.get("city"), data.get("state")].filter(Boolean).join("/") || "—"
              }
            />
            <SummaryItem label="Motivo" value={String(data.get("reason") ?? "")} />
          </dl>
        ),
      }}
    />
  );
}
