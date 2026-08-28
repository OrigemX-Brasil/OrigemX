import { describe, expect, it } from "vitest";

import { decidirEnvio, JANELA_DIAS, MAX_POR_JANELA, type EnvioAnterior } from "./decisao";

const AGORA = new Date("2026-08-28T12:00:00Z");

/** Um envio N dias atrás, para montar janelas sem escrever ISO à mão. */
function diasAtras(dias: number, kind: EnvioAnterior["kind"] = "boas-vindas"): EnvioAnterior {
  return {
    kind,
    sentAt: new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000).toISOString(),
  };
}

describe("decidirEnvio", () => {
  it("envia quando não há nada no caminho", () => {
    expect(
      decidirEnvio({ kind: "primeiro-cao", optOutAt: null, anteriores: [], agora: AGORA }),
    ).toEqual({ enviar: true });
  });

  describe("opt-out", () => {
    it("bloqueia tudo, mesmo sem nenhum envio anterior", () => {
      const d = decidirEnvio({
        kind: "primeiro-cao",
        optOutAt: "2026-08-01T00:00:00Z",
        anteriores: [],
        agora: AGORA,
      });

      expect(d).toEqual({ enviar: false, motivo: "opt-out" });
    });

    it("vence o teto: é a vontade da pessoa, não uma questão de quantidade", () => {
      // Sem envio nenhum na janela — o teto deixaria passar. O opt-out não.
      const d = decidirEnvio({
        kind: "selo-fundador",
        optOutAt: "2026-08-27T23:59:00Z",
        anteriores: [],
        agora: AGORA,
      });

      expect(d).toEqual({ enviar: false, motivo: "opt-out" });
    });
  });

  describe("evento único", () => {
    it("não repete um e-mail que já saiu", () => {
      const d = decidirEnvio({
        kind: "primeiro-cao",
        optOutAt: null,
        anteriores: [diasAtras(200, "primeiro-cao")],
        agora: AGORA,
      });

      // Note que 200 dias está MUITO fora da janela do teto — o bloqueio aqui é
      // de repetição, não de frequência.
      expect(d).toEqual({ enviar: false, motivo: "ja-enviado" });
    });

    it("um kind diferente não bloqueia o outro", () => {
      const d = decidirEnvio({
        kind: "canil-publicado",
        optOutAt: null,
        anteriores: [diasAtras(200, "primeiro-cao")],
        agora: AGORA,
      });

      expect(d).toEqual({ enviar: true });
    });

    it('"já enviado" tem precedência sobre o teto — o motivo precisa ser honesto', () => {
      // Estouraria o teto E é repetido. O motivo reportado tem de ser o que de
      // fato descreve a situação, senão o log manda investigar a coisa errada.
      const d = decidirEnvio({
        kind: "boas-vindas",
        optOutAt: null,
        anteriores: [diasAtras(1, "boas-vindas"), diasAtras(2, "primeiro-cao")],
        agora: AGORA,
      });

      expect(d).toEqual({ enviar: false, motivo: "ja-enviado" });
    });
  });

  describe("teto semanal", () => {
    it(`bloqueia o ${MAX_POR_JANELA + 1}º da janela`, () => {
      const d = decidirEnvio({
        kind: "selo-fundador",
        optOutAt: null,
        anteriores: [diasAtras(1, "boas-vindas"), diasAtras(2, "primeiro-cao")],
        agora: AGORA,
      });

      expect(d).toEqual({ enviar: false, motivo: "teto-semanal" });
    });

    it(`deixa passar com ${MAX_POR_JANELA - 1} na janela`, () => {
      const d = decidirEnvio({
        kind: "selo-fundador",
        optOutAt: null,
        anteriores: [diasAtras(1, "boas-vindas")],
        agora: AGORA,
      });

      expect(d).toEqual({ enviar: true });
    });

    it("envio FORA da janela não conta", () => {
      // Dois envios, mas ambos velhos demais. A semana está limpa.
      const d = decidirEnvio({
        kind: "selo-fundador",
        optOutAt: null,
        anteriores: [
          diasAtras(JANELA_DIAS + 1, "boas-vindas"),
          diasAtras(JANELA_DIAS + 30, "primeiro-cao"),
        ],
        agora: AGORA,
      });

      expect(d).toEqual({ enviar: true });
    });

    it("a borda da janela é inclusiva — exatamente 7 dias ainda conta", () => {
      const d = decidirEnvio({
        kind: "selo-fundador",
        optOutAt: null,
        anteriores: [diasAtras(JANELA_DIAS, "boas-vindas"), diasAtras(1, "primeiro-cao")],
        agora: AGORA,
      });

      expect(d).toEqual({ enviar: false, motivo: "teto-semanal" });
    });
  });

  it("registro com data ilegível não silencia e-mail legítimo", () => {
    // O erro seguro é enviar a mais: uma linha corrompida no log não pode
    // deixar o usuário sem o e-mail que ele deveria receber.
    const d = decidirEnvio({
      kind: "selo-fundador",
      optOutAt: null,
      anteriores: [
        { kind: "boas-vindas", sentAt: "não é data" },
        { kind: "primeiro-cao", sentAt: "" },
      ],
      agora: AGORA,
    });

    expect(d).toEqual({ enviar: true });
  });
});
