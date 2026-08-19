import { describe, expect, it } from "vitest";

import { whatsappHref } from "./contact";

const BASE = {
  publicId: "g9yyydmux7qf",
  bornOn: null,
  matedOn: null,
  siteUrl: "https://origemx.app",
};

/** Decodifica o `text=` para afirmar sobre a mensagem, não sobre o escape. */
function textoDe(href: string): string {
  return decodeURIComponent(new URL(href).searchParams.get("text") ?? "");
}

describe("whatsappHref — quando NÃO existe botão", () => {
  it("sem telefone devolve null", () => {
    expect(whatsappHref({ ...BASE, phone: null })).toBeNull();
    expect(whatsappHref({ ...BASE, phone: undefined })).toBeNull();
    expect(whatsappHref({ ...BASE, phone: "" })).toBeNull();
  });

  it("telefone malformado devolve null, não um wa.me quebrado", () => {
    // Curto demais, longo demais e sem dígito nenhum. O CHECK do banco já
    // barraria, mas a função não depende disso: o pior resultado possível é
    // um botão que o visitante clica e não leva a lugar nenhum.
    expect(whatsappHref({ ...BASE, phone: "12345" })).toBeNull();
    expect(whatsappHref({ ...BASE, phone: "1".repeat(16) })).toBeNull();
    expect(whatsappHref({ ...BASE, phone: "sem número" })).toBeNull();
  });
});

describe("whatsappHref — o link", () => {
  it("aponta para wa.me com o telefone em dígitos", () => {
    const href = whatsappHref({ ...BASE, phone: "5511987654321" })!;
    expect(href.startsWith("https://wa.me/5511987654321?text=")).toBe(true);
  });

  it("normaliza telefone com máscara — o formato canônico é do banco, não do digitador", () => {
    const comMascara = whatsappHref({ ...BASE, phone: "+55 (11) 98765-4321" })!;
    const semMascara = whatsappHref({ ...BASE, phone: "5511987654321" })!;
    expect(comMascara).toBe(semMascara);
  });

  it("a mensagem é codificada — acento e espaço não quebram a URL", () => {
    const href = whatsappHref({ ...BASE, phone: "5511987654321" })!;
    // Se não estivesse codificada, `new URL` não devolveria o texto inteiro.
    expect(textoDe(href)).toContain("Olá!");
    expect(href).not.toContain(" ");
  });

  it("monta o link da ninhada a partir do siteUrl", () => {
    const href = whatsappHref({ ...BASE, phone: "5511987654321" })!;
    expect(textoDe(href)).toContain("https://origemx.app/n/g9yyydmux7qf");
  });

  it("siteUrl com barra final não produz barra dupla", () => {
    const href = whatsappHref({ ...BASE, phone: "5511987654321", siteUrl: "https://origemx.app/" })!;
    expect(textoDe(href)).toContain("https://origemx.app/n/g9yyydmux7qf");
    expect(textoDe(href)).not.toContain("//n/");
  });
});

describe("whatsappHref — as três formas da mensagem", () => {
  it("nascida: usa a data de nascimento", () => {
    const href = whatsappHref({ ...BASE, phone: "5511987654321", bornOn: "2026-08-15" })!;
    expect(textoDe(href)).toContain("ninhada nascida em 15/08/2026");
  });

  it("ainda não nascida: usa a previsão calculada da cobrição", () => {
    // 01/06 + 63 dias = 03/08 — o mesmo `expectedWhelpingDate` do cabeçalho da
    // página, para as duas telas nunca mostrarem datas diferentes.
    const href = whatsappHref({ ...BASE, phone: "5511987654321", matedOn: "2026-06-01" })!;
    expect(textoDe(href)).toContain("ninhada prevista para 03/08/2026");
  });

  it("nascimento tem precedência sobre a previsão", () => {
    const href = whatsappHref({
      ...BASE,
      phone: "5511987654321",
      bornOn: "2026-08-15",
      matedOn: "2026-06-01",
    })!;
    const texto = textoDe(href);
    expect(texto).toContain("nascida em 15/08/2026");
    expect(texto).not.toContain("prevista para");
  });

  it("sem data nenhuma: o link sozinho identifica", () => {
    const texto = textoDe(whatsappHref({ ...BASE, phone: "5511987654321" })!);
    expect(texto).toContain("Tenho interesse nesta ninhada");
    expect(texto).toContain("/n/g9yyydmux7qf");
  });

  it("toda forma termina com 'no OrigemX.'", () => {
    const casos = [
      { ...BASE, phone: "5511987654321" },
      { ...BASE, phone: "5511987654321", bornOn: "2026-08-15" },
      { ...BASE, phone: "5511987654321", matedOn: "2026-06-01" },
    ];

    for (const caso of casos) {
      expect(textoDe(whatsappHref(caso)!).endsWith("no OrigemX.")).toBe(true);
    }
  });
});
