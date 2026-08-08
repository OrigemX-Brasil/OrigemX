import { QR_DARK, QR_LIGHT, qrShape } from "@/modules/qr/render";

/**
 * QR de EXEMPLO para a página de captura — mostra o mecanismo, não um cão real.
 *
 * Mesma técnica de `QrCard` (matriz virando um único `<path>`, sem
 * `dangerouslySetInnerHTML`), mas sem os links de download nem o aviso de
 * host: aqui não existe entidade real por trás para baixar ou avisar.
 *
 * A URL codificada é a mesma que aparece no texto — se alguém realmente
 * escanear, cai numa página coerente (`/d/exemplo01ab` não existe de
 * verdade), nunca num endereço que diverge do que promete.
 */
const EXEMPLO_URL = "https://www.origemxbr.com/d/exemplo01ab";

export function ExampleQrCard() {
  const { size, path } = qrShape(EXEMPLO_URL);

  return (
    <div className="border-border bg-surface rounded-card flex flex-col gap-4 border p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-fg text-sm font-medium">QR Code do perfil</h3>
        <span className="text-fg-faint bg-surface-hover rounded-control px-2 py-0.5 font-mono text-[0.65rem] tracking-wide uppercase">
          Exemplo
        </span>
      </div>

      <div className="rounded-card self-start p-3" style={{ backgroundColor: QR_LIGHT }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={128}
          height={128}
          shapeRendering="crispEdges"
          role="img"
          aria-label="QR Code de exemplo, aponta para o perfil público de um cão"
        >
          <rect width={size} height={size} fill={QR_LIGHT} />
          <path d={path} fill={QR_DARK} />
        </svg>
      </div>

      <p className="text-fg-muted text-sm">
        Vai no crachá, no folder, na placa. Aponta pro mesmo endereço pra sempre — trocar o nome do
        cão não quebra o código já impresso.
      </p>
    </div>
  );
}
