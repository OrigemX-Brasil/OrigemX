"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GalleryUploader } from "@/modules/media/components/gallery-uploader";
import { ImageUploader } from "@/modules/media/components/image-uploader";
import { MAX_GALLERY_ITEMS } from "@/modules/media/constraints";
import type { RegisterAction } from "@/modules/media/upload-one";

import { registerMediaForUser } from "../actions";

import { OnBehalfNotice } from "./on-behalf-notice";

/**
 * ============================================================================
 * Envio de imagem EM NOME DO DONO.
 * ============================================================================
 *
 * O upload em si não muda em nada: o arquivo continua indo do navegador direto
 * para o Storage, comprimido no client, sob o prefixo do DONO (`ownerId`
 * abaixo é o criador, não o admin). O que muda é o passo 3 — quem registra a
 * metadata é `registerMediaForUser`, que deriva o dono da ENTIDADE e grava a
 * linha de auditoria na mesma transação.
 *
 * O MOTIVO ENTRA PELO `FormData`, e é por isso que existe um wrapper em vez de
 * simplesmente passar a ação: `ImageUploader` e `GalleryUploader` montam o
 * `FormData` por dentro e não têm como saber de um campo que não é deles.
 * A closure aqui injeta `reason` logo antes da chamada.
 *
 * E o uploader SÓ APARECE depois que o motivo é válido. Sem isso, o arquivo
 * subiria para o Storage e só então a RPC recusaria por falta de motivo — o
 * `cleanup()` da ação apagaria o órfão, mas a pessoa teria esperado um upload
 * inteiro para receber um erro que dava para prever antes de começar.
 *
 * SEM CONFIRMAÇÃO EM DIÁLOGO, ao contrário dos formulários de cadastro. Enviar
 * imagem é reversível: `deleteMedia` existe, e trocar o logo é um envio novo.
 * O freio proporcional aqui é o motivo obrigatório, não um segundo clique.
 */

const MOTIVO_MINIMO = 3;

function useMotivo() {
  const [reason, setReason] = useState("");
  const valido = reason.trim().length >= MOTIVO_MINIMO;

  /**
   * Recriada a cada render — de propósito. A closure precisa enxergar o valor
   * ATUAL de `reason`; memorizá-la congelaria o motivo digitado no primeiro
   * render e gravaria a auditoria errada.
   */
  const register: RegisterAction = async (prev, fd) => {
    fd.set("reason", reason.trim());
    return registerMediaForUser(prev, fd);
  };

  /**
   * SEM `name`: este campo não pertence a formulário nenhum. Quem leva o motivo
   * ao servidor é a closure `register` acima, e um `name` aqui só convidaria
   * alguém a achar que ele viaja sozinho — foi essa confusão que produziu dois
   * campos de motivo na mesma tela.
   *
   * Vai para dentro do `OnBehalfNotice` pelo slot `reasonField`, e não abaixo
   * dele: o motivo é parte de "estou cadastrando em nome de X", não um campo
   * solto no meio da página.
   */
  const campo = (
    <label className="flex flex-col gap-1.5">
      <span className="text-fg-muted text-xs">Motivo (obrigatório)</span>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Por que este envio está sendo feito por você."
        className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
      />
    </label>
  );

  return { valido, register, campo };
}

/** Espera pelo motivo, com a mesma frase nos dois uploaders. */
function AguardandoMotivo() {
  return <p className="text-fg-faint text-sm">Escreva o motivo acima para liberar o envio.</p>;
}

export function AdminLogoUploader({
  kennelId,
  kennelName,
  ownerId,
  ownerName,
  ownerSuspended,
  temLogo,
  jaTemSelo,
}: {
  kennelId: string;
  kennelName: string;
  /** O DONO do canil — é o prefixo do caminho no Storage, nunca o admin. */
  ownerId: string;
  ownerName: string;
  ownerSuspended: boolean;
  temLogo: boolean;
  jaTemSelo: boolean;
}) {
  const router = useRouter();
  const { valido, register, campo } = useMotivo();

  return (
    <div className="flex flex-col gap-5">
      <OnBehalfNotice
        kennelName={kennelName}
        ownerName={ownerName}
        ownerSuspended={ownerSuspended}
        reasonField={campo}
      >
        A imagem passa a pertencer a {ownerName} e conta no plano de armazenamento dele.
      </OnBehalfNotice>

      {/*
        O aviso do Selo é o ponto mais importante desta tela, e ele é
        irreversível: `kennel_is_founder_eligible` pede nome, cidade, estado,
        LOGO e ao menos um cão — então o logo costuma ser a última peça, e o
        trigger `media_assign_founder` queima um número da sequence no INSERT.
        `kennels_freeze_founder_number` torna isso definitivo: apagar o logo
        depois não devolve o número.
      */}
      {!jaTemSelo ? (
        <p className="border-warning-subtle bg-warning-subtle text-fg rounded-card border px-4 py-3 text-sm">
          <span className="font-medium">Isto pode conceder o Selo Criador Fundador.</span> O logo
          costuma ser o último requisito que falta. Se o canil ficar elegível, um número da
          sequência é consumido na hora — e não volta, nem apagando o logo depois.
        </p>
      ) : null}

      {temLogo ? (
        <p className="text-fg-muted text-sm">
          Este canil já tem logo. Enviar outro substitui o atual — o antigo sai por exclusão lógica,
          na mesma transação.
        </p>
      ) : null}

      {valido ? (
        <ImageUploader
          role="kennel_logo"
          entityId={kennelId}
          ownerId={ownerId}
          registerAction={register}
          label="Logo do canil"
          helpText="Quadrada funciona melhor. Aparece no perfil público."
          onUploaded={() => router.refresh()}
        />
      ) : (
        <AguardandoMotivo />
      )}
    </div>
  );
}

export function AdminGalleryUploader({
  dogId,
  dogName,
  kennelName,
  ownerId,
  ownerName,
  ownerSuspended,
  jaEnviadas,
}: {
  dogId: string;
  dogName: string;
  kennelName?: string;
  ownerId: string;
  ownerName: string;
  ownerSuspended: boolean;
  jaEnviadas: number;
}) {
  const router = useRouter();
  const { valido, register, campo } = useMotivo();
  const restantes = Math.max(0, MAX_GALLERY_ITEMS - jaEnviadas);

  return (
    <div className="flex flex-col gap-5">
      <OnBehalfNotice
        kennelName={kennelName}
        ownerName={ownerName}
        ownerSuspended={ownerSuspended}
        reasonField={campo}
      >
        As fotos de {dogName} passam a pertencer a {ownerName} e contam no plano de armazenamento
        dele.
      </OnBehalfNotice>

      {restantes === 0 ? (
        <p className="text-fg-muted text-sm">
          A galeria já está no limite de {MAX_GALLERY_ITEMS} imagens.
        </p>
      ) : valido ? (
        <GalleryUploader
          entityId={dogId}
          ownerId={ownerId}
          role="dog_gallery"
          remaining={restantes}
          maxItems={MAX_GALLERY_ITEMS}
          registerAction={register}
          onComplete={() => router.refresh()}
        />
      ) : (
        <AguardandoMotivo />
      )}
    </div>
  );
}
