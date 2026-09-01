"use client";

import { isoToBr } from "@/modules/dogs/br-date";
import { LitterForm } from "@/modules/litters/components/litter-form";

import { createLitterForUser } from "../actions";

import { OnBehalfNotice, SummaryItem, validateReason } from "./on-behalf-notice";

/** Data em branco no resumo vira travessão, não string vazia. */
function data(value: FormDataEntryValue | null): string {
  const iso = String(value ?? "");
  return iso ? isoToBr(iso) : "—";
}

/**
 * O admin cadastrando uma ninhada no canil de outra pessoa. Gêmea de
 * `AdminDogForm` — ver o comentário de lá.
 *
 * `LitterForm` já emitia `kennel_id` a partir de uma prop, então aqui não há o
 * equivalente ao `kennelLocked` do cão: ele sempre soube receber um canil de
 * fora.
 */
export function AdminLitterForm({
  kennelId,
  kennelName,
  kennelStatusLabel,
  ownerName,
  ownerSuspended,
  adminId,
}: {
  kennelId: string;
  kennelName: string;
  kennelStatusLabel: string;
  ownerName: string;
  ownerSuspended: boolean;
  adminId: string;
}) {
  return (
    <LitterForm
      kennelId={kennelId}
      ownerId={adminId}
      action={createLitterForUser}
      header={
        <OnBehalfNotice
          kennelName={kennelName}
          ownerName={ownerName}
          ownerSuspended={ownerSuspended}
        >
          A ninhada nasce RASCUNHO e pertencendo a {ownerName} — publicar continua sendo decisão
          dele, e a RPC nem aceita publicar por aqui.
        </OnBehalfNotice>
      }
      confirm={{
        title: "Confirmar cadastro em nome de outra pessoa",
        openLabel: "Revisar e cadastrar",
        confirmLabel: "Confirmar e cadastrar",
        validate: validateReason,
        summary: (formData, parents) => (
          <dl className="border-border bg-bg rounded-card divide-border divide-y border text-sm">
            <SummaryItem label="Canil de destino" value={`${kennelName} · ${kennelStatusLabel}`} />
            <SummaryItem label="Dono" value={ownerName} />
            <SummaryItem label="Cobrição" value={data(formData.get("mated_on"))} />
            <SummaryItem label="Nascimento" value={data(formData.get("born_on"))} />
            <SummaryItem label="Pai" value={parents.sire ?? "—"} />
            <SummaryItem label="Mãe" value={parents.dam ?? "—"} />
            <SummaryItem label="Publicação" value="Rascunho — quem publica é o dono" />
            <SummaryItem label="Motivo" value={String(formData.get("reason") ?? "")} />
          </dl>
        ),
      }}
    />
  );
}
