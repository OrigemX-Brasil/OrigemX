import { afterEach, describe, expect, it } from "vitest";

import { daysUntilWhelping, expectedWhelpingDate, GESTATION_DAYS } from "./gestation";

describe("expectedWhelpingDate", () => {
  it("soma 63 dias", () => {
    expect(expectedWhelpingDate("2026-06-01")).toBe("2026-08-03");
  });

  it("ausência de cobrição não vira data", () => {
    expect(expectedWhelpingDate(null)).toBeNull();
    expect(expectedWhelpingDate(undefined)).toBeNull();
    expect(expectedWhelpingDate("")).toBeNull();
  });

  it("data impossível vira null, não Invalid Date renderizada na tela", () => {
    expect(expectedWhelpingDate("2026-02-31")).toBeNull();
    expect(expectedWhelpingDate("não é data")).toBeNull();
  });

  it("atravessa a virada do ano", () => {
    expect(expectedWhelpingDate("2026-11-15")).toBe("2027-01-17");
  });

  it("conta o 29 de fevereiro em ano bissexto", () => {
    // 2028 é bissexto: 01/01 + 63 dias passa por 29/02 e cai em 04/03.
    expect(expectedWhelpingDate("2028-01-01")).toBe("2028-03-04");
    // 2027 não é: o mesmo 01/01 cai um dia antes, em 05/03.
    expect(expectedWhelpingDate("2027-01-01")).toBe("2027-03-05");
  });

  it("não desloca o dia por fuso — 31/12 continua sendo 31/12 na origem", () => {
    expect(expectedWhelpingDate("2026-12-31")).toBe("2027-03-04");
  });

  it("a constante e o resultado não podem divergir", () => {
    const origem = new Date("2026-05-10T00:00:00Z");
    const prevista = new Date(`${expectedWhelpingDate("2026-05-10")}T00:00:00Z`);
    const dias = (prevista.getTime() - origem.getTime()) / 86_400_000;

    expect(dias).toBe(GESTATION_DAYS);
  });

  describe("imune ao fuso horário do processo", () => {
    // `expectedWhelpingDate` só chama métodos `getUTC*`/`Date.UTC`/
    // `toISOString()` — nenhum método de fuso LOCAL (`getDate`, `getMonth`,
    // `getFullYear`, `toLocaleDateString`...). É essa escolha, e não o teste,
    // que garante a imunidade; o teste prova que a escolha foi respeitada.
    //
    // `process.env.TZ` é restaurado no `afterEach` mesmo se um `expect` falhar
    // no meio — senão o vazamento para os próximos arquivos de teste seria
    // exatamente o tipo de bug intermitente e "só falha às vezes" que este
    // teste existe para evitar em produção.
    const original = process.env.TZ;

    afterEach(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    // Só datas que caem ANTES das 21h/22h UTC do dia civil não têm risco de
    // "vazar" um dia mesmo se algum código (não este) usasse `Date` local por
    // engano — meio-dia UTC evita esse ruído e deixa o teste focado só na
    // imunidade real da função.
    const HOJE_MEIO_DIA = new Date("2026-08-18T12:00:00Z");

    it.each([
      "UTC",
      "America/New_York", // observa horário de verão (DST)
      "America/Sao_Paulo", // BR aboliu DST em 2019 — fuso fixo, -03:00
      "Pacific/Kiritimati", // UTC+14, o fuso mais adiantado do mundo
      "Etc/GMT+12", // UTC-12, o mais atrasado
    ])("previsão idêntica com TZ=%s", (tz) => {
      process.env.TZ = tz;
      expect(expectedWhelpingDate("2026-06-01")).toBe("2026-08-03");
      expect(daysUntilWhelping("2026-06-01", HOJE_MEIO_DIA)).toBe(-15);
    });

    it("atravessa a virada de horário de verão dos EUA (14/03/2027) sem alterar o resultado", () => {
      // 01/02 + 63 dias cai em 05/04/2027 — o cálculo passa POR DENTRO da
      // transição de DST americana (spring forward, 14/03/2027) sem que isso
      // mude um único dia do resultado, porque a aritmética inteira é UTC.
      process.env.TZ = "America/New_York";
      expect(expectedWhelpingDate("2027-02-01")).toBe("2027-04-05");

      process.env.TZ = "UTC";
      expect(expectedWhelpingDate("2027-02-01")).toBe("2027-04-05");
    });
  });
});

describe("daysUntilWhelping", () => {
  it("conta os dias que faltam", () => {
    // Cobrição em 01/06 → previsão 03/08. De 01/08 faltam 2 dias.
    expect(daysUntilWhelping("2026-06-01", new Date("2026-08-01T12:00:00Z"))).toBe(2);
  });

  it("zero no dia da previsão", () => {
    expect(daysUntilWhelping("2026-06-01", new Date("2026-08-03T23:00:00Z"))).toBe(0);
  });

  it("negativo depois da data — é o que distingue 'atrasou' de 'falta pouco'", () => {
    expect(daysUntilWhelping("2026-06-01", new Date("2026-08-10T00:00:00Z"))).toBe(-7);
  });

  it("hora do dia não muda a contagem", () => {
    const cedo = daysUntilWhelping("2026-06-01", new Date("2026-08-01T00:00:01Z"));
    const tarde = daysUntilWhelping("2026-06-01", new Date("2026-08-01T23:59:59Z"));

    expect(cedo).toBe(tarde);
  });

  it("sem cobrição, sem contagem", () => {
    expect(daysUntilWhelping(null)).toBeNull();
  });
});
