import type { Metadata } from "next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_OG_IMAGE, excerpt, publicMetadata, siteUrl } from "./metadata";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

/**
 * `Metadata["twitter"]` é união discriminada pelo próprio `card`, então o
 * TypeScript não deixa lê-lo sem estreitar antes — e estreitar aqui seria
 * assumir a resposta que o teste quer verificar.
 */
function twitterCard(m: Metadata): string | undefined {
  return (m.twitter as { card?: string } | null | undefined)?.card;
}

/** A primeira (e única) imagem do Open Graph, já estreitada para objeto. */
function ogImage(m: Metadata): { url: string; width?: number; height?: number } | undefined {
  const images = m.openGraph?.images as
    | Array<{ url: string; width?: number; height?: number }>
    | undefined;
  return images?.[0];
}

function twitterImages(m: Metadata): string[] {
  const images = (m.twitter as { images?: string[] } | null | undefined)?.images;
  return images ?? [];
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://origemxbr.com";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("siteUrl", () => {
  it("usa a env var — o domínio ainda não foi comprado", () => {
    expect(siteUrl().toString()).toBe("https://origemxbr.com/");
  });

  it("cai para localhost se a env var estiver ausente ou malformada", () => {
    // Env var errada não pode derrubar o build da página inteira.
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteUrl().hostname).toBe("localhost");

    process.env.NEXT_PUBLIC_SITE_URL = "não é uma url";
    expect(siteUrl().hostname).toBe("localhost");
  });
});

describe("excerpt", () => {
  it("colapsa espaço e corta em palavra inteira", () => {
    const longo = `${"palavra ".repeat(40)}fim`;
    const r = excerpt(longo, 50);
    expect(r!.length).toBeLessThanOrEqual(51);
    expect(r!.endsWith("…")).toBe(true);
    // Não corta no meio de uma palavra.
    expect(r).not.toMatch(/pala…$/);
  });

  it("devolve o texto inteiro quando cabe", () => {
    expect(excerpt("Canil Aurora", 160)).toBe("Canil Aurora");
  });

  it("normaliza quebra de linha, que estragaria a prévia", () => {
    expect(excerpt("Canil\n\n  Aurora ")).toBe("Canil Aurora");
  });

  it("devolve null para vazio", () => {
    expect(excerpt(null)).toBeNull();
    expect(excerpt("")).toBeNull();
    expect(excerpt("   ")).toBeNull();
  });
});

describe("publicMetadata", () => {
  const base = { title: "Rex de Aurora", description: "Macho · Pastor Alemão", path: "/d/k7m2x9" };

  it("gera canonical absoluto a partir do path", () => {
    const m = publicMetadata(base);
    expect(m.alternates?.canonical).toBe("https://origemxbr.com/d/k7m2x9");
  });

  it("canonical e og:url apontam para o MESMO endereço", () => {
    // Divergir aqui divide o sinal de SEO entre os dois caminhos.
    const m = publicMetadata(base);
    expect(m.openGraph?.url).toBe(m.alternates?.canonical);
  });

  it("inclui Open Graph em português com nome do site", () => {
    const m = publicMetadata(base);
    expect(m.openGraph?.siteName).toBe("OrigemX");
    expect(m.openGraph?.locale).toBe("pt_BR");
    expect(m.openGraph?.title).toBe(base.title);
  });

  it("com imagem, usa card grande", () => {
    const m = publicMetadata({ ...base, imageUrl: "https://cdn.test/foto.webp" });
    expect(twitterCard(m)).toBe("summary_large_image");
    expect(m.openGraph?.images).toBeDefined();
  });

  it("a URL da foto vai para o Open Graph E para o Twitter", () => {
    const m = publicMetadata({ ...base, imageUrl: "https://cdn.test/foto.webp" });
    expect(ogImage(m)?.url).toBe("https://cdn.test/foto.webp");
    expect(twitterImages(m)).toContain("https://cdn.test/foto.webp");
  });

  /**
   * As dimensões REAIS, e a ausência delas.
   *
   * O helper cravava `1200×1200` para qualquer foto. `og:image:width/height`
   * são dicas que o crawler acredita: anunciar quadrado numa foto 1600×1200
   * faz o WhatsApp cortar o card ou desistir de renderizá-lo. E como
   * `media.width`/`media.height` são NULLABLE (coluna criada depois de já
   * haver mídia gravada), "não sei" precisa sair como AUSÊNCIA de tag, nunca
   * como número inventado.
   */
  it("anuncia a dimensão real da foto, não um quadrado fixo", () => {
    const m = publicMetadata({
      ...base,
      imageUrl: "https://cdn.test/foto.webp",
      imageWidth: 1600,
      imageHeight: 1200,
    });
    expect(ogImage(m)).toMatchObject({ width: 1600, height: 1200 });
  });

  it("sem dimensão conhecida, NÃO emite width/height — o crawler mede sozinho", () => {
    const m = publicMetadata({ ...base, imageUrl: "https://cdn.test/foto.webp" });
    expect(ogImage(m)).not.toHaveProperty("width");
    expect(ogImage(m)).not.toHaveProperty("height");
  });

  it("com apenas UMA das duas dimensões, não emite nenhuma", () => {
    // Meia dimensão não é informação: o crawler precisa da razão de aspecto.
    const so_largura = publicMetadata({
      ...base,
      imageUrl: "https://cdn.test/foto.webp",
      imageWidth: 1600,
    });
    expect(ogImage(so_largura)).not.toHaveProperty("width");

    const so_altura = publicMetadata({
      ...base,
      imageUrl: "https://cdn.test/foto.webp",
      imageHeight: 1200,
    });
    expect(ogImage(so_altura)).not.toHaveProperty("height");
  });

  it("dimensão nula é tratada como desconhecida, não como zero", () => {
    // É literalmente o que vem do banco em linha antiga.
    const m = publicMetadata({
      ...base,
      imageUrl: "https://cdn.test/foto.webp",
      imageWidth: null,
      imageHeight: null,
    });
    expect(ogImage(m)).not.toHaveProperty("width");
  });

  it("sem imagem, cai para a imagem de marca em vez de anunciar imagem quebrada", () => {
    const m = publicMetadata(base);
    expect(twitterCard(m)).toBe("summary_large_image");
    const images = m.openGraph?.images as Array<{ url: string }> | undefined;
    expect(images?.[0]?.url).toBe(DEFAULT_OG_IMAGE.url);
  });

  it("metadataBase acompanha a env var", () => {
    expect(publicMetadata(base).metadataBase?.toString()).toBe("https://origemxbr.com/");
  });
});
