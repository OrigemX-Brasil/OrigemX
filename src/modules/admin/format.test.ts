import { describe, expect, it } from "vitest";

import {
  DEFAULT_HIDE_REASON,
  DEFAULT_SUSPEND_REASON,
  DEFAULT_UNHIDE_REASON,
  DEFAULT_UNSUSPEND_REASON,
  endOfDaySaoPaulo,
  entityHref,
  entityLabel,
  resolveHideReason,
  resolveSuspendReason,
  startOfDaySaoPaulo,
} from "./format";

describe("resolveSuspendReason", () => {
  it("campo vazio vira motivo padrão de suspensão", () => {
    expect(resolveSuspendReason("", true)).toBe(DEFAULT_SUSPEND_REASON);
  });

  it("campo só com espaço conta como vazio", () => {
    expect(resolveSuspendReason("   ", false)).toBe(DEFAULT_UNSUSPEND_REASON);
  });

  it("motivo de reativação é diferente do de suspensão", () => {
    expect(resolveSuspendReason("", false)).not.toBe(resolveSuspendReason("", true));
  });

  it("motivo escrito pelo admin é preservado, sem truncar nem trocar", () => {
    expect(resolveSuspendReason("Denúncia confirmada por outro criador", true)).toBe(
      "Denúncia confirmada por outro criador",
    );
  });

  it("apara espaço nas pontas do motivo escrito", () => {
    expect(resolveSuspendReason("  Reincidência  ", true)).toBe("Reincidência");
  });
});

describe("resolveHideReason", () => {
  it("campo vazio vira motivo padrão de ocultar", () => {
    expect(resolveHideReason("", true)).toBe(DEFAULT_HIDE_REASON);
  });

  it("campo só com espaço conta como vazio", () => {
    expect(resolveHideReason("   ", false)).toBe(DEFAULT_UNHIDE_REASON);
  });

  it("motivo de reativação é diferente do de ocultar", () => {
    expect(resolveHideReason("", false)).not.toBe(resolveHideReason("", true));
  });

  it("motivo escrito pelo admin é preservado, sem truncar nem trocar", () => {
    expect(resolveHideReason("Duplicata do canil Serra Azul", true)).toBe(
      "Duplicata do canil Serra Azul",
    );
  });

  it("apara espaço nas pontas do motivo escrito", () => {
    expect(resolveHideReason("  Duplicata  ", true)).toBe("Duplicata");
  });
});

describe("startOfDaySaoPaulo / endOfDaySaoPaulo", () => {
  it("início do dia carrega o offset fixo -03:00", () => {
    expect(startOfDaySaoPaulo("2026-08-10")).toBe("2026-08-10T00:00:00-03:00");
  });

  it("fim do dia vai até o último milissegundo, mesmo offset", () => {
    expect(endOfDaySaoPaulo("2026-08-10")).toBe("2026-08-10T23:59:59.999-03:00");
  });

  it("início e fim do mesmo dia produzem instantes distintos e ordenados", () => {
    const inicio = new Date(startOfDaySaoPaulo("2026-08-10")).getTime();
    const fim = new Date(endOfDaySaoPaulo("2026-08-10")).getTime();
    expect(inicio).toBeLessThan(fim);
  });
});

describe("entityLabel / entityHref", () => {
  it("traduz os três tipos de entidade conhecidos", () => {
    expect(entityLabel("profile")).toBe("Usuário");
    expect(entityLabel("kennel")).toBe("Canil");
    expect(entityLabel("dog")).toBe("Cão");
  });

  it("tipo desconhecido devolve o próprio valor, sem quebrar a tela", () => {
    expect(entityLabel("outro")).toBe("outro");
  });

  it("monta o link certo para cada tipo de entidade", () => {
    expect(entityHref("profile", "abc")).toBe("/admin/usuarios/abc");
    expect(entityHref("kennel", "abc")).toBe("/admin/canis/abc");
    expect(entityHref("dog", "abc")).toBe("/admin/caes/abc");
  });

  it("tipo desconhecido não gera link", () => {
    expect(entityHref("outro", "abc")).toBeNull();
  });
});
