import { describe, expect, it } from "vitest";

import { calculateDogCompleteness, type DogValues } from "./completeness";
import { DOG_SCORED_FIELDS, WEIGHT_VALUE } from "./fields";

/**
 * Molde do teste de completude do canil, com a diferença que motiva este
 * arquivo: a lista pontuada do cão inclui FOTO, PAI, MÃE e CANIL, que não são
 * campos do formulário. Um medidor que os ignorasse diria "100%" para um cão
 * sem foto e sem pedigree — exatamente o cão que mais precisa do aviso.
 */

function preenchidos(pesos: readonly string[]): DogValues {
  const values: DogValues = {};
  for (const field of DOG_SCORED_FIELDS) {
    if (pesos.includes(field.weight)) values[field.name] = "preenchido";
  }
  return values;
}

const tudo = () => preenchidos(["required", "recommended", "optional"]);

describe("calculateDogCompleteness", () => {
  it("cadastro vazio é 0%", () => {
    expect(calculateDogCompleteness({}).percent).toBe(0);
  });

  it("tudo preenchido é 100%", () => {
    expect(calculateDogCompleteness(tudo()).percent).toBe(100);
  });

  it("percentual fica entre 0 e 100 em qualquer combinação", () => {
    const combinacoes: DogValues[] = [
      {},
      preenchidos(["required"]),
      preenchidos(["recommended"]),
      preenchidos(["required", "recommended"]),
      tudo(),
    ];

    for (const values of combinacoes) {
      const r = calculateDogCompleteness(values);
      expect(r.percent).toBeGreaterThanOrEqual(0);
      expect(r.percent).toBeLessThanOrEqual(100);
      expect(Number.isInteger(r.percent)).toBe(true);
    }
  });

  it("um campo obrigatório vale mais que um recomendado", () => {
    // POR CAMPO, não por grupo. Comparar "todos os obrigatórios" com "todos os
    // recomendados" mediria a QUANTIDADE de cada tipo, não a prioridade: o cão
    // tem 2 obrigatórios (peso 4) contra 6 recomendados (peso 6), então o grupo
    // recomendado soma mais sem que isso diga nada sobre peso unitário.
    const umObrigatorio = DOG_SCORED_FIELDS.find((f) => f.weight === "required")!;
    const umRecomendado = DOG_SCORED_FIELDS.find((f) => f.weight === "recommended")!;

    const comObrigatorio = calculateDogCompleteness({ [umObrigatorio.name]: "x" });
    const comRecomendado = calculateDogCompleteness({ [umRecomendado.name]: "x" });

    expect(WEIGHT_VALUE.required).toBeGreaterThan(WEIGHT_VALUE.recommended);
    expect(comObrigatorio.percent).toBeGreaterThan(comRecomendado.percent);
  });

  it("preencher mais nunca reduz o percentual", () => {
    const vazio = calculateDogCompleteness({}).percent;
    const parcial = calculateDogCompleteness(preenchidos(["required"])).percent;
    const cheio = calculateDogCompleteness(tudo()).percent;

    expect(parcial).toBeGreaterThanOrEqual(vazio);
    expect(cheio).toBeGreaterThanOrEqual(parcial);
  });

  it("espaço em branco não conta como preenchido", () => {
    // Herdado de `isFilled`, importado do canil de propósito: "preenchido" tem
    // de significar a mesma coisa nos dois medidores, senão o criador que
    // digita " " para se livrar do aviso é premiado num e não no outro.
    const base = calculateDogCompleteness({ name: "Rex", sex: "male" });
    const comEspaco = calculateDogCompleteness({ name: "Rex", sex: "male", breed: "   " });

    expect(comEspaco.percent).toBe(base.percent);
  });

  describe("o que separa este medidor do de canil", () => {
    // A foto entrou no cadastro MÍNIMO no aditivo de 03/09/2026 — antes era
    // incentivo. Continua não sendo coluna de `dogs`, que é o ponto do teste.
    it("a FOTO conta, mesmo não sendo coluna de dogs", () => {
      const semFoto = calculateDogCompleteness({ ...tudo(), photo: null });
      expect(semFoto.percent).toBeLessThan(100);
      expect(semFoto.missingRequired.map((f) => f.name)).toContain("photo");
    });

    // Pai e mãe seguem como INCENTIVO: "não deixar pedigree obrigatório" é
    // palavra do aditivo. O vínculo, esse sim, entrou no mínimo.
    it("pai e mãe contam como incentivo, nunca como exigência", () => {
      for (const campo of ["sire_id", "dam_id"] as const) {
        const sem = calculateDogCompleteness({ ...tudo(), [campo]: null });
        expect(sem.percent, campo).toBeLessThan(100);
        expect(
          sem.missingRecommended.map((f) => f.name),
          campo,
        ).toContain(campo);
      }
    });

    it("o VÍNCULO entrou no mínimo", () => {
      const sem = calculateDogCompleteness({ ...tudo(), kennel_id: null });
      expect(sem.percent).toBeLessThan(100);
      expect(sem.missingRequired.map((f) => f.name)).toContain("kennel_id");
    });

    it("cão recém-criado — só nome e sexo — fica em 29%", () => {
      // O piso real do produto: `name` e `sex` são as únicas colunas NOT NULL,
      // e o formulário não deixa gravar sem elas.
      //
      // 29% e não 40% porque o aditivo promoveu raça, nascimento, foto e
      // vínculo ao mínimo — o denominador cresceu de propósito, e a queda é a
      // mensagem: há mais a ganhar preenchendo. Se este número mudar, é porque
      // alguém mexeu nos pesos, e a mudança tem de ser deliberada.
      //
      // `missingRequired` com QUATRO itens é o outro lado da mesma moeda: o
      // cadastro deste cão ainda NÃO está concluído, e é isso que segura a
      // publicação automática.
      const r = calculateDogCompleteness({ name: "Rex", sex: "male" });

      expect(r.percent).toBe(29);
      expect(r.missingRequired.map((f) => f.name).sort()).toEqual([
        "born_on",
        "breed",
        "kennel_id",
        "photo",
      ]);
      expect(r.missingRecommended.map((f) => f.name).sort()).toEqual(["dam_id", "sire_id"]);
    });
  });

  it("campo opcional não muda o percentual nem entra na conta", () => {
    // `DOG_SCORED_FIELDS` filtra peso > 0, então cor, pelagem, títulos e slug
    // sequer aparecem na lista. Preenchê-los não move o número — e nem o
    // `filledCount`, que conta pontuados.
    const base = calculateDogCompleteness({ name: "Rex", sex: "male" });
    const comOpcionais = calculateDogCompleteness({
      name: "Rex",
      sex: "male",
      color: "Preto",
      coat: "Curta",
      titles: ["Campeão Nacional"],
    });

    expect(comOpcionais.percent).toBe(base.percent);
    expect(comOpcionais.filledCount).toBe(base.filledCount);
    expect(DOG_SCORED_FIELDS.map((f) => f.name)).not.toContain("color");
  });

  it("valor não-string conta como preenchido — é assim que a foto chega", () => {
    // A página passa `photo: gallery[0] ?? null`, ou seja um OBJETO de mídia,
    // não uma string. Se `isFilled` não aceitasse isso, todo cão com foto
    // apareceria como sem foto.
    const comObjeto = calculateDogCompleteness({
      name: "Rex",
      sex: "male",
      photo: { id: "abc", url: "https://exemplo.test/foto.webp" },
    });
    const semFoto = calculateDogCompleteness({ name: "Rex", sex: "male", photo: null });

    expect(comObjeto.percent).toBeGreaterThan(semFoto.percent);
    expect(comObjeto.missingRecommended.map((f) => f.name)).not.toContain("photo");
  });
});
