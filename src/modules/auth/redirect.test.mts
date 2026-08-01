import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_NEXT, sanitizeNext } from "./redirect.ts";

describe("sanitizeNext", () => {
  it("aceita caminho interno", () => {
    assert.equal(sanitizeNext("/painel"), "/painel");
    assert.equal(sanitizeNext("/c/canil-aurora/rex"), "/c/canil-aurora/rex");
    assert.equal(sanitizeNext("/painel?aba=caes"), "/painel?aba=caes");
  });

  it("recusa URL absoluta", () => {
    for (const hostil of [
      "https://golpe.exemplo",
      "http://golpe.exemplo",
      "javascript:alert(1)",
      "data:text/html,<script>",
    ]) {
      assert.equal(sanitizeNext(hostil), DEFAULT_NEXT, hostil);
    }
  });

  it("recusa URL protocol-relative", () => {
    assert.equal(sanitizeNext("//golpe.exemplo"), DEFAULT_NEXT);
    assert.equal(sanitizeNext("//golpe.exemplo/painel"), DEFAULT_NEXT);
  });

  it("recusa barra invertida — o navegador normaliza para barra", () => {
    // Estes começam com "/" e não com "//", então passariam por uma checagem
    // ingênua. O navegador resolve `/\` como `//` e sai do domínio.
    assert.equal(sanitizeNext("/\\golpe.exemplo"), DEFAULT_NEXT);
    assert.equal(sanitizeNext("/\\/golpe.exemplo"), DEFAULT_NEXT);
    assert.equal(sanitizeNext("/painel\\..\\golpe"), DEFAULT_NEXT);
  });

  it("recusa controle e espaço", () => {
    assert.equal(sanitizeNext("/\tgolpe"), DEFAULT_NEXT);
    assert.equal(sanitizeNext("/\npainel"), DEFAULT_NEXT);
    assert.equal(sanitizeNext("/pai nel"), DEFAULT_NEXT);
  });

  it("recusa o que não é string ou está vazio", () => {
    assert.equal(sanitizeNext(null), DEFAULT_NEXT);
    assert.equal(sanitizeNext(undefined), DEFAULT_NEXT);
    assert.equal(sanitizeNext(42), DEFAULT_NEXT);
    assert.equal(sanitizeNext(""), DEFAULT_NEXT);
    assert.equal(sanitizeNext("   "), DEFAULT_NEXT);
  });

  it("recusa caminho relativo", () => {
    assert.equal(sanitizeNext("painel"), DEFAULT_NEXT);
    assert.equal(sanitizeNext("../painel"), DEFAULT_NEXT);
  });

  it("respeita o fallback informado", () => {
    assert.equal(sanitizeNext("https://golpe.exemplo", "/login"), "/login");
  });
});
