import type { ReactNode } from "react";

import { ShareButton } from "@/components/share-button";
import { QrDialog } from "@/modules/qr/components/qr-dialog";

/**
 * ============================================================================
 * Compartilhar: a ação principal do perfil do cão no painel do dono.
 * ============================================================================
 *
 * O QUE ELA RESOLVE: até aqui a página não tinha ação de compartilhar nenhuma.
 * A URL aparecia em três lugares — como texto sob o título, dentro do `QrCard`
 * e no link "Ver a página pública" —, e nenhum deles era um botão: o criador
 * tinha de copiar da barra de endereço.
 *
 * SERVER COMPONENT. Ele só compõe: as duas ilhas de cliente são o
 * `ShareButton` (precisa de `navigator`) e o `QrDialog` (precisa de `ref`). O
 * QR em si chega como `children` e continua sendo renderizado no servidor.
 *
 * SÓ APARECE COM O CÃO PUBLICADO, e quem decide isso é a página. Em rascunho
 * `/d/{public_id}` dá 404 para quem abrir, então um botão aqui entregaria link
 * quebrado — e para um rascunho a ação principal realmente é publicar, que é o
 * que o `PublishToggle` logo abaixo oferece. Ancestral fantasma fica de fora
 * pela mesma condição, sem precisar de regra própria: ele nasce sem
 * `published_at`.
 */
export function DogSharePanel({
  name,
  publicUrl,
  qr,
}: {
  name: string;
  /** Absoluta, vinda de `qrTargetUrl` — a mesma que o QR codifica. */
  publicUrl: string;
  /** O `QrCard` já renderizado no servidor. Ver `QrDialog`. */
  qr: ReactNode;
}) {
  return (
    <section className="border-accent/40 bg-accent-subtle rounded-card flex flex-col gap-4 border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold tracking-tight">Compartilhar</h2>
        {/* A MENSAGEM DE VALOR, não uma instrução. O criador já sabe o que é um
            link; o que ele não tem em mente é que a página responde sozinha o
            que ele responde no WhatsApp dez vezes por semana. */}
        <p className="text-fg-muted max-w-prose text-sm">
          Em vez de responder as mesmas perguntas a cada interessado, envie o link: pedigree, fotos
          e saúde já estão lá.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <ShareButton title={name} url={publicUrl} />
        <QrDialog label={`QR Code de ${name}`}>{qr}</QrDialog>
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
