import { describe, expect, it } from "vitest";

import { evaluateRules, type AlertRule, type AlertSubject } from "./engine";
import {
  ACCOUNT_RULES,
  DOG_RULES,
  KENNEL_RULES,
  LIMITES,
  listar,
  type AccountFacts,
  type DogFacts,
  type KennelFacts,
} from "./rules";

/** Canil sem nenhuma pendência: o ponto de partida de todo caso abaixo. */
function canil(over: Partial<KennelFacts> = {}): KennelFacts {
  return {
    completenessPercent: 100,
    missingRequired: [],
    missingRecommended: [],
    hasLogo: true,
    isPublished: true,
    hasDogs: true,
    hasFounderBadge: true,
    founderMissing: [],
    ...over,
  };
}

function cao(over: Partial<DogFacts> = {}): DogFacts {
  return {
    hasPhoto: true,
    hasSire: true,
    hasDam: true,
    hasKennel: true,
    hasBreed: true,
    isPublished: true,
    userHasKennel: true,
    ...over,
  };
}

function conta(over: Partial<AccountFacts> = {}): AccountFacts {
  return { kennelCount: 1, dogCount: 1, ...over };
}

/** Quais regras disparam para um único sujeito. */
function disparadas<F>(rules: readonly AlertRule<F>[], facts: F): string[] {
  const subject: AlertSubject<F> = { id: "s", label: "S", href: "/s", facts };
  return evaluateRules(rules, [subject]).map((a) => a.ruleId);
}

function detalhe<F>(rules: readonly AlertRule<F>[], facts: F, ruleId: string): string | undefined {
  const subject: AlertSubject<F> = { id: "s", label: "S", href: "/s", facts };
  return evaluateRules(rules, [subject]).find((a) => a.ruleId === ruleId)?.detail;
}

describe("listar", () => {
  it("escreve como gente, não como máquina", () => {
    expect(listar([])).toBe("");
    expect(listar(["Cidade"])).toBe("Cidade");
    expect(listar(["Cidade", "Estado"])).toBe("Cidade e Estado");
    expect(listar(["Cidade", "Estado", "Logo"])).toBe("Cidade, Estado e Logo");
  });
});

