import { describe, expect, it } from "vitest";

import { isoToBr, maskBrDateDigits, parseBrDate } from "./br-date";

describe("parseBrDate", () => {
  it("converte uma data real", () => {
    expect(parseBrDate("05/03/2020")).toBe("2020-03-05");
  });

  it("converte 29 de fevereiro em ano bissexto", () => {
    expect(parseBrDate("29/02/2020")).toBe("2020-02-29");
  });

  it("rejeita 29 de fevereiro fora de ano bissexto, sem normalizar em silêncio", () => {
    // new Date(2021, 1, 29) viraria 1º de março se não houvesse a checagem
    // de round-trip — é exatamente o defeito que este teste trava.
    expect(parseBrDate("29/02/2021")).toBeNull();
  });

  it("rejeita dia que não existe no mês (31/02, 31/04)", () => {
    expect(parseBrDate("31/02/2020")).toBeNull();
    expect(parseBrDate("31/04/2020")).toBeNull();
  });

  it("rejeita mês fora de 1..12", () => {
    expect(parseBrDate("15/13/2020")).toBeNull();
    expect(parseBrDate("15/00/2020")).toBeNull();
  });

  it("rejeita dia fora de 1..31", () => {
    expect(parseBrDate("32/01/2020")).toBeNull();
    expect(parseBrDate("00/01/2020")).toBeNull();
  });

  it("rejeita string incompleta ou fora do formato", () => {
    expect(parseBrDate("5/3/2020")).toBeNull();
    expect(parseBrDate("05/03/20")).toBeNull();
    expect(parseBrDate("05-03-2020")).toBeNull();
    expect(parseBrDate("")).toBeNull();
    expect(parseBrDate("2020-03-05")).toBeNull();
  });

  it("preenche o dia com zero à esquerda no retorno", () => {
    expect(parseBrDate("01/01/1999")).toBe("1999-01-01");
  });

  // A REGRA DE NEGÓCIO não mora aqui — este arquivo aceita data futura ou
  // anterior a 1900 estruturalmente válida. Quem recusa é validateBirthDate.
  it("NÃO recusa data futura nem anterior a 1900 — isso é responsabilidade de validateBirthDate", () => {
    expect(parseBrDate("01/01/2999")).toBe("2999-01-01");
    expect(parseBrDate("01/01/1500")).toBe("1500-01-01");
  });
});

describe("isoToBr", () => {
  it("converte de volta para dd/mm/aaaa", () => {
    expect(isoToBr("2020-03-05")).toBe("05/03/2020");
  });

  it("aceita ISO com hora/timestamp, lendo só a parte da data", () => {
    expect(isoToBr("2020-03-05T00:00:00Z")).toBe("05/03/2020");
  });

  it("devolve string vazia para null, undefined ou vazio", () => {
    expect(isoToBr(null)).toBe("");
    expect(isoToBr(undefined)).toBe("");
    expect(isoToBr("")).toBe("");
  });

  it("devolve string vazia para formato irreconhecível", () => {
    expect(isoToBr("não é uma data")).toBe("");
  });

  it("é o inverso exato de parseBrDate para datas válidas", () => {
    const original = "17/11/1987";
    expect(isoToBr(parseBrDate(original))).toBe(original);
  });
});

describe("maskBrDateDigits", () => {
  it("insere a barra depois do dia", () => {
    expect(maskBrDateDigits("1")).toBe("1");
    expect(maskBrDateDigits("12")).toBe("12");
    expect(maskBrDateDigits("123")).toBe("12/3");
  });

  it("insere a segunda barra depois do mês", () => {
    expect(maskBrDateDigits("1234")).toBe("12/34");
    expect(maskBrDateDigits("12345")).toBe("12/34/5");
  });

  it("completa os oito dígitos", () => {
    expect(maskBrDateDigits("05032020")).toBe("05/03/2020");
  });

  it("corta no nono dígito — não dá para digitar mais que dd/mm/aaaa", () => {
    expect(maskBrDateDigits("050320209999")).toBe("05/03/2020");
  });

  it("remove qualquer caractere que não seja dígito antes de remontar", () => {
    expect(maskBrDateDigits("05/03/2020")).toBe("05/03/2020");
    expect(maskBrDateDigits("ab05cd03ef2020")).toBe("05/03/2020");
  });

  it("string vazia continua vazia", () => {
    expect(maskBrDateDigits("")).toBe("");
  });
});
