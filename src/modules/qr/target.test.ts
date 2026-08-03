import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isQrKind, qrFileName, qrTargetPath, qrTargetUrl, qrTargetWarning } from "./target";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://origemxbr.com";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("qrTargetPath — só identificador estável", () => {
  it("cão vai por public_id, que o banco congela", () => {
    expect(qrTargetPath("dog", "n5xyxy8kd73b")).toBe("/d/n5xyxy8kd73b");
  });

  it("canil vai por slug, que não é liberado nem por exclusão lógica", () => {
    expect(qrTargetPath("kennel", "canil-do-vale")).toBe("/c/canil-do-vale");
  });
});

describe("qrTargetUrl", () => {
  it("usa a env var do site — a mesma do canonical", () => {
    expect(qrTargetUrl("dog", "n5xyxy8kd73b")).toBe("https://origemxbr.com/d/n5xyxy8kd73b");
    expect(qrTargetUrl("kennel", "aurora")).toBe("https://origemxbr.com/c/aurora");
  });

  it("acompanha a troca de domínio sem mexer em código", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://origemx.com.br";
    expect(qrTargetUrl("dog", "abc")).toBe("https://origemx.com.br/d/abc");
  });

  it("base com caminho ou barra sobrando não duplica a barra", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://origemxbr.com/";
    expect(qrTargetUrl("dog", "abc")).toBe("https://origemxbr.com/d/abc");
  });
});

describe("qrTargetWarning — o aviso que evita 500 crachás inúteis", () => {
  it("acusa localhost, que escaneia só na máquina de quem gerou", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    const aviso = qrTargetWarning(qrTargetUrl("dog", "abc"));

    expect(aviso).toContain("localhost:3000");
    expect(aviso).toContain("NÃO envie para impressão");
  });

  it.each([
    ["http://127.0.0.1:3000", "loopback"],
    ["http://192.168.0.42:3000", "rede doméstica"],
    ["http://10.0.0.5", "rede privada"],
    ["http://172.16.3.9", "rede privada"],
    ["http://macbook.local:3000", "mDNS"],
    ["http://servidor:8080", "nome sem ponto"],
  ])("acusa %s (%s)", (base) => {
    process.env.NEXT_PUBLIC_SITE_URL = base;
    expect(qrTargetWarning(qrTargetUrl("dog", "abc"))).toContain("NÃO envie para impressão");
  });

  it("172.32 é público — a faixa privada termina em 172.31", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://172.32.0.1";
    expect(qrTargetWarning(qrTargetUrl("dog", "abc"))).toBeNull();
  });

  it("domínio real sem HTTPS vira aviso mais brando, não bloqueio", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://origemxbr.com";
    const aviso = qrTargetWarning(qrTargetUrl("dog", "abc"));

    expect(aviso).toContain("HTTPS");
    expect(aviso).not.toContain("NÃO envie");
  });

  it("domínio real com HTTPS não avisa nada", () => {
    expect(qrTargetWarning(qrTargetUrl("dog", "abc"))).toBeNull();
    expect(qrTargetWarning(qrTargetUrl("kennel", "aurora"))).toBeNull();
  });

  it("URL inválida não passa em silêncio", () => {
    expect(qrTargetWarning("nao é uma url")).toContain("inválido");
  });
});

describe("qrFileName", () => {
  it("junta tipo, nome e identificador estável", () => {
    expect(qrFileName("dog", "Rex de Aurora", "n5xyxy8kd73b", "png")).toBe(
      "origemx-cao-rex-de-aurora-n5xyxy8kd73b.png",
    );
    expect(qrFileName("kennel", "Canil do Vale", "canil-do-vale", "svg")).toBe(
      "origemx-canil-canil-do-vale-canil-do-vale.svg",
    );
  });

  it("remove acento — 'Ipê' não pode virar 'ip'", () => {
    expect(qrFileName("dog", "Ipê Amarelo", "abc", "png")).toBe("origemx-cao-ipe-amarelo-abc.png");
  });

  it("nome só de símbolos não deixa hífen solto nem nome vazio", () => {
    expect(qrFileName("dog", "###", "abc", "png")).toBe("origemx-cao-abc.png");
  });

  it("nome longo é cortado sem terminar em hífen", () => {
    const nome = "A".repeat(80);
    const file = qrFileName("dog", nome, "abc", "png");

    expect(file.endsWith("-abc.png")).toBe(true);
    expect(file).not.toContain("--");
  });
});

describe("isQrKind", () => {
  it("aceita só os dois tipos — a rota monta a URL a partir disto", () => {
    expect(isQrKind("dog")).toBe(true);
    expect(isQrKind("kennel")).toBe(true);
    expect(isQrKind("Dog")).toBe(false);
    expect(isQrKind("../../etc")).toBe(false);
    expect(isQrKind("")).toBe(false);
  });
});
