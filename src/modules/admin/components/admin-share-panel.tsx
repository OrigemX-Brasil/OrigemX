import { ShareButton } from "@/components/share-button";
import { QrCard } from "@/modules/qr/components/qr-card";
import { QrDialog } from "@/modules/qr/components/qr-dialog";
import { qrTargetUrl, type QrKind } from "@/modules/qr/target";

/**
 * ============================================================================
 * Compartilhar o perfil de um criador, pelo painel administrativo.
 * ============================================================================
 *
 * NENHUMA PERMISSÃO NOVA. `/api/qr/{kind}/{uuid}` resolve o identificador
 * estável sob a RLS de quem chama, e `dogs_select`/`kennels_select` já têm ramo
 * de admin — então um admin sempre pôde gerar este QR. O que faltava era o
 * botão. Não há rota, policy nem consulta nova aqui.
 *
 * SERVER COMPONENT, e ele só compõe. As duas ilhas de cliente são o
 * `ShareButton` (precisa de `navigator`) e o `QrDialog` (precisa de `ref`); o
 * QR em si é renderizado no servidor e entra no diálogo como `children`, que é
 * o que mantém a biblioteca de geração fora do bundle.
 *
 * NÃO REUSA `DogSharePanel`. Aquele fala do criador para o cliente dele ("em
 * vez de responder as mesmas perguntas a cada interessado"); aqui quem
 * compartilha é um terceiro, sobre o perfil de outra pessoa. Mesmo miolo,
 * moldura diferente — reusar o texto seria mentir sobre quem está falando.
 *
 * RASCUNHO, OCULTO E EXCLUÍDO recebem AVISO, não bloqueio. A página pública dá
 * 404 enquanto o registro não está no ar, mas o que o QR codifica é permanente:
 * `kennels_slug_key` é único global e não é liberado nem por exclusão lógica, e
 * `dogs.public_id` é imutável por trigger. O código gerado hoje continua válido
 * quando o criador publicar — é a mesma razão pela qual o painel do dono já
 * mostra o QR do canil em rascunho.
 */
export function AdminSharePanel({
  kind,
  entityId,
  stableId,
  name,
  ownerName,
  statusLabel,
  isLive,
}: {
  kind: QrKind;
  /** UUID interno — é o que a rota de download recebe. */
  entityId: string;
  /** `public_id` do cão ou `slug` do canil. É o que vai codificado. */
  stableId: string;
  name: string;
  ownerName: string;
  /** "Rascunho", "Oculto", "Excluído"… — vem de `admin/status.ts`. */
  statusLabel: string;
  /** A página pública responde agora? Decide entre aviso e frase de valor. */
  isLive: boolean;
}) {
  const publicUrl = qrTargetUrl(kind, stableId);
  const oQue = kind === "dog" ? "o cão" : "o canil";

  return (
    <section className="border-accent/40 bg-accent-subtle rounded-card flex flex-col gap-4 border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold tracking-tight">Compartilhar</h2>
        <p className="text-fg-muted max-w-prose text-sm">
          O link e o QR abrem a página pública de {name}, de {ownerName}. Servem para divulgar{" "}
          {oQue} em feira, crachá ou conversa — o QR baixa em resolução de impressão.
        </p>
      </div>

      {!isLive ? (
        <p
          role="status"
          className="border-warning-subtle bg-warning-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          <span className="font-medium">{statusLabel}.</span> A página ainda não responde para quem
          abrir — quem receber o link agora vê um erro. O endereço codificado é definitivo, então
          este mesmo QR passa a funcionar assim que o registro entrar no ar.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <ShareButton title={name} url={publicUrl} />
        <QrDialog label={`QR Code de ${name}`}>
          <QrCard
            kind={kind}
            entityId={entityId}
            stableId={stableId}
            label={
              kind === "dog"
                ? "Aponta para o perfil público do cão. Codifica o identificador permanente — trocar o nome não quebra o que já foi impresso."
                : "Aponta para o perfil público do canil. Codifica o endereço, que é reservado para sempre — trocar o nome do canil não quebra o que já foi impresso."
            }
          />
        </QrDialog>
      </div>

      {/* O endereço em texto é o terceiro degrau da cascata do `ShareButton`:
          compartilhamento nativo e área de transferência exigem contexto
          seguro, e quando os dois falham é daqui que a pessoa copia. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-fg-faint text-xs">Endereço público</span>
        <input
          type="text"
          readOnly
          value={publicUrl}
          aria-label={`Endereço público de ${name}`}
          className="border-border-strong bg-bg text-fg-muted rounded-control focus-visible:border-accent w-full border px-3 py-2 font-mono text-xs outline-none transition-colors"
        />
      </div>
    </section>
  );
}
