import { describe, expect, it } from "vitest";

import {
  countBySeverity,
  evaluateRules,
  mergeAlerts,
  type AlertRule,
  type AlertSubject,
} from "./engine";

type F = { a?: boolean; b?: boolean; falta?: string[] };

function sujeito(id: string, facts: F): AlertSubject<F> {
  return { id, label: `Sujeito ${id}`, href: `/x/${id}`, facts };
}

const regraA: AlertRule<F> = {
  id: "regra-a",
  severity: "info",
  title: "A",
  detail: "texto de A",
  when: (f) => f.a === true,
};

const regraB: AlertRule<F> = {
  id: "regra-b",
  severity: "info",
  title: "B",
  detail: "texto de B",
  when: (f) => f.b === true,
};

describe("evaluateRules — o básico", () => {
  it("só dispara a regra cuja condição é verdadeira", () => {
    const alerts = evaluateRules([regraA, regraB], [sujeito("1", { a: true })]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.ruleId).toBe("regra-a");
    expect(alerts[0]?.detail).toBe("texto de A");
  });

  it("sem sujeito e sem regra não inventa alerta", () => {
    expect(evaluateRules([regraA], [])).toEqual([]);
    expect(evaluateRules([], [sujeito("1", { a: true })])).toEqual([]);
  });

  it("nada verdadeiro devolve lista vazia — ausência de alerta é resposta", () => {
    expect(evaluateRules([regraA, regraB], [sujeito("1", {})])).toEqual([]);
  });

  it("leva o alvo com rótulo e link, para o alerta ser acionável", () => {
    const alerts = evaluateRules([regraA], [sujeito("7", { a: true })]);

    expect(alerts[0]?.targets).toEqual([{ id: "7", label: "Sujeito 7", href: "/x/7" }]);
  });

  it("actionLabel só aparece quando a regra define", () => {
    const [semAcao] = evaluateRules([regraA], [sujeito("1", { a: true })]);
    const [comAcao] = evaluateRules(
      [{ ...regraA, actionLabel: "Resolver" }],
      [sujeito("1", { a: true })],
    );

    expect(semAcao).not.toHaveProperty("actionLabel");
    expect(comAcao?.actionLabel).toBe("Resolver");
  });
});

describe("evaluateRules — determinismo", () => {
  it("a mesma entrada dá exatamente a mesma saída", () => {
    const subjects = [sujeito("1", { a: true }), sujeito("2", { a: true, b: true })];

    expect(evaluateRules([regraA, regraB], subjects)).toEqual(
      evaluateRules([regraA, regraB], subjects),
    );
  });

  it("a condição só enxerga os fatos que recebe", () => {
    const vistos: F[] = [];
    const espiao: AlertRule<F> = { ...regraA, when: (f) => (vistos.push(f), false) };

    evaluateRules([espiao], [sujeito("1", { a: true, b: false })]);

    expect(vistos).toEqual([{ a: true, b: false }]);
  });
});

describe("evaluateRules — agrupamento por texto idêntico", () => {
  it("quarenta sujeitos com o mesmo problema viram UM alerta", () => {
    const subjects = Array.from({ length: 40 }, (_, i) => sujeito(String(i), { a: true }));
    const alerts = evaluateRules([regraA], subjects);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.targets).toHaveLength(40);
  });

  it("preserva a ordem dos sujeitos dentro do alerta", () => {
    const alerts = evaluateRules(
      [regraA],
      [sujeito("x", { a: true }), sujeito("y", { a: true }), sujeito("z", { a: true })],
    );

    expect(alerts[0]?.targets.map((t) => t.id)).toEqual(["x", "y", "z"]);
  });

  it("detail que varia por sujeito NÃO agrupa — senão a mensagem mentiria", () => {
    const regra: AlertRule<F> = {
      id: "falta",
      severity: "info",
      title: "Falta campo",
      detail: (f) => `Falta: ${f.falta?.join(", ")}`,
      when: (f) => (f.falta?.length ?? 0) > 0,
    };

    const alerts = evaluateRules(
      [regra],
      [sujeito("1", { falta: ["Cidade"] }), sujeito("2", { falta: ["Logo"] })],
    );

    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.detail)).toEqual(["Falta: Cidade", "Falta: Logo"]);
  });

  it("detail que COINCIDE agrupa, mesmo vindo de função", () => {
    const regra: AlertRule<F> = {
      id: "falta",
      severity: "info",
      title: "Falta campo",
      detail: (f) => `Falta: ${f.falta?.join(", ")}`,
      when: (f) => (f.falta?.length ?? 0) > 0,
    };

    const alerts = evaluateRules(
      [regra],
      [sujeito("1", { falta: ["Cidade"] }), sujeito("2", { falta: ["Cidade"] })],
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.targets).toHaveLength(2);
  });

  it("regras diferentes nunca se fundem, mesmo com texto igual", () => {
    const alerts = evaluateRules(
      [regraA, { ...regraB, detail: "texto de A" }],
      [sujeito("1", { a: true, b: true })],
    );

    expect(alerts.map((x) => x.ruleId)).toEqual(["regra-a", "regra-b"]);
  });
});

