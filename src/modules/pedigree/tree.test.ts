import { describe, expect, it } from "vitest";

import {
  buildPedigree,
  generationOf,
  MAX_POSITION,
  parentPositions,
  pathLabel,
  relationOf,
  type PedigreeRow,
} from "./tree";

function row(pos: number, over: Partial<PedigreeRow> = {}): PedigreeRow {
  return {
    pos,
    generation: generationOf(pos),
    dog_id: `dog-${pos}`,
    name: `Cão ${pos}`,
    is_public: true,
    public_id: `PID${pos}`,
    sex: pos === 1 ? "male" : pos % 2 === 0 ? "male" : "female",
    breed: null,
    born_on: null,
    kennel_name: null,
    ...over,
  };
}

/** Árvore cheia de N gerações: posições 1 até 2^(N+1)-1. */
function fullTree(generations: number): PedigreeRow[] {
  const last = 2 ** (generations + 1) - 1;
  return Array.from({ length: last }, (_, i) => row(i + 1));
}

describe("aritmética da posição", () => {
  it("geração é o comprimento em bits menos um", () => {
    expect(generationOf(1)).toBe(0);
    expect(generationOf(2)).toBe(1);
    expect(generationOf(3)).toBe(1);
    expect(generationOf(4)).toBe(2);
    expect(generationOf(7)).toBe(2);
    expect(generationOf(32)).toBe(5);
    expect(generationOf(63)).toBe(5);
  });

  it("pai é 2N e mãe é 2N+1", () => {
    expect(parentPositions(1)).toEqual([2, 3]);
    expect(parentPositions(5)).toEqual([10, 11]);
    expect(parentPositions(31)).toEqual([62, 63]);
  });

  it("posição par é pai, ímpar é mãe", () => {
    expect(relationOf(2)).toBe("Pai");
    expect(relationOf(3)).toBe("Mãe");
    expect(relationOf(62)).toBe("Pai");
    expect(relationOf(1)).toBe("");
  });
});

describe("pathLabel — a posição É o caminho", () => {
  it("lê os bits da direita para a esquerda", () => {
    expect(pathLabel(1)).toBe("");
    expect(pathLabel(2)).toBe("pai");
    expect(pathLabel(3)).toBe("mãe");
    expect(pathLabel(4)).toBe("pai do pai");
    expect(pathLabel(5)).toBe("mãe do pai");
    expect(pathLabel(6)).toBe("pai da mãe");
    expect(pathLabel(7)).toBe("mãe da mãe");
  });

  it("concorda o conector com o termo seguinte", () => {
    // 11 = 1011: mãe(1) da mãe(1) do pai(0).
    expect(pathLabel(11)).toBe("mãe da mãe do pai");
    expect(pathLabel(8)).toBe("pai do pai do pai");
    expect(pathLabel(63)).toBe("mãe da mãe da mãe da mãe da mãe");
    expect(pathLabel(32)).toBe("pai do pai do pai do pai do pai");
  });

  it("o caminho é coerente com a aritmética: o pai de P é 'pai do <caminho de P>'", () => {
    for (let pos = 2; pos <= 15; pos += 1) {
      const [sire] = parentPositions(pos);
      expect(pathLabel(sire)).toBe(`pai ${pos % 2 === 0 ? "do" : "da"} ${pathLabel(pos)}`);
    }
  });
});

describe("buildPedigree — ancestral repetido (linebreeding)", () => {
  // Mesmo cão como avô paterno (4) e avô materno (6). É legítimo e comum, e o
  // resultado CORRETO é ele aparecer duas vezes.
  const rows = [
    row(1),
    row(2),
    row(3),
    row(4, { dog_id: "ouro", name: "Ouro do Vale" }),
    row(5),
    row(6, { dog_id: "ouro", name: "Ouro do Vale" }),
    row(7),
  ];

  it("preserva TODAS as posições do mesmo cão, sem deduplicar", () => {
    const ped = buildPedigree(rows);

    expect(ped.byPosition.size).toBe(7);
    expect(ped.byPosition.get(4)?.dog_id).toBe("ouro");
    expect(ped.byPosition.get(6)?.dog_id).toBe("ouro");
    expect(ped.knownAncestors).toBe(6);
  });

  it("cada ocorrência guarda o seu próprio caminho", () => {
    const ped = buildPedigree(rows);

    expect(ped.byPosition.get(4)?.path).toBe("pai do pai");
    expect(ped.byPosition.get(6)?.path).toBe("pai da mãe");
  });

  it("marca a repetição nas duas pontas e lista as posições ordenadas", () => {
    const ped = buildPedigree(rows);

    expect(ped.byPosition.get(4)?.repeated).toBe(true);
    expect(ped.byPosition.get(6)?.repeated).toBe(true);
    expect(ped.byPosition.get(2)?.repeated).toBe(false);
    expect(ped.repeated.get("ouro")).toEqual([4, 6]);
    expect(ped.repeated.size).toBe(1);
  });
});

