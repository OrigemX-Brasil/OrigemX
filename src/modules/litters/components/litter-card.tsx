import Image from "next/image";
import Link from "next/link";

import { previewDescription } from "../constraints";
import { kennelLitterStatusLabel } from "../fields";
import type { LitterListItem } from "../queries";

/**
 * Card SOMENTE-LEITURA da lista de ninhadas, na tela do canil. Nada de
 * formulário, upload ou publish aqui — isso mora na página própria da
 * ninhada. É o que mantém a tela do canil do mesmo tamanho não importa
 * quantas ninhadas existam.
 */
export function LitterCard({ kennelId, litter }: { kennelId: string; litter: LitterListItem }) {
  const preview = previewDescription(litter.description);
  // Rótulo de `LITTER_STATUS_OPTIONS`, e não de `modules/admin/status.ts`:
  // aquele é o vocabulário da tela de admin, este é o que o criador escolheu
  // no próprio formulário. Duas listas dizendo a mesma coisa divergiriam.
  const status = kennelLitterStatusLabel(litter.status);

  return (
    <Link
      href={`/painel/canis/${kennelId}/ninhadas/${litter.id}`}
      className="border-border bg-surface hover:bg-surface-hover rounded-card flex gap-4 border p-4 transition-colors"
    >
      <div className="bg-surface-hover rounded-control text-fg-faint flex size-20 shrink-0 items-center justify-center overflow-hidden">
        {litter.cover?.thumbUrl ? (
          <Image
            src={litter.cover.thumbUrl}
            alt=""
            width={80}
            height={80}
            className="size-20 object-cover"
            unoptimized
          />
        ) : (
          <span className="text-[11px]">Sem foto</span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        {/* Mesmo texto neutro que a lista de cães já usa para Publicado/Rascunho
            — sem cor distinguindo os dois, o rótulo já diz o que é. */}
        <span className="text-fg-faint text-xs">
          {litter.published_at ? "Publicada" : "Rascunho"}
          {status ? ` · ${status}` : ""}
        </span>
        {litter.name ? (
          <p className="text-fg truncate text-sm font-medium">{litter.name}</p>
        ) : null}
        {litter.breed ? <p className="text-fg-muted text-xs">{litter.breed}</p> : null}
        <p className="text-fg-muted text-sm">
          {preview ?? <span className="text-fg-faint italic">Sem descrição ainda</span>}
        </p>
      </div>
    </Link>
  );
}
