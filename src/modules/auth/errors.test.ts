import { afterEach, describe, expect, it, vi } from "vitest";

import { redigir, registrarAuthError, traduzirAuthError, tratarAuthError } from "./errors";

const GENERICO = "Não foi possível concluir. Tente novamente.";

describe("traduzirAuthError", () => {
  it("traduz credencial inválida sem dizer qual campo errou", () => {
    const m = traduzirAuthError("Invalid login credentials");
    expect(m).toBe("E-mail ou senha incorretos.");
    // Dizer "senha incorreta" confirmaria que o e-mail existe.
    expect(m).not.toMatch(/o e-mail|a senha está/i);
  });

  it("traduz e-mail não confirmado", () => {
    expect(traduzirAuthError("Email not confirmed")).toContain("Confirme seu e-mail");
  });

  it("traduz conta já existente", () => {
    expect(traduzirAuthError("User already registered")).toBe(
      "Já existe uma conta com esse e-mail.",
    );
  });

  /*
   * O BUG. Esta era a mensagem que chegava do GoTrue em produção quando o SMTP
   * falhava, e ela caía no genérico — a pessoa via "tente novamente", repetia, e
   * batia em "já existe uma conta".
   */
  describe("falha no envio do e-mail de confirmação", () => {
    it("não cai mais no genérico", () => {
      expect(traduzirAuthError("Error sending confirmation email")).not.toBe(GENERICO);
    });

    it("diz que a conta FOI criada", () => {
      expect(traduzirAuthError("Error sending confirmation email")).toMatch(/conta foi criada/i);
    });

    it("não manda tentar de novo, que levaria a 'já existe uma conta'", () => {
      const m = traduzirAuthError("Error sending confirmation email").toLowerCase();
      expect(m).not.toContain("tente novamente");
      expect(m).not.toContain("tente de novo");
    });
  });

  it("trata falha de banco sem culpar os dados do usuário", () => {
    const m = traduzirAuthError("Database error saving new user");
    expect(m).not.toBe(GENERICO);
    expect(m).toMatch(/nosso servidor/i);
  });

  it("trata cadastro desativado", () => {
    expect(traduzirAuthError("Signups not allowed for this instance")).toMatch(/desativados/i);
    expect(traduzirAuthError("Email signups are disabled")).toMatch(/desativados/i);
  });

  it("traduz e-mail inválido antes de cair na regra de senha", () => {
    // Contém "password"? Não — mas contém "invalid", e a ordem das regras
    // importa: este caso já regrediu uma vez.
    expect(traduzirAuthError('Email address "x@y.z" is invalid')).toBe(
      "E-mail inválido. Confira o endereço e tente de novo.",
    );
  });

  it("devolve a espera em segundos quando o GoTrue informa", () => {
    expect(
      traduzirAuthError("For security purposes, you can only request this after 51 seconds."),
    ).toBe("Aguarde 51 segundos antes de tentar de novo.");
  });

  it("traduz limite de taxa", () => {
    expect(traduzirAuthError("email rate limit exceeded")).toMatch(/muitas tentativas/i);
  });

  it("cai no genérico só quando não reconhece nada", () => {
    expect(traduzirAuthError("Something entirely unexpected")).toBe(GENERICO);
    expect(traduzirAuthError("")).toBe(GENERICO);
  });

  it("nenhuma mensagem traduzida devolve texto em inglês do GoTrue", () => {
    const entradas = [
      "Invalid login credentials",
      "Email not confirmed",
      "User already registered",
      "Error sending confirmation email",
      "Database error saving new user",
      "Signups not allowed for this instance",
    ];
    for (const e of entradas) {
      expect(traduzirAuthError(e)).not.toContain(e);
    }
  });
});

describe("redigir", () => {
  it("remove e-mail da mensagem", () => {
    expect(redigir('Email address "fulano@exemplo.com.br" is invalid')).toBe(
      'Email address "<e-mail>" is invalid',
    );
  });

  it("remove mais de um e-mail", () => {
    expect(redigir("de a.b+tag@x.com para c@y.co")).toBe("de <e-mail> para <e-mail>");
  });

  it("deixa passar texto sem e-mail", () => {
    expect(redigir("Error sending confirmation email")).toBe("Error sending confirmation email");
  });
});

describe("registrarAuthError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("escreve status, code e mensagem", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarAuthError("signUp", {
      message: "Error sending confirmation email",
      status: 500,
      code: "unexpected_failure",
    });
    expect(spy).toHaveBeenCalledWith(
      "[auth:signUp] 500 unexpected_failure: Error sending confirmation email",
    );
  });

  it("NUNCA grava e-mail no log", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarAuthError("signUp", {
      message: 'Email address "fulano@exemplo.com.br" is invalid',
      status: 400,
    });
    const escrito = String(spy.mock.calls[0][0]);
    expect(escrito).not.toContain("fulano@exemplo.com.br");
    expect(escrito).toContain("<e-mail>");
  });

  it("aguenta erro sem status nem code", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarAuthError("signIn", { message: "boom" });
    expect(spy).toHaveBeenCalledWith("[auth:signIn] ? sem-code: boom");
  });
});

describe("tratarAuthError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loga o cru e devolve o traduzido", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const msg = tratarAuthError("signUp", {
      message: "Error sending confirmation email",
      status: 500,
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toContain("Error sending confirmation email");
    // O inglês fica no log; o usuário lê português.
    expect(msg).not.toContain("Error sending");
    expect(msg).toMatch(/conta foi criada/i);
  });
});
