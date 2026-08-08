import { describe, expect, it } from "vitest";

import { isGuestOnlyRoute, isPublicRoute } from "./routes";

describe("isPublicRoute", () => {
  it("abre as telas de entrada", () => {
    for (const rota of ["/", "/login", "/cadastro", "/esqueci-senha", "/nova-senha"]) {
      expect(isPublicRoute(rota), rota).toBe(true);
    }
  });

  it("abre a política de privacidade — o rodapé da captura linka pra ela sem sessão", () => {
    expect(isPublicRoute("/privacidade")).toBe(true);
  });

  it("abre o perfil público — é o destino do QR impresso", () => {
    expect(isPublicRoute("/d/k7m2x9qp4a3b")).toBe(true);
    expect(isPublicRoute("/c/canil-aurora")).toBe(true);
    expect(isPublicRoute("/c/canil-aurora/rex-de-aurora")).toBe(true);
  });

  it("abre o retorno de autenticação, que roda sem sessão", () => {
    expect(isPublicRoute("/auth/callback")).toBe(true);
    expect(isPublicRoute("/auth/confirm")).toBe(true);
  });

  it("fecha a área autenticada", () => {
    for (const rota of ["/painel", "/painel/canis", "/configuracoes"]) {
      expect(isPublicRoute(rota), rota).toBe(false);
    }
  });

  it("não abre rota que só COMEÇA com nome público", () => {
    // Sem correspondência exata, `/login` como prefixo deixaria estas passarem.
    expect(isPublicRoute("/login-interno")).toBe(false);
    expect(isPublicRoute("/cadastro-admin")).toBe(false);
    expect(isPublicRoute("/dados-sigilosos")).toBe(false);
    expect(isPublicRoute("/canil-privado")).toBe(false);
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
