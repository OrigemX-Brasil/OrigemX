import { describe, expect, it } from "vitest";

import { isGuestOnlyRoute, isProtectedRoute } from "./routes";

describe("isProtectedRoute", () => {
  it("fecha a área autenticada", () => {
    expect(isProtectedRoute("/painel")).toBe(true);
    expect(isProtectedRoute("/painel/canis")).toBe(true);
    expect(isProtectedRoute("/painel/canis/abc")).toBe(true);
    expect(isProtectedRoute("/painel/caes/novo")).toBe(true);
  });

  it("não fecha rota que só COMEÇA com o nome protegido", () => {
    // Sem correspondência de segmento, `/painel` como prefixo cru casaria
    // `/painel-privado` também.
    expect(isProtectedRoute("/painel-privado")).toBe(false);
  });

  it("deixa passar as telas de entrada e o perfil público", () => {
    for (const rota of [
      "/",
      "/login",
      "/cadastro",
      "/esqueci-senha",
      "/nova-senha",
      "/privacidade",
      "/d/k7m2x9qp4a3b",
      "/c/canil-aurora",
      "/c/canil-aurora/rex-de-aurora",
      "/auth/callback",
      "/auth/confirm",
    ]) {
      expect(isProtectedRoute(rota), rota).toBe(false);
    }
  });

  it("deixa passar URL desconhecida — é o /not-found que decide, não o login", () => {
    // Antes do denylist, qualquer rota fora do allowlist virava redirect pro
    // login — inclusive link quebrado ou digitado errado, que deveria cair
    // na página 404, não numa tela pedindo sessão.
    expect(isProtectedRoute("/isso-nao-existe")).toBe(false);
    expect(isProtectedRoute("/dados-sigilosos")).toBe(false);
  });
});

describe("isGuestOnlyRoute", () => {
  it("marca login e cadastro", () => {
    expect(isGuestOnlyRoute("/login")).toBe(true);
    expect(isGuestOnlyRoute("/cadastro")).toBe(true);
  });

  it("não marca o resto", () => {
    expect(isGuestOnlyRoute("/painel")).toBe(false);
    expect(isGuestOnlyRoute("/esqueci-senha")).toBe(false);
    expect(isGuestOnlyRoute("/nova-senha")).toBe(false);
  });
});
