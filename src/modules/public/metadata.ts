import type { Metadata } from "next";

/**
 * Base de URL das páginas públicas.
 *
 * O domínio será origemxbr.com e ainda não foi comprado — por isso vem de env
 * var. Trocar é mexer em `NEXT_PUBLIC_SITE_URL`, zero código.
 */
export function siteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    return new URL(raw);
  } catch {
    // Env var malformada não pode derrubar o build da página inteira.
    return new URL("http://localhost:3000");
  }
}

/**
 * Imagem de card quando não há foto real (canil/cão sem foto, ou página sem
 * `imageUrl` — home, por exemplo). Arquivo estático do build: nunca quebra,
 * ao contrário de uma foto que dependeria do Storage estar de pé.
 */
export const DEFAULT_OG_IMAGE = { url: "/brand/preview.jpg", width: 1536, height: 864 };

/**
 * Monta title, description, canonical, Open Graph e Twitter card de uma vez.
 *
 * O CANONICAL importa mais do que parece: o cão é alcançável por
 * `/d/<public_id>` e, no futuro, também por `/c/<canil>/<slug>`. Sem canônico,
 * o sinal de SEO se divide entre os caminhos e nenhum deles ranqueia. O
 * canônico é sempre o identificador ESTÁVEL — o mesmo que vai no QR impresso.
 */
export function publicMetadata({
  title,
  description,
  path,
  imageUrl,
  imageAlt,
  type = "website",
}: {
  title: string;
  description: string;
  /** Caminho canônico, começando com barra. */
  path: string;
  imageUrl?: string | null;
  imageAlt?: string;
  type?: "website" | "profile" | "article";
}): Metadata {
  const base = siteUrl();
  const url = new URL(path, base).toString();

  // Foto real quando existe; senão a imagem de marca — nunca sem imagem
  // nenhuma, `DEFAULT_OG_IMAGE` é estática e não tem como quebrar.
  const images = imageUrl
    ? [{ url: imageUrl, alt: imageAlt ?? title, width: 1200, height: 1200 }]
    : [
        {
          url: DEFAULT_OG_IMAGE.url,
          alt: imageAlt ?? title,
          width: DEFAULT_OG_IMAGE.width,
          height: DEFAULT_OG_IMAGE.height,
        },
      ];

  return {
    metadataBase: base,
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      title,
      description,
      siteName: "OrigemX",
      locale: "pt_BR",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((i) => i.url),
    },
  };
}

/** Corta a descrição em limite seguro para prévia, sem cortar palavra ao meio. */
export function excerpt(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return null;
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(" ", max - 1))}…`;
}
