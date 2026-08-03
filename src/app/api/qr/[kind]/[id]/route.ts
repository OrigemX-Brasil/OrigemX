import { getDogById } from "@/modules/dogs/queries";
import { getKennelById } from "@/modules/kennels/queries";
import { clampPngSize, qrPngFile, qrSvgFile } from "@/modules/qr/render";
import { isQrKind, qrFileName, qrTargetUrl, type QrKind } from "@/modules/qr/target";

/**
 * ============================================================================
 * Download do QR — `/api/qr/{dog|kennel}/{uuid}?format=png|svg&size=1024`
 * ============================================================================
 *
 * ATRÁS DE SESSÃO. `/api/` não está em `PUBLIC_PREFIXES`, então o proxy manda
 * quem não tem sessão para o login. E, ainda assim, quem decide o que aparece é
 * a RLS: as duas consultas abaixo rodam com a sessão do usuário, e um registro
 * que ele não pode ver volta nulo e vira 404.
 *
 * O ID DA URL É O UUID INTERNO, e o identificador estável é buscado no banco.
 * Essa inversão é de propósito: nada que vem da requisição entra no conteúdo
 * codificado. Não dá para usar esta rota como gerador de QR de conteúdo
 * arbitrário hospedado no nosso domínio — a única coisa que o chamador escolhe é
 * QUAL registro, nunca PARA ONDE o código aponta.
 *
 * Roda no servidor, então a página pública não carrega nada da biblioteca.
 */

/** Só uuid. Impede que qualquer texto vire consulta ou nome de arquivo. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Target = { name: string; stableId: string };

async function resolveTarget(kind: QrKind, id: string): Promise<Target | null> {
  if (kind === "dog") {
    const dog = await getDogById(id);
    return dog ? { name: dog.name, stableId: dog.public_id } : null;
  }

  const kennel = await getKennelById(id);
  return kennel ? { name: kennel.name, stableId: kennel.slug } : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;

  if (!isQrKind(kind) || !UUID.test(id)) {
    return new Response("Requisição inválida.", { status: 400 });
  }

  const target = await resolveTarget(kind, id);
  // 404 e não 403: dizer "existe, mas não é seu" já é contar algo.
  if (!target) return new Response("Não encontrado.", { status: 404 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const filename = qrFileName(kind, target.name, target.stableId, format);
  const encoded = qrTargetUrl(kind, target.stableId);

  const headers = {
    // `attachment` porque o destino disto é a pasta de downloads e depois a
    // gráfica, não uma aba do navegador.
    "Content-Disposition": `attachment; filename="${filename}"`,
    // `private`: a resposta passou por autorização e não pode ir para cache
    // compartilhado. O conteúdo em si é determinístico, daí a hora de validade.
    "Cache-Control": "private, max-age=3600",
  };

  if (format === "svg") {
    return new Response(qrSvgFile(encoded), {
      headers: { ...headers, "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  }

  const png = await qrPngFile(encoded, clampPngSize(url.searchParams.get("size")));

  return new Response(new Uint8Array(png), {
    headers: { ...headers, "Content-Type": "image/png" },
  });
}
