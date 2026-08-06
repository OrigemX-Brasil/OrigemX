import { describe, expect, it } from "vitest";

import { destinoFinal, escolherTentativa, TIPOS_ACEITOS } from "./confirm";

const q = (s: string) => new URLSearchParams(s);

describe("escolherTentativa", () => {
  it("usa token_hash quando vem com um tipo aceito", () => {
    expect(escolherTentativa(q("token_hash=abc&type=signup"))).toEqual({
      via: "otp",
      tokenHash: "abc",
      tipo: "signup",
    });
  });

  it("aceita os três tipos que os templates emitem", () => {
    for (const tipo of TIPOS_ACEITOS) {
      expect(escolherTentativa(q(`token_hash=abc&type=${tipo}`)).via).toBe("otp");
    }
  });

  /*
   * `type` vem da URL. Sem a lista, quem monta a URL escolhe qual verificação o
   * servidor tenta — inclusive fluxos que este app não usa.
   */
  it("recusa tipo fora da lista, mesmo com token_hash presente", () => {
    for (const tipo of ["invite", "magiclink", "phone_change", "sql", ""]) {
      expect(escolherTentativa(q(`token_hash=abc&type=${tipo}`)).via).not.toBe("otp");
    }
  });

  it("usa code quando não há token_hash — o link antigo, com PKCE", () => {
    expect(escolherTentativa(q("code=xyz"))).toEqual({ via: "code", code: "xyz" });
  });

  it("prefere token_hash a code quando os dois vêm", () => {
    expect(escolherTentativa(q("token_hash=abc&type=recovery&code=xyz")).via).toBe("otp");
  });

  it("cai em code se o token_hash veio sem tipo válido", () => {
    expect(escolherTentativa(q("token_hash=abc&type=invite&code=xyz")).via).toBe("code");
  });

  it("não tenta nada quando não há parâmetro nenhum", () => {
    // É o caso do fluxo implícito: a sessão vem em `#access_token=`, que o
    // navegador NÃO envia. Do lado do servidor a query chega vazia.
    expect(escolherTentativa(q("")).via).toBe("nenhuma");
    expect(escolherTentativa(q("next=/painel")).via).toBe("nenhuma");
  });

  it("ignora token_hash vazio", () => {
    expect(escolherTentativa(q("token_hash=&type=signup")).via).toBe("nenhuma");
  });
});

describe("destinoFinal", () => {
  const next = "/painel";

  it("segue para o destino quando a verificação deu certo", () => {
    expect(destinoFinal({ verificou: true, temSessao: false, next })).toBe("/painel");
  });

  /*
   * O BUG que originou tudo isto.
   *
   * O token é de uso único, e o scanner do cliente de e-mail o gasta antes do
   * clique humano. Quando a pessoa clica, o token já foi — mas a conta está
   * ativa e a sessão existe. Reportar erro aqui era anunciar uma falha que não
   * aconteceu.
   */
  it("trata token gasto COM sessão como sucesso", () => {
    expect(destinoFinal({ verificou: false, temSessao: true, next })).toBe("/painel");
  });

  it("só erra quando não há sessão E o token não vale", () => {
    expect(destinoFinal({ verificou: false, temSessao: false, next })).toBe("/login?erro=link");
  });

  it("respeita o destino da recuperação de senha", () => {
    const r = { next: "/nova-senha" };
    expect(destinoFinal({ verificou: true, temSessao: false, ...r })).toBe("/nova-senha");
    expect(destinoFinal({ verificou: false, temSessao: true, ...r })).toBe("/nova-senha");
  });

  it("nunca manda para o erro quando há sessão", () => {
    for (const verificou of [true, false]) {
      expect(destinoFinal({ verificou, temSessao: true, next })).not.toContain("erro=link");
    }
  });
});
