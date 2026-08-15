import { describe, expect, it } from "vitest";

import { formatFounderDigits, formatFounderNumber, founderEligibility } from "./founder";

describe("formatFounderNumber", () => {
  it("usa três dígitos, como o cliente aprovou", () => {
    expect(formatFounderNumber(7)).toBe("Criador Fundador nº 007");
    expect(formatFounderNumber(1)).toBe("Criador Fundador nº 001");
    expect(formatFounderNumber(42)).toBe("Criador Fundador nº 042");
  });

  it("não estufa nem corta nos extremos do intervalo", () => {
    expect(formatFounderNumber(99)).toBe("Criador Fundador nº 099");
    expect(formatFounderNumber(100)).toBe("Criador Fundador nº 100");
  });

  it("devolve null sem selo — a tela não deve renderizar nada", () => {
    expect(formatFounderNumber(null)).toBeNull();
    expect(formatFounderNumber(undefined)).toBeNull();
  });

  it("recusa valor abaixo do piso, mas não tem teto superior", () => {
    // Sem `maxvalue` na sequence desde 20260806234150_founder_number_sem_teto:
    // o selo virou número de registro sequencial, e o piso (>= 1, o mesmo do
    // CHECK no banco) é a única recusa que ainda faz sentido aqui.
    expect(formatFounderNumber(0)).toBeNull();
    expect(formatFounderNumber(-1)).toBeNull();
    expect(formatFounderNumber(101)).toBe("Criador Fundador nº 101");
    expect(formatFounderNumber(1000)).toBe("Criador Fundador nº 1000");
  });

  it("recusa o que não é inteiro", () => {
    expect(formatFounderNumber(7.5)).toBeNull();
    expect(formatFounderNumber(Number.NaN)).toBeNull();
  });

});

describe("formatFounderDigits", () => {
  it("devolve só os três dígitos", () => {
    expect(formatFounderDigits(7)).toBe("007");
    expect(formatFounderDigits(100)).toBe("100");
    expect(formatFounderDigits(null)).toBeNull();
  });
});

describe("founderEligibility", () => {
  const completo = {
    name: "Canil Aurora",
    city: "Campinas",
    state: "SP",
    hasLogo: true,
    dogCount: 1,
  };

  it("aceita cadastro completo", () => {
    const r = founderEligibility(completo);
    expect(r.eligible).toBe(true);
    expect(r.missing).toHaveLength(0);
  });

  it("cadastro vazio não é elegível e lista tudo que falta", () => {
    const r = founderEligibility({});
    expect(r.eligible).toBe(false);
    expect(r.missing.map((m) => m.key)).toEqual(["name", "city", "state", "logo", "dog"]);
  });

  it("exige cada critério isoladamente", () => {
    expect(founderEligibility({ ...completo, name: null }).eligible).toBe(false);
    expect(founderEligibility({ ...completo, city: null }).eligible).toBe(false);
    expect(founderEligibility({ ...completo, state: null }).eligible).toBe(false);
    expect(founderEligibility({ ...completo, hasLogo: false }).eligible).toBe(false);
    expect(founderEligibility({ ...completo, dogCount: 0 }).eligible).toBe(false);
  });

  it("espaço em branco não preenche critério", () => {
    // Senão bastaria digitar " " na cidade para consumir um dos 100 números.
    expect(founderEligibility({ ...completo, city: "   " }).eligible).toBe(false);
    expect(founderEligibility({ ...completo, name: "" }).eligible).toBe(false);
  });

  it("aponta exatamente o que falta, para a tela poder dizer", () => {
    const r = founderEligibility({ ...completo, hasLogo: false, dogCount: 0 });
    expect(r.missing.map((m) => m.key)).toEqual(["logo", "dog"]);
    expect(r.missing.map((m) => m.label)).toEqual(["Logo", "Ao menos 1 cão cadastrado"]);
  });

  it("devolve sempre todos os requisitos, cumpridos ou não", () => {
    // A tela mostra a lista inteira com marcação, não só o que falta.
    expect(founderEligibility(completo).requirements).toHaveLength(5);
    expect(founderEligibility({}).requirements).toHaveLength(5);
  });

  it("mais de um cão continua elegível", () => {
    expect(founderEligibility({ ...completo, dogCount: 12 }).eligible).toBe(true);
  });

  it("dogCount ausente conta como zero", () => {
    expect(
      founderEligibility({ name: "Canil Aurora", city: "Campinas", state: "SP", hasLogo: true })
        .eligible,
    ).toBe(false);
  });
});