describe("buildPedigree — ancestral ausente", () => {
  // Avô paterno (4) desconhecido. O galho dele morre, mas o resto não anda.
  const rows = [row(1), row(2), row(3), row(5), row(6), row(7), row(10), row(11)];

  it("a lacuna não desloca as outras posições", () => {
    const ped = buildPedigree(rows);

    expect(ped.byPosition.has(4)).toBe(false);
    expect(ped.byPosition.get(5)?.path).toBe("mãe do pai");
    expect(ped.byPosition.get(6)?.path).toBe("pai da mãe");
    expect(ped.byPosition.get(7)?.path).toBe("mãe da mãe");
  });

  it("a geração seguinte só tem os descendentes de quem existe", () => {
    const ped = buildPedigree(rows);

    // 8 e 9 são pais do 4, que não existe. 10 e 11 são pais do 5, que existe.
    expect(ped.generations[3]?.map((n) => n.pos)).toEqual([10, 11]);
  });

  it("conta ancestrais conhecidos contra os possíveis, sem inventar", () => {
    const ped = buildPedigree(rows);

    expect(ped.knownAncestors).toBe(7);
    expect(ped.depth).toBe(3);
    expect(ped.possibleAncestors).toBe(14);
  });
});

describe("buildPedigree — profundidade menor que 5", () => {
  it("só pai e mãe devolve depth 1, sem gerações vazias penduradas", () => {
    const ped = buildPedigree([row(1), row(2), row(3)]);

    expect(ped.depth).toBe(1);
    expect(ped.generations).toHaveLength(2);
    expect(ped.generations[1]?.map((n) => n.pos)).toEqual([2, 3]);
    expect(ped.knownAncestors).toBe(2);
    expect(ped.possibleAncestors).toBe(2);
  });

  it("cão sem nenhum ancestral ainda tem sujeito e árvore vazia", () => {
    const ped = buildPedigree([row(1)]);

    expect(ped.subject?.pos).toBe(1);
    expect(ped.depth).toBe(0);
    expect(ped.knownAncestors).toBe(0);
    expect(ped.possibleAncestors).toBe(0);
    expect(ped.repeated.size).toBe(0);
  });

  it("lista vazia não quebra — o cão pode ter sido despublicado entre a página e a consulta", () => {
    const ped = buildPedigree([]);

    expect(ped.subject).toBeNull();
    expect(ped.generations).toEqual([]);
    expect(ped.depth).toBe(0);
    expect(ped.knownAncestors).toBe(0);
  });
});

describe("buildPedigree — árvore completa de 5 gerações", () => {
  const ped = buildPedigree(fullTree(5));

  it("tem 63 posições: o sujeito e 62 ancestrais", () => {
    expect(ped.byPosition.size).toBe(63);
    expect(ped.knownAncestors).toBe(62);
    expect(ped.possibleAncestors).toBe(62);
    expect(ped.depth).toBe(5);
  });

  it("cada geração tem o dobro da anterior", () => {
    expect(ped.generations.map((g) => g.length)).toEqual([1, 2, 4, 8, 16, 32]);
  });

  it("a quinta geração ocupa exatamente de 32 a 63", () => {
    const quinta = ped.generations[5] ?? [];
    expect(quinta[0]?.pos).toBe(32);
    expect(quinta.at(-1)?.pos).toBe(MAX_POSITION);
  });

  it("nenhum repetido quando todos os cães são distintos", () => {
    expect(ped.repeated.size).toBe(0);
    expect([...ped.byPosition.values()].every((n) => !n.repeated)).toBe(true);
  });
});

describe("buildPedigree — defesas", () => {
  it("descarta posição fora do intervalo de 5 gerações", () => {
    const ped = buildPedigree([row(1), row(2), row(64), row(0), row(-3), row(1.5)]);

    expect(ped.byPosition.size).toBe(2);
    expect(ped.depth).toBe(1);
  });

  it("a posição vence a coluna generation quando as duas discordam", () => {
    const ped = buildPedigree([row(1), row(5, { generation: 99 })]);

    expect(ped.byPosition.get(5)?.generation).toBe(2);
    expect(ped.generations[2]?.map((n) => n.pos)).toEqual([5]);
  });

  it("ancestral restrito mantém o nome e perde o resto", () => {
    const ped = buildPedigree([
      row(1),
      row(2, { is_public: false, public_id: null, breed: null, kennel_name: null }),
    ]);

    const pai = ped.byPosition.get(2);
    expect(pai?.name).toBe("Cão 2");
    expect(pai?.is_public).toBe(false);
    expect(pai?.public_id).toBeNull();
  });
});
