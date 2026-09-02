import type { ReactNode } from "react";

/**
 * O aviso que impede o engano que dá nome a esta tela: o admin achar que está
 * cadastrando para si.
 *
 * Caixa de AVISO (`warning`), não de contexto (`accent`), no molde do aviso de
 * troca de slug em `kennels/components/kennel-form.tsx` — o único outro lugar
 * do projeto onde uma ação legítima precisa de um freio antes de acontecer.
 *
 * Renderiza DENTRO do `<form>` (chega pelo slot `header`), então o campo de
 * motivo daqui entra no `FormData` junto com o resto — é o mesmo envio, não um
 * segundo formulário.
 *
 * ...EXCETO nas telas de MÍDIA, e é essa exceção que a prop `reasonField`
 * existe para resolver. Ali não há `<form>`: o envio é feito por
 * `uploadOneImage`, que monta o próprio `FormData`. Um `<textarea name="reason">`
 * solto naquele contexto é campo INERTE — o valor não vai a lugar nenhum. Foi
 * assim que a tela de logo acabou pedindo o motivo duas vezes: este campo, que
 * não fazia nada, e o controlado do uploader, que é quem de fato alimenta a RPC.
 */
export function OnBehalfNotice({
  kennelName,
  ownerName,
  ownerSuspended,
  reasonField,
  children,
}: {
  /**
   * Ausente no cadastro de CANIL, e a ausência é literal: ali o canil ainda não
   * existe, então não há nome a citar. Nos demais cadastros o canil de destino
   * é a informação que evita o engano, e some da frase se não vier.
   */
  kennelName?: string;
  ownerName: string;
  ownerSuspended: boolean;
  /**
   * Substitui o campo de motivo padrão. Quem envia MÍDIA passa o próprio campo
   * controlado por aqui — ver o comentário acima. Ausente, o padrão não-
   * controlado continua valendo, e as telas de formulário não mudam em nada.
   */
  reasonField?: ReactNode;
  /** A frase específica do que está sendo cadastrado (canil, cão ou ninhada). */
  children: ReactNode;
}) {
  return (
    <div className="border-warning-subtle bg-warning-subtle rounded-card flex flex-col gap-4 border p-5">
      <div className="flex flex-col gap-1">
        <p className="text-fg text-sm font-medium">
          Você está cadastrando em nome de {ownerName}
          {kennelName ? `, no ${kennelName}` : ""}.
        </p>
        <p className="text-fg-muted text-sm">
          {children} A autoria fica registrada como sua, e esta criação vai para o Histórico com o
          motivo que você escrever.
        </p>
        {ownerSuspended ? (
          <p className="text-fg-muted text-sm">
            <span className="text-fg font-medium">O dono está suspenso.</span> O cadastro funciona,
            mas ele não vai conseguir editar nem publicar enquanto a suspensão durar.
          </p>
        ) : null}
      </div>

      {reasonField ?? (
        <label className="flex flex-col gap-1.5">
          <span className="text-fg-muted text-xs">Motivo (obrigatório)</span>
          <textarea
            name="reason"
            rows={2}
            minLength={3}
            placeholder="Por que este cadastro está sendo feito por você."
            className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
          />
        </label>
      )}
    </div>
  );
}

/** Uma linha do resumo da confirmação. */
export function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-fg-muted shrink-0">{label}</dt>
      <dd className="text-fg sm:text-right">{value}</dd>
    </div>
  );
}

/** O motivo é obrigatório nos dois formulários — a regra vive num lugar só. */
export function validateReason(data: FormData): string | null {
  return String(data.get("reason") ?? "").trim().length < 3
    ? "Descreva o motivo do cadastro (mínimo 3 caracteres)."
    : null;
}
