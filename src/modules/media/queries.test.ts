import { describe, expect, it } from "vitest";

import { groupCountsByDogId } from "./queries";

/**
 * A parte pura de `countDogGalleries` — o resto da função é uma consulta ao
 * banco (`createClient()`), que este projeto não mocka em teste unitário;
 * cobertura de query real é responsabilidade da bateria SQL / RLS / e2e. O
 * que dá para testar sem banco é exatamente o agrupamento, que é a parte que
 * evita o N+1: um `count` por cão seria fácil de errar silenciosamente.
 */
describe("groupCountsByDogId", () => {
  it("conta quantas linhas cada dog_id tem", () => {
    const result = groupCountsByDogId([
      { dog_id: "a" },
      { dog_id: "a" },
      { dog_id: "b" },
      { dog_id: "a" },
    ]);

    expect(result.get("a")).toBe(3);
    expect(result.get("b")).toBe(1);
  });

  it("cão sem nenhuma linha não entra no Map — ausência é zero, não uma chave", () => {
    const result = groupCountsByDogId([{ dog_id: "a" }]);

    expect(result.has("b")).toBe(false);
    expect(result.get("b") ?? 0).toBe(0);
  });

  it("lista vazia produz Map vazio", () => {
    expect(groupCountsByDogId([]).size).toBe(0);
  });

  it("ignora linha com dog_id nulo — media pode pertencer a kennel_id/litter_id em vez de dog_id", () => {
    const result = groupCountsByDogId([{ dog_id: "a" }, { dog_id: null }, { dog_id: null }]);

    expect(result.size).toBe(1);
    expect(result.get("a")).toBe(1);
  });
});