describe("catálogo — sanidade estrutural", () => {
  const todas = [...ACCOUNT_RULES, ...KENNEL_RULES, ...DOG_RULES];

  it("todo id é único — id é chave de teste e sobrevive a mudança de texto", () => {
    const ids = todas.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("nenhuma regra fica sem título ou sem texto", () => {
    for (const rule of todas) {
      expect(rule.title.trim().length).toBeGreaterThan(0);
      expect(typeof rule.detail === "string" ? rule.detail.trim().length : 1).toBeGreaterThan(0);
    }
  });

  it("só existem as duas severidades — não há 'erro', porque alerta não bloqueia", () => {
    for (const rule of todas) {
      expect(["atencao", "info"]).toContain(rule.severity);
    }
  });
});

describe("regras da conta", () => {
  it("conta sem canil é atenção — sem canil o produto não faz nada", () => {
    expect(disparadas(ACCOUNT_RULES, conta({ kennelCount: 0 }))).toEqual(["conta-sem-canil"]);
  });

  it("com canil, cala a boca", () => {
    expect(disparadas(ACCOUNT_RULES, conta({ kennelCount: 2 }))).toEqual([]);
  });
});

describe("regras do canil", () => {
  it("canil completo, publicado, com logo, cão e selo não gera nada", () => {
    expect(disparadas(KENNEL_RULES, canil())).toEqual([]);
  });

  it("campo obrigatório em branco é atenção e diz QUAIS", () => {
    const facts = canil({
      missingRequired: [{ name: "name", label: "Nome do canil" }],
      completenessPercent: 60,
    });

    expect(disparadas(KENNEL_RULES, facts)).toContain("canil-sem-campo-obrigatorio");
    expect(detalhe(KENNEL_RULES, facts, "canil-sem-campo-obrigatorio")).toContain("Nome do canil");
  });

  it("canil sem logo dispara a regra dedicada — o caso citado pelo cliente", () => {
    expect(disparadas(KENNEL_RULES, canil({ hasLogo: false }))).toContain("canil-sem-logo");
  });

  it("canil sem cão é atenção", () => {
    expect(disparadas(KENNEL_RULES, canil({ hasDogs: false }))).toContain("canil-sem-cao");
  });

  it("completo e despublicado avisa que ninguém consegue abrir", () => {
    expect(disparadas(KENNEL_RULES, canil({ isPublished: false }))).toContain(
      "canil-completo-nao-publicado",
    );
  });

  it("incompleto e despublicado NÃO avisa sobre publicar — falta trabalho antes", () => {
    const facts = canil({
      isPublished: false,
      completenessPercent: 70,
      missingRecommended: [{ name: "city", label: "Cidade" }],
    });

    expect(disparadas(KENNEL_RULES, facts)).not.toContain("canil-completo-nao-publicado");
  });

  /**
   * O logo pesa na completude E tem regra própria. Sem cuidado, o criador leria
   * duas vezes que falta a mesma coisa — e alerta repetido é alerta ignorado.
   */
  it("o logo sai da lista genérica de pendências, porque já tem regra própria", () => {
    const facts = canil({
      hasLogo: false,
      completenessPercent: 80,
      missingRecommended: [{ name: "logo_url", label: "Logo" }],
    });
    const ids = disparadas(KENNEL_RULES, facts);

    expect(ids).toContain("canil-sem-logo");
    expect(ids).not.toContain("canil-cadastro-incompleto");
  });

  it("com outra pendência além do logo, a regra genérica volta — e sem citar o logo", () => {
    const facts = canil({
      hasLogo: false,
      completenessPercent: 60,
      missingRecommended: [
        { name: "logo_url", label: "Logo" },
        { name: "city", label: "Cidade" },
      ],
    });

    const texto = detalhe(KENNEL_RULES, facts, "canil-cadastro-incompleto");
    expect(texto).toContain("Cidade");
    expect(texto).not.toContain("Logo");
    expect(texto).toContain("60%");
  });

  it("pendência obrigatória silencia a regra genérica — uma coisa de cada vez", () => {
    const facts = canil({
      missingRequired: [{ name: "name", label: "Nome do canil" }],
      missingRecommended: [{ name: "city", label: "Cidade" }],
      completenessPercent: 40,
    });

    expect(disparadas(KENNEL_RULES, facts)).not.toContain("canil-cadastro-incompleto");
  });

  describe("selo Criador Fundador", () => {
    it("avisa quando falta pouco", () => {
      const facts = canil({ hasFounderBadge: false, founderMissing: ["Logo"] });

      expect(disparadas(KENNEL_RULES, facts)).toContain("canil-perto-do-selo");
      expect(detalhe(KENNEL_RULES, facts, "canil-perto-do-selo")).toContain("Logo");
    });

    it("cala quando falta muito — quem tem cinco pendências precisa do básico", () => {
      const facts = canil({
        hasFounderBadge: false,
        founderMissing: ["Nome do canil", "Cidade", "Estado", "Logo"],
      });

      expect(disparadas(KENNEL_RULES, facts)).not.toContain("canil-perto-do-selo");
    });

    it("respeita o limite configurável, sem recompilar regra", () => {
      const noLimite = Array.from({ length: LIMITES.seloCriteriosFaltandoMax }, (_, i) => `C${i}`);
      const acima = [...noLimite, "excedente"];

      expect(
        disparadas(KENNEL_RULES, canil({ hasFounderBadge: false, founderMissing: noLimite })),
      ).toContain("canil-perto-do-selo");
      expect(
        disparadas(KENNEL_RULES, canil({ hasFounderBadge: false, founderMissing: acima })),
      ).not.toContain("canil-perto-do-selo");
    });

    it("quem já tem o selo nunca é cobrado por ele", () => {
      const facts = canil({ hasFounderBadge: true, founderMissing: ["Logo"] });

      expect(disparadas(KENNEL_RULES, facts)).not.toContain("canil-perto-do-selo");
    });

    it("não promete o selo — o pool pode estar esgotado", () => {
      const texto = detalhe(
        KENNEL_RULES,
        canil({ hasFounderBadge: false, founderMissing: ["Logo"] }),
        "canil-perto-do-selo",
      );

      expect(texto).toContain("enquanto houver número disponível");
    });
  });
});

describe("regras do cão", () => {
  it("cão completo não gera nada", () => {
    expect(disparadas(DOG_RULES, cao())).toEqual([]);
  });

  it("cão sem foto dispara — o caso citado pelo cliente", () => {
    expect(disparadas(DOG_RULES, cao({ hasPhoto: false }))).toEqual(["cao-sem-foto"]);
  });

  it("sem pai E sem mãe dispara; com um dos dois, não", () => {
    expect(disparadas(DOG_RULES, cao({ hasSire: false, hasDam: false }))).toContain(
      "cao-sem-pedigree",
    );
    expect(disparadas(DOG_RULES, cao({ hasSire: false }))).not.toContain("cao-sem-pedigree");
    expect(disparadas(DOG_RULES, cao({ hasDam: false }))).not.toContain("cao-sem-pedigree");
  });

  it("cão sem canil só é cobrado de quem TEM canil", () => {
    expect(disparadas(DOG_RULES, cao({ hasKennel: false, userHasKennel: true }))).toContain(
      "cao-sem-canil",
    );
    // Sem canil nenhum, o aviso certo é o da conta — cobrar vínculo aqui seria
    // mandar o criador para uma tela que não resolve nada.
    expect(disparadas(DOG_RULES, cao({ hasKennel: false, userHasKennel: false }))).not.toContain(
      "cao-sem-canil",
    );
  });

  it("raça em branco dispara; espaço em branco não conta como preenchido", () => {
    expect(disparadas(DOG_RULES, cao({ hasBreed: false }))).toContain("cao-sem-raca");
  });

  it("um cão pode acumular várias pendências, na ordem do catálogo", () => {
    const ids = disparadas(
      DOG_RULES,
      cao({ hasPhoto: false, hasSire: false, hasDam: false, hasBreed: false }),
    );

    expect(ids).toEqual(["cao-sem-foto", "cao-sem-pedigree", "cao-sem-raca"]);
  });
});

describe("agrupamento entre sujeitos reais", () => {
  it("doze cães sem foto viram um alerta com doze alvos", () => {
    const subjects: AlertSubject<DogFacts>[] = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      label: `Cão ${i}`,
      href: `/painel/caes/d${i}`,
      facts: cao({ hasPhoto: false }),
    }));

    const alerts = evaluateRules(DOG_RULES, subjects);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.ruleId).toBe("cao-sem-foto");
    expect(alerts[0]?.targets).toHaveLength(12);
  });

  it("dois canis com pendências DIFERENTES não se fundem", () => {
    const subjects: AlertSubject<KennelFacts>[] = [
      {
        id: "k1",
        label: "Canil A",
        href: "/painel/canis/k1",
        facts: canil({ missingRequired: [{ name: "name", label: "Nome do canil" }] }),
      },
      {
        id: "k2",
        label: "Canil B",
        href: "/painel/canis/k2",
        facts: canil({ missingRequired: [{ name: "slug", label: "Endereço público" }] }),
      },
    ];

    const alerts = evaluateRules(KENNEL_RULES, subjects).filter(
      (a) => a.ruleId === "canil-sem-campo-obrigatorio",
    );

    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.targets[0]?.label).toBe("Canil A");
    expect(alerts[1]?.targets[0]?.label).toBe("Canil B");
  });
});