describe("evaluateRules — ordem", () => {
  it("atenção vem antes de info, mesmo declarada depois", () => {
    const alerts = evaluateRules(
      [regraA, { ...regraB, severity: "atencao" as const }],
      [sujeito("1", { a: true, b: true })],
    );

    expect(alerts.map((x) => x.ruleId)).toEqual(["regra-b", "regra-a"]);
  });

  it("dentro da mesma severidade, manda a POSIÇÃO NO CATÁLOGO", () => {
    const subjects = [sujeito("1", { a: true, b: true })];

    expect(evaluateRules([regraA, regraB], subjects).map((x) => x.ruleId)).toEqual([
      "regra-a",
      "regra-b",
    ]);
    // Reordenar o catálogo reordena a tela. É o que permite ao cliente mudar
    // prioridade sem tocar em código de componente.
    expect(evaluateRules([regraB, regraA], subjects).map((x) => x.ruleId)).toEqual([
      "regra-b",
      "regra-a",
    ]);
  });
});

describe("evaluateRules — alerta não bloqueia", () => {
  it("não existe severidade capaz de impedir um fluxo", () => {
    const alerts = evaluateRules(
      [{ ...regraA, severity: "atencao" as const }],
      [sujeito("1", { a: true })],
    );

    // O alerta é texto e alvo. Não há campo de bloqueio, e não deve haver: se
    // algo precisa impedir gravação, o lugar é a validação, não este motor.
    expect(Object.keys(alerts[0] ?? {}).sort()).toEqual([
      "detail",
      "ruleId",
      "severity",
      "targets",
      "title",
    ]);
  });

  it("não existe campo de canal — in-app apenas, por contrato", () => {
    const alerts = evaluateRules([regraA], [sujeito("1", { a: true })]);
    const chaves = Object.keys(alerts[0] ?? {});

    for (const proibida of ["email", "push", "sms", "whatsapp", "channel", "canal"]) {
      expect(chaves).not.toContain(proibida);
    }
  });
});

describe("mergeAlerts", () => {
  it("junta lotes mantendo atenção na frente", () => {
    const info = evaluateRules([regraA], [sujeito("1", { a: true })]);
    const atencao = evaluateRules(
      [{ ...regraB, severity: "atencao" as const }],
      [sujeito("2", { b: true })],
    );

    expect(mergeAlerts(info, atencao).map((x) => x.ruleId)).toEqual(["regra-b", "regra-a"]);
  });

  it("empate de severidade preserva a ordem de chegada dos lotes", () => {
    const primeiro = evaluateRules([regraA], [sujeito("1", { a: true })]);
    const segundo = evaluateRules([regraB], [sujeito("2", { b: true })]);

    expect(mergeAlerts(primeiro, segundo).map((x) => x.ruleId)).toEqual(["regra-a", "regra-b"]);
    expect(mergeAlerts(segundo, primeiro).map((x) => x.ruleId)).toEqual(["regra-b", "regra-a"]);
  });

  it("lote vazio não atrapalha", () => {
    expect(mergeAlerts([], [], [])).toEqual([]);
  });
});

describe("countBySeverity", () => {
  it("conta alertas, não alvos", () => {
    const alerts = evaluateRules(
      [regraA, { ...regraB, severity: "atencao" as const }],
      [sujeito("1", { a: true, b: true }), sujeito("2", { a: true })],
    );

    expect(countBySeverity(alerts)).toEqual({ atencao: 1, info: 1 });
  });

  it("lista vazia devolve zeros, não objeto vazio", () => {
    expect(countBySeverity([])).toEqual({ atencao: 0, info: 0 });
  });
});
