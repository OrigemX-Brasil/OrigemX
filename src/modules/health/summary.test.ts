import { describe, expect, it } from "vitest";

import type { HealthRecord } from "./queries";
import { latestByKind, litterHealthCoverage, publicHealthLabel } from "./summary";

/** Fábrica curta — só os campos que o resumo lê. */
function rec(
  id: string,
  kind: string,
  applied_on: string,
  product: string | null = null,
): HealthRecord {
  return { id, dog_id: "d1", kind, applied_on, product, notes: null };
}

describe("latestByKind", () => {
  it("devolve o mais recente de cada tipo", () => {
    const result = latestByKind([
      rec("1", "vaccine", "2026-08-01", "V8"),
      rec("2", "vaccine", "2026-08-12", "V10"),
      rec("3", "deworming", "2026-08-10", "Drontal"),
    ]);

    expect(result).toEqual([
      { kind: "deworming", applied_on: "2026-08-10", product: "Drontal" },
      { kind: "vaccine", applied_on: "2026-08-12", product: "V10" },
    ]);
  });

  it("NÃO depende da ordem da entrada — a função ordena por conta própria", () => {
    const registros = [
      rec("1", "vaccine", "2026-08-01", "V8"),
      rec("2", "vaccine", "2026-08-12", "V10"),
      rec("3", "vaccine", "2026-07-05", "V8"),
    ];

    // Ascendente, descendente e embaralhada precisam dar o MESMO resultado:
    // é isso que prova que um `ORDER BY` diferente na query não muda a tela.
    const asc = latestByKind([...registros].sort((a, b) => a.applied_on.localeCompare(b.applied_on)));
    const desc = latestByKind(
      [...registros].sort((a, b) => b.applied_on.localeCompare(a.applied_on)),
    );

    expect(asc).toEqual(desc);
    expect(asc[0].applied_on).toBe("2026-08-12");
  });

  it("empate de data é estável, não alterna entre os dois registros", () => {
    const a = latestByKind([
      rec("aaa", "vaccine", "2026-08-12", "V10"),
      rec("zzz", "vaccine", "2026-08-12", "Antirrábica"),
    ]);
    const b = latestByKind([
      rec("zzz", "vaccine", "2026-08-12", "Antirrábica"),
      rec("aaa", "vaccine", "2026-08-12", "V10"),
    ]);

    expect(a).toEqual(b);
  });

  it("tipo sem registro não aparece — quem renderiza não precisa checar existência", () => {
    const result = latestByKind([rec("1", "deworming", "2026-08-10")]);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("deworming");
  });

  it("lista vazia devolve lista vazia", () => {
    expect(latestByKind([])).toEqual([]);
  });

  it("mantém a ordem da referência: vermífugo antes de vacina", () => {
    const result = latestByKind([
      rec("1", "vaccine", "2026-08-12"),
      rec("2", "deworming", "2026-08-10"),
    ]);

    expect(result.map((r) => r.kind)).toEqual(["deworming", "vaccine"]);
  });
});

describe("litterHealthCoverage", () => {
  it("cobertura total marca complete — é o que autoriza o checkmark verde", () => {
    const byDog = new Map([
      ["p1", [rec("1", "vaccine", "2026-08-10")]],
      ["p2", [rec("2", "vaccine", "2026-08-12")]],
    ]);

    const result = litterHealthCoverage(["p1", "p2"], byDog);

    expect(result).toEqual([
      { kind: "vaccine", applied_on: "2026-08-12", covered: 2, total: 2, complete: true },
    ]);
  });

  it("cobertura PARCIAL não marca complete — a afirmação enganosa é o bug que isto evita", () => {
    const byDog = new Map([["p1", [rec("1", "vaccine", "2026-08-10")]]]);

    const [vacina] = litterHealthCoverage(["p1", "p2", "p3"], byDog);

    expect(vacina.covered).toBe(1);
    expect(vacina.total).toBe(3);
    expect(vacina.complete).toBe(false);
  });

  it("a data exibida é a MAIS RECENTE entre os filhotes", () => {
    const byDog = new Map([
      ["p1", [rec("1", "deworming", "2026-07-01")]],
      ["p2", [rec("2", "deworming", "2026-08-20")]],
    ]);

    expect(litterHealthCoverage(["p1", "p2"], byDog)[0].applied_on).toBe("2026-08-20");
  });

  it("vários registros do MESMO filhote contam como UM filhote coberto", () => {
    // Três doses no p1 não podem virar "3 de 2 filhotes".
    const byDog = new Map([
      [
        "p1",
        [
          rec("1", "vaccine", "2026-06-01"),
          rec("2", "vaccine", "2026-07-01"),
          rec("3", "vaccine", "2026-08-01"),
        ],
      ],
    ]);

    const [vacina] = litterHealthCoverage(["p1", "p2"], byDog);

    expect(vacina.covered).toBe(1);
    expect(vacina.complete).toBe(false);
  });

  it("ninhada sem filhote visível não produz linha nenhuma — evita divisão por zero na tela", () => {
    expect(litterHealthCoverage([], new Map())).toEqual([]);
  });

  it("filhote sem nenhum registro não quebra a contagem dos outros", () => {
    const byDog = new Map([["p1", [rec("1", "deworming", "2026-08-10")]]]);

    const result = litterHealthCoverage(["p1", "p2"], byDog);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "deworming", covered: 1, total: 2, complete: false });
  });

  it("tipos independentes: um completo e outro parcial na mesma ninhada", () => {
    const byDog = new Map([
      ["p1", [rec("1", "deworming", "2026-08-01"), rec("2", "vaccine", "2026-08-12")]],
      ["p2", [rec("3", "deworming", "2026-08-01")]],
    ]);

    const result = litterHealthCoverage(["p1", "p2"], byDog);

    expect(result.find((r) => r.kind === "deworming")?.complete).toBe(true);
    expect(result.find((r) => r.kind === "vaccine")?.complete).toBe(false);
  });
});

describe("publicHealthLabel", () => {
  it("usa 'Última vacina', não 'Primeira' — exibimos o registro mais recente", () => {
    expect(publicHealthLabel("vaccine")).toBe("Última vacina em");
    expect(publicHealthLabel("deworming")).toBe("Vermífugo aplicado em");
  });

  it("tipo desconhecido volta como veio, sem quebrar a página", () => {
    expect(publicHealthLabel("cirurgia")).toBe("cirurgia");
  });
});
