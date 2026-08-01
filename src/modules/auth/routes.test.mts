import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGuestOnlyRoute, isPublicRoute } from "./routes.ts";

describe("isPublicRoute", () => {
  it("abre as telas de entrada", () => {
    for (const rota of ["/", "/login", "/cadastro", "/esqueci-senha", "/nova-senha"]) {
      assert.equal(isPublicRoute(rota), true, rota);
    }
  });

  it("abre o perfil público — é o destino do QR impresso", () => {
    assert.equal(isPublicRoute("/d/k7m2x9qp4a3b"), true);
    assert.equal(isPublicRoute("/c/canil-aurora"), true);
    assert.equal(isPublicRoute("/c/canil-aurora/rex-de-aurora"), true);
  });

  it("abre o retorno de autenticação, que roda sem sessão", () => {
    assert.equal(isPublicRoute("/auth/callback"), true);
    assert.equal(isPublicRoute("/auth/confirm"), true);
  });

  it("fecha a área autenticada", () => {
    for (const rota of ["/painel", "/painel/caes", "/configuracoes"]) {
      assert.equal(isPublicRoute(rota), false, rota);
    }
  });

  it("não abre rota que só COMEÇA com nome público", () => {
    // Sem correspondência exata, `/login` como prefixo deixaria estas passarem.
    assert.equal(isPublicRoute("/login-interno"), false);
    assert.equal(isPublicRoute("/cadastro-admin"), false);
    assert.equal(isPublicRoute("/dados-sigilosos"), false);
    assert.equal(isPublicRoute("/canil-privado"), false);
  });
});

describe("isGuestOnlyRoute", () => {
  it("marca login e cadastro", () => {
    assert.equal(isGuestOnlyRoute("/login"), true);
    assert.equal(isGuestOnlyRoute("/cadastro"), true);
  });

  it("não marca o resto", () => {
    assert.equal(isGuestOnlyRoute("/painel"), false);
    assert.equal(isGuestOnlyRoute("/esqueci-senha"), false);
    assert.equal(isGuestOnlyRoute("/nova-senha"), false);
  });
});
