import { describe, expect, it } from "vitest";

import { baseDeSlug, candidatosDeSlug } from "./slug";

/**
 * O endereço do canil é gravado UMA vez e fica queimado para sempre
 * (`kennels_slug_key` é único global e não parcial por `deleted_at`). Estes
 * testes existem porque um slug malformado não é um bug reversível: o valor
 * errado continua ocupado depois de corrigido.
 *
 * As duas regras do banco que estes casos protegem:
 *   `kennels_slug_length` — entre 3 e 60 caracteres
 *   `kennels_slug_format` — ^[a-z0-9]+(-[a-z0-9]+)*$ (sem hífen nas pontas)
 */

const FORMATO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("baseDeSlug", () => {
  it("deriva do nome, como o formulário de canil já fazia", () => {
    expect(baseDeSlug("Canil Aurora")).toBe("canil-aurora");
    expect(baseDeSlug("Criação São João")).toBe("criacao-sao-joao");
  });

  it("resgata nome curto demais em vez de recusá-lo", () => {
    // "ki" tem 2 caracteres e violaria `kennels_slug_length`. Canil chamado
    // "Ki" é nome legítimo — quem tem de ceder é a URL, não o nome.
    expect(baseDeSlug("Ki")).toBe("canil-ki");
    expect(baseDeSlug("JR")).toBe("canil-jr");
  });

  it("cai numa base genérica quando o nome não sobrevive à normalização", () => {
    expect(baseDeSlug("!!!")).toBe("canil");
    expect(baseDeSlug("   ")).toBe("canil");
  });

  it("respeita o teto de 60 sem deixar hífen na ponta", () => {
    const longo = `${"canil ".repeat(20)}aurora`;
    const base = baseDeSlug(longo);

    expect(base.length).toBeLessThanOrEqual(60);
    expect(base).toMatch(FORMATO);
  });
});

describe("candidatosDeSlug", () => {
  it("oferece a base primeiro, depois as variantes numeradas a partir de 2", () => {
    const [primeiro, segundo, terceiro] = candidatosDeSlug("Canil Aurora");

    // Começa em 2 porque a base É o primeiro: "-1" sugeriria um zero.
    expect(primeiro).toBe("canil-aurora");
    expect(segundo).toBe("canil-aurora-2");
    expect(terceiro).toBe("canil-aurora-3");
  });

  it("todo candidato obedece formato e comprimento do banco", () => {
    const nomes = [
      "Canil Aurora",
      "Ki",
      "!!!",
      `${"canil ".repeat(20)}aurora`,
      "Canil do Vale Sereno & Filhos",
    ];

    for (const nome of nomes) {
      for (const slug of candidatosDeSlug(nome)) {
        expect(slug, `"${nome}" → "${slug}"`).toMatch(FORMATO);
        expect(slug.length, `"${nome}" → "${slug}"`).toBeGreaterThanOrEqual(3);
        expect(slug.length, `"${nome}" → "${slug}"`).toBeLessThanOrEqual(60);
      }
    }
  });

  it("encurta a base para o sufixo caber, em vez de estourar o teto", () => {
    // Sem isto, um nome no limite produziria candidatos de 62 caracteres que o
    // banco recusaria um por um — o laço da action tentaria doze vezes e
    // falharia doze vezes.
    const candidatos = candidatosDeSlug("a".repeat(60));

    expect(candidatos[0]!.length).toBe(60);
    for (const slug of candidatos) expect(slug.length).toBeLessThanOrEqual(60);
    expect(candidatos[1]).toMatch(/-2$/);
  });

  it("não repete candidato — cada tentativa do laço é uma tentativa nova", () => {
    const candidatos = candidatosDeSlug("Canil Aurora");
    expect(new Set(candidatos).size).toBe(candidatos.length);
  });
});
