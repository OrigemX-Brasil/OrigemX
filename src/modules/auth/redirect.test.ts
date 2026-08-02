import { describe, expect, it } from "vitest";

import { DEFAULT_NEXT, sanitizeNext } from "./redirect";

describe("sanitizeNext", () => {
  it("aceita caminho interno", () => {
    expect(sanitizeNext("/painel")).toBe("/painel");
    expect(sanitizeNext("/c/canil-aurora/rex")).toBe("/c/canil-aurora/rex");
    expect(sanitizeNext("/painel?aba=caes")).toBe("/painel?aba=caes");
  });

  it("recusa URL absoluta", () => {
    for (const hostil of [
      "https://golpe.exemplo",
      "http://golpe.exemplo",
      "javascript:alert(1)",
      "data:text/html,<script>",
    ]) {
      expect(sanitizeNext(hostil), hostil).toBe(DEFAULT_NEXT);
    }
  });

  it("recusa URL protocol-relative", () => {
    expect(sanitizeNext("//golpe.exemplo")).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("//golpe.exemplo/painel")).toBe(DEFAULT_NEXT);
  });

  it("recusa barra invertida — o navegador normaliza para barra", () => {
    // Estes começam com "/" e não com "//", então passariam por uma checagem
    // ingênua. O navegador resolve `/\` como `//` e sai do domínio.
    expect(sanitizeNext("/\\golpe.exemplo")).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/\\/golpe.exemplo")).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/painel\\..\\golpe")).toBe(DEFAULT_NEXT);
  });

  it("recusa controle e espaço", () => {
    expect(sanitizeNext("/\tgolpe")).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/\npainel")).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/pai nel")).toBe(DEFAULT_NEXT);
  });

  it("recusa o que não é string ou está vazio", () => {
    expect(sanitizeNext(null)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext(undefined)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext(42)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("")).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("   ")).toBe(DEFAULT_NEXT);
  });

  it("recusa caminho relativo", () => {
    expect(sanitizeNext("painel")).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("../painel")).toBe(DEFAULT_NEXT);
  });

  it("respeita o fallback informado", () => {
    expect(sanitizeNext("https://golpe.exemplo", "/login")).toBe("/login");
  });
});
