"use client";

import { DogForm } from "@/modules/dogs/components/dog-form";

import { createDogForUser } from "../actions";

import { OnBehalfNotice, SummaryItem, validateReason } from "./on-behalf-notice";

/**
 * O admin cadastrando um cão NO CANIL DE OUTRA PESSOA.
 *
 * Ilha cliente, como toda mutação deste módulo — o que muda é que aqui ela não
 * é um diálogo solto: ela injeta a ação, o aviso e a confirmação no MESMO
 * `DogForm` que o dono usa.
 *
 * Reusar o formulário é o requisito, e não é economia de código: um segundo
 * formulário aceitaria o que o do dono recusa, e produziria registro que o dono
 * não conseguiria reeditar — o mesmo argumento que `createDogForUser` já faz
 * para reusar `validateDog`.
 *
 * É AQUI que a ação entra, e não numa tabela dentro de `DogForm`: este arquivo
 * já é client, então `createDogForUser` é só uma referência dentro do bundle —
 * nada atravessa a fronteira RSC — e `dogs` continua sem conhecer `admin`.
 */
export function AdminDogForm({
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
  /** Sessão do ADMIN. Vai para o `ParentPicker`, que só usa isto como prefixo
   *  de caminho no Storage da foto de um fantasma — quem faz o upload é ele. */
  adminId: string;
}) {
  return (
    <DogForm
      kennel={{ id: kennelId, name: kennelName }}
      kennelLocked
      ownerId={adminId}
      action={createDogForUser}
      header={
        <OnBehalfNotice
          kennelName={kennelName}
          ownerName={ownerName}
          ownerSuspended={ownerSuspended}
        >
          O cão nasce pertencendo a {ownerName}: aparece no painel dele, e publicar continua sendo
          decisão dele.
        </OnBehalfNotice>
      }
      confirm={{
        title: "Confirmar cadastro em nome de outra pessoa",
        openLabel: "Revisar e cadastrar",
        confirmLabel: "Confirmar e cadastrar",
        validate: validateReason,
        summary: (data, parents) => (
          <dl className="border-border bg-bg rounded-card divide-border divide-y border text-sm">
            <SummaryItem label="Cão" value={String(data.get("name") ?? "") || "—"} />
            <SummaryItem label="Sexo" value={data.get("sex") === "female" ? "Fêmea" : "Macho"} />
            <SummaryItem label="Canil de destino" value={`${kennelName} · ${kennelStatusLabel}`} />
            <SummaryItem label="Dono" value={ownerName} />
            <SummaryItem label="Pai" value={parents.sire ?? "—"} />
            <SummaryItem label="Mãe" value={parents.dam ?? "—"} />
            <SummaryItem label="Motivo" value={String(data.get("reason") ?? "")} />
          </dl>
        ),
      }}
    />
  );
}
