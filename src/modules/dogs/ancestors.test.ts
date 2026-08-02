import { describe, expect, it } from "vitest";

import {
  describeCandidate,
  filterEligibleParents,
  ineligibilityOf,
  isEligibleParent,
  isGhostAncestor,
  isSearchable,
  normalizeSearchTerm,
  rankCandidates,
  scoreCandidate,
  type AncestorCandidate,
} from "./ancestors";

function dog(over: Partial<AncestorCandidate> & { id: string; name: string }): AncestorCandidate {
  return {
    sex: "male",
    born_on: null,
    breed: null,
    kennel_id: null,
    owner_id: null,
    ...over,
  };
}

describe("normalizeSearchTerm", () => {
  it("remove acento — senão 'Ipê' não acha 'IPE' e o criador duplica o cão", () => {
    expect(normalizeSearchTerm("Ipê")).toBe("ipe");
    expect(normalizeSearchTerm("Açaí")).toBe("acai");
    expect(normalizeSearchTerm("ÑANDÚ")).toBe("nandu");
  });

  it("colapsa espaço e apara pontas", () => {
    expect(normalizeSearchTerm("  Rex   de   Aurora  ")).toBe("rex de aurora");
  });
});

describe("isSearchable", () => {
  it("recusa termo curto, que devolveria a base inteira", () => {
    expect(isSearchable("")).toBe(false);
    expect(isSearchable("r")).toBe(false);
    expect(isSearchable("  a  ")).toBe(false);
  });

  it("aceita a partir de dois caracteres", () => {
    expect(isSearchable("re")).toBe(true);
    expect(isSearchable("Ré")).toBe(true);
  });
});

describe("ineligibilityOf", () => {
  const macho = dog({ id: "m1", name: "Rex", sex: "male" });
  const femea = dog({ id: "f1", name: "Aurora", sex: "female" });

  it("recusa sexo incompatível com a posição", () => {
    expect(ineligibilityOf(femea, { slot: "sire" })).toBe("sexo-incompativel");
    expect(ineligibilityOf(macho, { slot: "dam" })).toBe("sexo-incompativel");
  });

  it("aceita sexo compatível", () => {
    expect(ineligibilityOf(macho, { slot: "sire" })).toBeNull();
    expect(ineligibilityOf(femea, { slot: "dam" })).toBeNull();
  });

  it("recusa o próprio cão", () => {
    expect(ineligibilityOf(macho, { slot: "sire", dogId: "m1" })).toBe("proprio-cao");
  });

  it("o próprio cão vem antes do sexo — a mensagem mais útil é a mais específica", () => {
    // Cão macho na posição de mãe E sendo ele mesmo: dizer "sexo incompatível"
    // esconderia o problema real.
    expect(ineligibilityOf(macho, { slot: "dam", dogId: "m1" })).toBe("proprio-cao");
  });

  it("recusa quem já ocupa a outra posição", () => {
    expect(ineligibilityOf(macho, { slot: "sire", otherParentId: "m1" })).toBe(
      "ja-e-o-outro-progenitor",
    );
  });

  it("recusa descendente — selecioná-lo fecharia um ciclo", () => {
    const r = ineligibilityOf(macho, {
      slot: "sire",
      descendantIds: new Set(["m1", "x9"]),
    });
    expect(r).toBe("criaria-ciclo");
  });

  it("aceita quem não é descendente", () => {
    expect(ineligibilityOf(macho, { slot: "sire", descendantIds: new Set(["outro"]) })).toBeNull();
  });

  it("sem contexto de descendência, não inventa impedimento", () => {
    // Ao criar um cão novo ainda não há descendentes; a ausência do conjunto
    // não pode ser lida como "tudo é descendente".
    expect(isEligibleParent(macho, { slot: "sire" })).toBe(true);
  });
});

