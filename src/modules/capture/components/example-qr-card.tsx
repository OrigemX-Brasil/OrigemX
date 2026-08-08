import Link from "next/link";

import { EXAMPLE_DOG_PATH, EXAMPLE_DOG_URL } from "@/modules/capture/example-dog";
import { QR_DARK, QR_LIGHT, qrShape } from "@/modules/qr/render";

/**
 * QR de EXEMPLO para a página de captura — mostra o mecanismo com um cão
 * real por trás (ver `example-dog.ts`), não um endereço de mentira.
 *
 * Mesma técnica de `QrCard` (matriz virando um único `<path>`, sem
 * `dangerouslySetInnerHTML`), mas sem os links de download nem o aviso de
 * host: aqui a entidade é fixa, não escolhida pelo dono de um canil.
 *
 * O card inteiro é o link — clicar leva pro mesmo endereço que o QR codifica,
 * então não existe divergência entre "o que promete" e "pra onde vai".
 */
export function ExampleQrCard() {
  const { size, path } = qrShape(EXAMPLE_DOG_URL);

  return (
    <Link
      href={EXAMPLE_DOG_PATH}
      className="border-border bg-surface hover:bg-surface-hover rounded-card focus-visible:outline-ring flex flex-col gap-4 border p-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
    >
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

      <span className="text-link text-sm font-medium">Ver perfil completo →</span>
    </Link>
  );
}
