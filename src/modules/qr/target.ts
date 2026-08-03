import { siteUrl } from "@/modules/public/metadata";

/**
 * ============================================================================
 * O que o QR aponta — e por que isso nunca quebra.
 * ============================================================================
 *
 * Um QR impresso é o único artefato deste produto que não dá para corrigir
 * depois. Ele vai para crachá, folder e placa de estande; quando o criador troca
 * o nome do cão, o papel já está na mão de alguém.
 *
 * Por isso o conteúdo codificado usa SÓ identificador ESTÁVEL:
 *
 * - cão   → `/d/{public_id}` — `public_id` é imutável, com trigger
 *   `dogs_freeze_public_id` no banco recusando qualquer UPDATE. Não é uma
 *   convenção que alguém pode esquecer: é impossível de mudar pela aplicação.
 *
 * - canil → `/c/{slug}` — único global, e **não é liberado nem por exclusão
 *   lógica**. Um canil apagado continua ocupando o slug justamente para o QR
 *   impresso não passar a resolver o canil de outra pessoa.
 *
 * Nada editável entra aqui. Nome, raça e foto podem mudar à vontade: a URL não
 * muda, e o que o visitante encontra é sempre a versão atual do registro.
 */

export type QrKind = "dog" | "kennel";

/**
 * O caminho de cada tipo. Uma função por tipo, em vez de concatenação espalhada
 * pelas telas — se o formato da URL pública mudar um dia, muda aqui e o QR novo
 * acompanha. (O antigo continua funcionando: quem muda rota pública é obrigado a
 * manter redirecionamento, senão o papel impresso morre.)
 */
const QR_PATH: Record<QrKind, (id: string) => string> = {
  dog: (publicId) => `/d/${publicId}`,
  kennel: (slug) => `/c/${slug}`,
};

export const QR_KIND_LABEL: Record<QrKind, string> = {
  dog: "cão",
  kennel: "canil",
};

export function isQrKind(value: string): value is QrKind {
  return value === "dog" || value === "kennel";
}

/** Caminho relativo, sem host. */
export function qrTargetPath(kind: QrKind, id: string): string {
  return QR_PATH[kind](id);
}

/**
 * A URL absoluta que vai dentro do QR.
 *
 * A base vem de `NEXT_PUBLIC_SITE_URL`, a mesma env var do canonical e do Open
 * Graph — o QR e o `<link rel="canonical">` apontando para hosts diferentes
 * seria um bug difícil de notar e caro de descobrir.
 */
export function qrTargetUrl(kind: QrKind, id: string): string {
  return new URL(qrTargetPath(kind, id), siteUrl()).toString();
}

/**
 * Host que não serve para material impresso.
 *
 * Cobre loopback, `.local` do mDNS, faixas privadas de IPv4 e nome sem ponto
 * (`http://servidor:3000`), que só resolve dentro da rede de quem gerou.
 */
function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (h === "localhost" || h === "::1" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local")) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;

  return !h.includes(".");
}

/**
 * O aviso que evita 500 crachás inúteis.
 *
 * Sem isto, gerar QR num ambiente de desenvolvimento produz um código que aponta
 * para `http://localhost:3000` — que escaneia perfeitamente na máquina de quem
 * gerou, some no celular de qualquer outra pessoa, e só dá as caras depois da
 * gráfica ter entregado.
 *
 * Devolve `null` quando a URL serve para imprimir.
 */
export function qrTargetWarning(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Endereço do site inválido. Este QR não vai funcionar.";
  }

  if (isLocalHost(parsed.hostname)) {
    return `Este QR aponta para ${parsed.host}, que só existe nesta máquina. NÃO envie para impressão — configure NEXT_PUBLIC_SITE_URL com o domínio real.`;
  }

  if (parsed.protocol !== "https:") {
    return `Este QR aponta para ${parsed.protocol}//, sem HTTPS. Alguns leitores avisam sobre site não seguro antes de abrir.`;
  }

  return null;
}

/**
 * Nome do arquivo baixado.
 *
 * Leva o nome do registro para a pessoa achar o arquivo depois, e o
 * identificador estável para conferir, ao mandar para a gráfica, que aquele
 * arquivo é daquele cão. Com dez cães na pasta de downloads,
 * `qrcode(3).png` não diz nada.
 */
export function qrFileName(kind: QrKind, name: string, id: string, format: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  const parts = ["origemx", kind === "dog" ? "cao" : "canil", slug, id].filter(Boolean);
  return `${parts.join("-")}.${format}`;
}