describe("filterEligibleParents", () => {
  const candidatos = [
    dog({ id: "m1", name: "Rex", sex: "male" }),
    dog({ id: "m2", name: "Thor", sex: "male" }),
    dog({ id: "f1", name: "Aurora", sex: "female" }),
    dog({ id: "m3", name: "Filho", sex: "male" }),
  ];

  it("deixa só os machos para a posição de pai", () => {
    const r = filterEligibleParents(candidatos, { slot: "sire" });
    expect(r.map((c) => c.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("aplica todas as regras juntas", () => {
    const r = filterEligibleParents(candidatos, {
      slot: "sire",
      dogId: "m1",
      otherParentId: "m2",
      descendantIds: new Set(["m3"]),
    });
    expect(r).toHaveLength(0);
  });

  it("linebreeding continua possível — ancestral repetido não é impedimento", () => {
    // O mesmo macho pode ser pai de dois cães diferentes; só descendência
    // direta bloqueia. Esta é a regra que o UNION da CTE preserva no banco.
    const r = filterEligibleParents(candidatos, { slot: "sire", dogId: "outro-cao" });
    expect(r.map((c) => c.id)).toContain("m1");
  });
});

describe("scoreCandidate", () => {
  const base = dog({
    id: "1",
    name: "Rex de Aurora",
    registration: "CBKC-12345",
    microchip: "900000000000001",
  });

  it("identificador exato ganha de tudo — número é único, nome não", () => {
    const porRegistro = scoreCandidate(base, "CBKC-12345");
    const porNome = scoreCandidate(base, "Rex de Aurora");
    expect(porRegistro).toBeGreaterThan(porNome);
  });

  it("microchip exato também pontua no topo", () => {
    expect(scoreCandidate(base, "900000000000001")).toBeGreaterThan(scoreCandidate(base, "Rex"));
  });

  it("nome exato ganha de prefixo, que ganha de meio de palavra", () => {
    const exato = scoreCandidate(dog({ id: "a", name: "Rex" }), "Rex");
    const prefixo = scoreCandidate(dog({ id: "b", name: "Rex de Aurora" }), "Rex");
    const meio = scoreCandidate(dog({ id: "c", name: "Torex" }), "rex");
    expect(exato).toBeGreaterThan(prefixo);
    expect(prefixo).toBeGreaterThan(meio);
  });

  it("início de palavra interna ganha de meio de palavra", () => {
    const inicioDePalavra = scoreCandidate(dog({ id: "a", name: "Rex de Aurora" }), "aurora");
    const meioDePalavra = scoreCandidate(dog({ id: "b", name: "Belaurora" }), "aurora");
    expect(inicioDePalavra).toBeGreaterThan(meioDePalavra);
  });

  it("ignora acento e caixa", () => {
    expect(scoreCandidate(dog({ id: "a", name: "Ipê Amarelo" }), "IPE")).toBeGreaterThan(0);
  });

  it("zero quando não casa", () => {
    expect(scoreCandidate(base, "zebra")).toBe(0);
    expect(scoreCandidate(base, "")).toBe(0);
    expect(scoreCandidate(base, "   ")).toBe(0);
  });
});

describe("rankCandidates", () => {
  const lista = [
    dog({ id: "1", name: "Torex" }),
    dog({ id: "2", name: "Rex" }),
    dog({ id: "3", name: "Rex de Aurora" }),
    dog({ id: "4", name: "Aurora" }),
  ];

  it("ordena por relevância", () => {
    expect(rankCandidates(lista, "rex").map((c) => c.id)).toEqual(["2", "3", "1"]);
  });

  it("descarta quem não casou", () => {
    expect(rankCandidates(lista, "rex").map((c) => c.id)).not.toContain("4");
  });

  it("desempata por nome, para a lista não dançar entre carregamentos", () => {
    const empatados = [
      dog({ id: "b", name: "Zeus de Aurora" }),
      dog({ id: "a", name: "Apolo de Aurora" }),
    ];
    expect(rankCandidates(empatados, "aurora").map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("devolve vazio para termo vazio", () => {
    expect(rankCandidates(lista, "")).toEqual([]);
  });
});

describe("isGhostAncestor", () => {
  it("é fantasma só sem dono E sem canil", () => {
    expect(isGhostAncestor({ owner_id: null, kennel_id: null })).toBe(true);
  });

  it("cão com canil e sem dono NÃO é fantasma — é rascunho do criador", () => {
    // Mesma distinção que a policy dogs_select faz no banco. Confundir os dois
    // exibiria rascunho alheio como registro público.
    expect(isGhostAncestor({ owner_id: null, kennel_id: "k1" })).toBe(false);
  });

  it("cão com dono não é fantasma", () => {
    expect(isGhostAncestor({ owner_id: "u1", kennel_id: null })).toBe(false);
    expect(isGhostAncestor({ owner_id: "u1", kennel_id: "k1" })).toBe(false);
  });
});

describe("describeCandidate", () => {
  it("junta o que existe para distinguir homônimos", () => {
    const d = dog({
      id: "1",
      name: "Rex",
      breed: "Pastor Alemão",
      born_on: "2019-04-02",
      kennel_name: "Canil Aurora",
    });
    expect(describeCandidate(d)).toBe("Pastor Alemão · 2019 · Canil Aurora");
  });

  it("diz 'Ancestral' quando não há dado nenhum", () => {
    expect(describeCandidate(dog({ id: "1", name: "Desconhecido" }))).toBe("Ancestral");
  });
});
