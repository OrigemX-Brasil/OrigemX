import { describe, expect, it } from "vitest";

import { DOG_COLUMNS, DOG_FIELDS, DOG_PUBLIC_COLUMNS } from "./dogs/fields";
import {
  KENNEL_COLUMNS,
  KENNEL_FIELDS,
  KENNEL_PUBLIC_COLUMNS,
  KENNEL_PUBLIC_COLUMN_EXCEPTIONS,
} from "./kennels/fields";
import { LITTER_COLUMNS, LITTER_FIELDS, LITTER_PUBLIC_COLUMNS } from "./litters/fields";

/**
 * ============================================================================
 * Paridade entre os campos que a tela EDITA e as colunas que a consulta LÊ.
 * ============================================================================
 *
 * POR QUE ISTO EXISTE, e o defeito é literal: `kennels.breeds` entrou em
 * `fields.ts` com a migration do cadastro mínimo, o formulário passou a
 * oferecer "Raças criadas", a validação passou a normalizar o `text[]`, o banco
 * passou a gravar — e ninguém acrescentou a coluna às strings de SELECT. O
 * criador preenchia, salvava, a tela recarregava vazia, e para ele isso era "não
 * salvou". O valor estava lá o tempo todo.
 *
 * A mesma coluna faltava na consulta do perfil público, então as raças também
 * nunca apareceriam para o visitante — dois arquivos diferentes, o mesmo
 * esquecimento, nenhum teste olhando.
 *
 * É a MESMA FORMA do GRANT por coluna (casos 131/132 da bateria): duas listas
 * que precisam andar juntas, sem nada mecânico ligando uma à outra. E a resposta
 * é a mesma — teste que falha NOMEANDO o que ficou de fora, não comentário
 * pedindo cuidado. Comentário já falhou três vezes no GRANT.
 *
 * Cobre as consultas que alimentam FORMULÁRIO e PÁGINA PÚBLICA, que são as duas
 * onde a ausência de uma coluna vira "não salva" ou "não aparece". Listagens de
 * card ficam de fora de propósito: lá a coluna ausente é recurso que falta, não
 * dado que se perde.
 */

/** "id, name, slug" → Set { "id", "name", "slug" }. */
function colunas(lista: string): Set<string> {
  return new Set(lista.split(",").map((c) => c.trim()));
}

/** Devolve os nomes que NÃO estão na lista — o que a mensagem de falha precisa. */
function ausentes(nomes: readonly string[], lista: string): string[] {
  const presentes = colunas(lista);
  return nomes.filter((n) => !presentes.has(n));
}

describe("canil", () => {
  const nomes = KENNEL_FIELDS.map((f) => f.name);

  it("toda coluna editável é lida pela consulta do painel", () => {
    expect(ausentes(nomes, KENNEL_COLUMNS)).toEqual([]);
  });

  it("todo campo público é lido pela consulta do perfil público", () => {
    // As exceções são DECLARADAS: `logo_url` não entra porque o logo vem de
    // `media`, com URL assinada. Mexer nessa lista é dizer "este campo deixou de
    // ser lido", sob revisão — e não o esquecimento que o `breeds` foi.
    const publicos = KENNEL_FIELDS.filter(
      (f) => f.publicProfile && !KENNEL_PUBLIC_COLUMN_EXCEPTIONS.includes(f.name),
    ).map((f) => f.name);

    expect(ausentes(publicos, KENNEL_PUBLIC_COLUMNS)).toEqual([]);
  });

  it("a exceção declarada existe de verdade — lista não envelhece em silêncio", () => {
    for (const nome of KENNEL_PUBLIC_COLUMN_EXCEPTIONS) {
      expect(nomes).toContain(nome);
    }
  });
});

describe("cão", () => {
  const nomes = DOG_FIELDS.map((f) => f.name);

  it("toda coluna editável é lida pela consulta do painel", () => {
    expect(ausentes(nomes, DOG_COLUMNS)).toEqual([]);
  });

  it("todo campo público é lido pela consulta do perfil público", () => {
    const publicos = DOG_FIELDS.filter((f) => f.publicProfile).map((f) => f.name);
    expect(ausentes(publicos, DOG_PUBLIC_COLUMNS)).toEqual([]);
  });
});

describe("ninhada", () => {
  const nomes = LITTER_FIELDS.map((f) => f.name);

  it("toda coluna editável é lida pela consulta do painel", () => {
    expect(ausentes(nomes, LITTER_COLUMNS)).toEqual([]);
  });

  it("todo campo editável é lido pela página pública da ninhada", () => {
    // `LITTER_FIELDS` não tem `publicProfile`: a ninhada é curta e tudo que o
    // criador preenche aparece. Se um dia algum campo passar a ser interno, o
    // caminho é a mesma lista de exceções declarada do canil.
    expect(ausentes(nomes, LITTER_PUBLIC_COLUMNS)).toEqual([]);
  });
});
