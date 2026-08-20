import { describe, expect, it } from "vitest";

import { dogWhatsappHref } from "./contact";

const BASE = {
  publicId: "abc123def456",
  dogName: "Thor",
  sex: "male",
  siteUrl: "https://origemx.app",
};

function textoDe(href: string): string {
  return decodeURIComponent(new URL(href).searchParams.get("text")!);
}

describe("dogWhatsappHref — quando NÃO existe botão", () => {
  it("sem telefone, devolve null", () => {
    expect(dogWhatsappHref({ ...BASE, phone: null })).toBeNull();
    expect(dogWhatsappHref({ ...BASE, phone: undefined })).toBeNull();
    expect(dogWhatsappHref({ ...BASE, phone: "" })).toBeNull();
  });

  /**
   * Telefone malformado produz NENHUM botão, não um `wa.me` quebrado — a
   * mesma garantia que o CTA da ninhada já tem.
   */
  it("telefone fora de 10–15 dígitos devolve null", () => {
    expect(dogWhatsappHref({ ...BASE, phone: "12345" })).toBeNull();
    expect(dogWhatsappHref({ ...BASE, phone: "1".repeat(16) })).toBeNull();
    expect(dogWhatsappHref({ ...BASE, phone: "sem número" })).toBeNull();
  });
});

describe("dogWhatsappHref — o link", () => {
  it("aponta para wa.me com só os dígitos", () => {
    const href = dogWhatsappHref({ ...BASE, phone: "5511987654321" })!;
    expect(href.startsWith("https://wa.me/5511987654321?text=")).toBe(true);
  });

  it("ignora máscara do telefone", () => {
    const comMascara = dogWhatsappHref({ ...BASE, phone: "+55 (11) 98765-4321" })!;
    const semMascara = dogWhatsappHref({ ...BASE, phone: "5511987654321" })!;
    expect(comMascara).toBe(semMascara);
  });

  it("a mensagem leva o link do CÃO (/d/), não o da ninhada", () => {
    const href = dogWhatsappHref({ ...BASE, phone: "5511987654321" })!;
    expect(textoDe(href)).toContain("https://origemx.app/d/abc123def456");
    expect(textoDe(href)).not.toContain("/n/");
  });

  it("não dobra a barra quando o siteUrl vem com barra final", () => {
    const href = dogWhatsappHref({
      ...BASE,
      phone: "5511987654321",
      siteUrl: "https://origemx.app/",
    })!;
    expect(textoDe(href)).toContain("https://origemx.app/d/abc123def456");
    expect(textoDe(href)).not.toContain("//d/");
  });
});

describe("dogWhatsappHref — a mensagem", () => {
  it("usa o artigo masculino para macho", () => {
    const href = dogWhatsappHref({ ...BASE, phone: "5511987654321", sex: "male" })!;
    expect(textoDe(href)).toContain("interesse no Thor");
  });

  it("usa o artigo feminino para fêmea", () => {
    const href = dogWhatsappHref({
      ...BASE,
      phone: "5511987654321",
      sex: "female",
      dogName: "Bella",
    })!;
    expect(textoDe(href)).toContain("interesse na Bella");
  });

  it("sexo desconhecido cai no masculino, sem quebrar", () => {
    const href = dogWhatsappHref({ ...BASE, phone: "5511987654321", sex: "" })!;
    expect(textoDe(href)).toContain("interesse no Thor");
  });

  it("apara espaço do nome — o `<h1>` mostra aparado, a mensagem também", () => {
    const href = dogWhatsappHref({ ...BASE, phone: "5511987654321", dogName: "  Thor  " })!;
    expect(textoDe(href)).toContain("interesse no Thor (");
  });

  it("termina com \"no OrigemX.\", como o CTA da ninhada", () => {
    const href = dogWhatsappHref({ ...BASE, phone: "5511987654321" })!;
    expect(textoDe(href).endsWith("no OrigemX.")).toBe(true);
  });
});
