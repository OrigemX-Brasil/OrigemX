import { describe, expect, it } from "vitest";

import {
  calculateCompleteness,
  completenessLevel,
  isFilled,
  type KennelValues,
} from "./completeness";
import { KENNEL_SCORED_FIELDS, WEIGHT_VALUE } from "./fields";

/**
 * Os testes derivam o esperado da CONFIGURAÇÃO, em vez de fixar números.
 *
 * É deliberado: os campos definitivos do cliente ainda não chegaram. Um teste
 * que afirmasse "descrição preenchida = 40%" quebraria a cada ajuste em
 * `fields.ts` sem que nada estivesse errado — e a suíte viraria ruído que se
 * aprende a ignorar. O que precisa continuar verdadeiro é a REGRA.
 */

/** Preenche o conjunto de campos pedido com um valor plausível. */
function withFilled(weights: Array<"required" | "recommended">): KennelValues {
  const values: KennelValues = {};
  for (const field of KENNEL_SCORED_FIELDS) {
    if (weights.includes(field.weight as "required" | "recommended")) {
      values[field.name] = "preenchido";
    }
  }
  return values;
}

const allFilled = () => withFilled(["required", "recommended"]);

describe("isFilled", () => {
  it("aceita conteúdo de verdade", () => {
    expect(isFilled("Canil Aurora")).toBe(true);
    expect(isFilled(0)).toBe(true);
    expect(isFilled(false)).toBe(true);
    expect(isFilled(["a"])).toBe(true);
  });

  it("recusa vazio", () => {
    expect(isFilled(null)).toBe(false);
    expect(isFilled(undefined)).toBe(false);
    expect(isFilled("")).toBe(false);
    expect(isFilled([])).toBe(false);
  });

  it("recusa string só de espaço — digitar ' ' não completa cadastro", () => {
    expect(isFilled(" ")).toBe(false);
    expect(isFilled("   \t\n  ")).toBe(false);
  });

  it("recusa número inválido", () => {
    expect(isFilled(Number.NaN)).toBe(false);
    expect(isFilled(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("calculateCompleteness", () => {
  it("nada preenchido é 0", () => {
    const r = calculateCompleteness({});
    expect(r.percent).toBe(0);
    expect(r.filledCount).toBe(0);
  });

  it("tudo preenchido é exatamente 100 — sem 99 por arredondamento", () => {
    const r = calculateCompleteness(allFilled());
    expect(r.percent).toBe(100);
    expect(r.missingRequired).toHaveLength(0);
    expect(r.missingRecommended).toHaveLength(0);
    expect(r.filledCount).toBe(KENNEL_SCORED_FIELDS.length);
  });

  it("percentual fica entre 0 e 100 em qualquer combinação", () => {
    for (const combo of [[], ["required"], ["recommended"], ["required", "recommended"]] as const) {
      const r = calculateCompleteness(withFilled([...combo]));
      expect(r.percent).toBeGreaterThanOrEqual(0);
      expect(r.percent).toBeLessThanOrEqual(100);
    }
  });

  it("obrigatório vale mais que recomendado", () => {
    const soObrigatorios = calculateCompleteness(withFilled(["required"]));
    const soRecomendados = calculateCompleteness(withFilled(["recommended"]));

    // Vale só se a configuração tiver a mesma quantidade dos dois; do
    // contrário a comparação é sobre peso total, não sobre prioridade.
    const nReq = KENNEL_SCORED_FIELDS.filter((f) => f.weight === "required").length;
    const nRec = KENNEL_SCORED_FIELDS.filter((f) => f.weight === "recommended").length;

    if (nReq === nRec) {
      expect(soObrigatorios.percent).toBeGreaterThan(soRecomendados.percent);
    } else {
      // Independente da quantidade, o peso unitário do obrigatório é maior.
      expect(WEIGHT_VALUE.required).toBeGreaterThan(WEIGHT_VALUE.recommended);
    }
  });

  it("campo opcional não muda o percentual", () => {
    const base = calculateCompleteness(allFilled());
    const comOpcional = calculateCompleteness({
      ...allFilled(),
      website_url: "https://exemplo.test",
    });
    expect(comOpcional.percent).toBe(base.percent);
  });

  it("aponta exatamente quais obrigatórios faltam", () => {
    const r = calculateCompleteness(withFilled(["recommended"]));
    const esperados = KENNEL_SCORED_FIELDS.filter((f) => f.weight === "required").map(
      (f) => f.name,
    );
    expect(r.missingRequired.map((f) => f.name)).toEqual(esperados);
    expect(r.missingRecommended).toHaveLength(0);
  });

  it("aponta exatamente quais recomendados faltam", () => {
    const r = calculateCompleteness(withFilled(["required"]));
    const esperados = KENNEL_SCORED_FIELDS.filter((f) => f.weight === "recommended").map(
      (f) => f.name,
    );
    expect(r.missingRecommended.map((f) => f.name)).toEqual(esperados);
    expect(r.missingRequired).toHaveLength(0);
  });

  it("espaço em branco não conta como preenchido", () => {
    const values: KennelValues = {};
    for (const f of KENNEL_SCORED_FIELDS) values[f.name] = "   ";
    const r = calculateCompleteness(values);
    expect(r.percent).toBe(0);
    expect(r.missingRequired.length + r.missingRecommended.length).toBe(
      KENNEL_SCORED_FIELDS.length,
    );
  });

  it("ignora chave que não é campo configurado", () => {
    const base = calculateCompleteness(allFilled());
    const comLixo = calculateCompleteness({
      ...allFilled(),
      // @ts-expect-error — campo inexistente de propósito
      campo_que_nao_existe: "valor",
    });
    expect(comLixo.percent).toBe(base.percent);
  });

  it("preencher mais nunca reduz o percentual", () => {
    const vazio = calculateCompleteness({}).percent;
    const parcial = calculateCompleteness(withFilled(["required"])).percent;
    const cheio = calculateCompleteness(allFilled()).percent;
    expect(parcial).toBeGreaterThanOrEqual(vazio);
    expect(cheio).toBeGreaterThanOrEqual(parcial);
  });

  it("devolve inteiro, para a UI não precisar arredondar de novo", () => {
    for (const combo of [[], ["required"], ["recommended"], ["required", "recommended"]] as const) {
      const r = calculateCompleteness(withFilled([...combo]));
      expect(Number.isInteger(r.percent)).toBe(true);
    }
  });
});

describe("completenessLevel", () => {
  it("classifica as faixas", () => {
    expect(completenessLevel(0)).toBe("vazio");
    expect(completenessLevel(1)).toBe("inicial");
    expect(completenessLevel(49)).toBe("inicial");
    expect(completenessLevel(50)).toBe("parcial");
    expect(completenessLevel(99)).toBe("parcial");
    expect(completenessLevel(100)).toBe("completo");
  });
});
