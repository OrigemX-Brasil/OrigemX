import { describe, expect, it } from "vitest";

import { translateDogError } from "./errors";

/**
 * A mensagem de ciclo é a que mais importa: sem ela o usuário leva um 500 numa
 * operação que, do ponto de vista dele, era razoável.
 */
describe("translateDogError", () => {
  it("traduz ciclo genealógico explicando o motivo, não só o bloqueio", () => {
    const r = translateDogError({
      code: "23514",
      message:
        "ciclo genealógico: o cão d1000000-0000-4000-8000-00000000000a apareceria como ancestral de si mesmo",
    });
    expect(r.field).toBe("form");
    expect(r.message).toMatch(/descendente/i);
    expect(r.message).toMatch(/ancestral de si mesmo/i);
    // Nada de uuid nem de jargão de banco na tela.
    expect(r.message).not.toMatch(/d1000000/);
    expect(r.message).not.toMatch(/23514/);
  });

  it("aponta o campo certo quando o sexo do progenitor está errado", () => {
    expect(
      translateDogError({
        code: "23514",
        message: "sire_id (abc) precisa referenciar um cão macho",
      }),
    ).toEqual({ field: "sire_id", message: "O pai precisa ser um cão macho." });

    expect(
      translateDogError({ code: "23514", message: "dam_id (abc) precisa referenciar uma cadela" }),
    ).toEqual({ field: "dam_id", message: "A mãe precisa ser uma fêmea." });
  });

  it("traduz pai igual a mãe", () => {
    const r = translateDogError({
      code: "23514",
      message: 'new row violates check constraint "dogs_sire_dam_distinct"',
    });
    expect(r.field).toBe("dam_id");
    expect(r.message).toMatch(/mesmo cão/i);
  });

  it("traduz troca de sexo de cão que já é progenitor", () => {
    const r = translateDogError({
      code: "23514",
      message:
        "não é possível mudar o sexo do cão x: ele já consta como progenitor em outro pedigree",
    });
    expect(r.message).toMatch(/já consta como pai ou mãe/i);
  });

  it("traduz slug sem canil", () => {
    const r = translateDogError({
      code: "23514",
      message: 'violates check constraint "dogs_slug_requires_kennel"',
    });
    expect(r.field).toBe("slug");
  });

  it("traduz colisão de endereço dentro do canil", () => {
    const r = translateDogError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "dogs_kennel_slug_key"',
    });
    expect(r.field).toBe("slug");
    expect(r.message).toMatch(/neste canil/i);
  });

  it("traduz microchip duplicado", () => {
    const r = translateDogError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "dog_identifiers_microchip_uk"',
    });
    expect(r.message).toMatch(/microchip/i);
  });

  it("traduz permissão negada sem vazar detalhe de RLS", () => {
    const r = translateDogError({ code: "42501", message: "permission denied for table dogs" });
    expect(r.message).toMatch(/permissão/i);
    expect(r.message).not.toMatch(/table dogs/);
  });

  it("traduz FK quebrada como estado obsoleto da tela", () => {
    const r = translateDogError({
      code: "23503",
      message: 'insert violates foreign key constraint "dogs_sire_id_fkey"',
    });
    expect(r.message).toMatch(/recarregue/i);
  });

  it("tem fallback para erro desconhecido e para ausência de erro", () => {
    expect(translateDogError({ code: "XX999", message: "boom" }).field).toBe("form");
    expect(translateDogError(null).field).toBe("form");
    expect(translateDogError({}).message.length).toBeGreaterThan(0);
  });

  it("nunca devolve mensagem vazia", () => {
    const casos = [
      null,
      {},
      { code: "23514", message: "" },
      { code: "23505" },
      { code: "42501" },
      { message: "sem código" },
    ];
    for (const caso of casos) {
      expect(translateDogError(caso).message.trim().length).toBeGreaterThan(0);
    }
  });
});
