import { qrShape, QR_DARK, QR_LIGHT, QR_PNG_DEFAULT, QR_PRINT_MIN_CM } from "@/modules/qr/render";
import { qrTargetUrl, qrTargetWarning, type QrKind } from "@/modules/qr/target";

/**
 * ============================================================================
 * Cartão de QR — prévia na tela e download em resolução de impressão.
 * ============================================================================
 *
 * Server Component. O SVG é montado em JSX a partir da matriz de módulos, sem
 * `dangerouslySetInnerHTML` e sem um byte de JavaScript no cliente.
 *
 * O cartão é BRANCO dentro de uma interface escura, de propósito: o QR precisa
 * ser preto no branco para ler, e o que aparece aqui tem de ser exatamente o que
 * sai na impressora.
 */

export function QrCard({
  kind,
  entityId,
  stableId,
  label,
}: {
  kind: QrKind;
  /** UUID interno — é o que a rota de download recebe. */
  entityId: string;
  /** `public_id` do cão ou `slug` do canil. É o que vai codificado. */
  stableId: string;
  label: string;
}) {
  const url = qrTargetUrl(kind, stableId);
  const { size, path } = qrShape(url);
  const warning = qrTargetWarning(url);
  const base = `/api/qr/${kind}/${entityId}`;

  return (
    <section className="border-border flex flex-col gap-4 border-t pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold">QR Code</h2>
        <p className="text-fg-muted text-sm">{label}</p>
      </div>

      {warning ? (
        <p
          role="status"
          className="border-danger bg-danger-subtle text-fg rounded-control border px-4 py-3 text-sm"
        >
          {warning}
        </p>
      ) : null}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="rounded-card shrink-0 self-start p-3" style={{ backgroundColor: QR_LIGHT }}>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            width={160}
            height={160}
            // Sem isto o navegador suaviza as bordas dos módulos e o código
            // fica com contraste pastoso justamente onde o leitor precisa de
            // transição seca.
            shapeRendering="crispEdges"
            role="img"
            aria-label={`QR Code que aponta para ${url}`}
          >
            <rect width={size} height={size} fill={QR_LIGHT} />
            <path d={path} fill={QR_DARK} />
          </svg>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-fg-faint text-xs">Aponta para</span>
            {/* A URL em texto para o dono CONFERIR antes de mandar imprimir. */}
            <code className="text-fg-muted font-mono text-xs break-all">{url}</code>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`${base}?format=png&size=${QR_PNG_DEFAULT}`}
              download
              className="border-border-strong hover:bg-surface-hover rounded-control focus-visible:outline-ring border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Baixar PNG
            </a>
            <a
              href={`${base}?format=svg`}
              download
              className="border-border-strong hover:bg-surface-hover rounded-control focus-visible:outline-ring border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Baixar SVG
            </a>
          </div>

          <p className="text-fg-faint text-xs">
            PNG de {QR_PNG_DEFAULT}px para uso direto; SVG é vetor e não perde qualidade em nenhum
            tamanho — é o formato para mandar à gráfica. Imprima com no mínimo{" "}
            <strong className="text-fg-muted">{QR_PRINT_MIN_CM} cm</strong> de largura e mantenha a
            margem branca em volta: sem ela o código não lê.
          </p>
        </div>
      </div>
    </section>
  );
}
