import { describe, expect, it } from "vitest";

import { devePublicarSozinho, type EstadoParaDecidir } from "./auto-publish";

/**
 * A regra do aditivo de fluxo de 03/09/2026, testada sem banco.
 *
 * Cada caso aqui corresponde a uma guarda, e cada guarda existe por um motivo
 * concreto — os testes nomeiam o motivo, não a condição. Um teste chamado
 * "retorna false quando autoPublishedAt não é nulo" não diria a ninguém por que
 * essa linha não pode ser removida.
 */

function estado(over: Partial<EstadoParaDecidir> = {}): EstadoParaDecidir {
  return {
    faltamObrigatorios: 0,
    publishedAt: null,
    autoPublishedAt: null,
    assistindo: false,
    ...over,
  };
}

describe("devePublicarSozinho", () => {
  it("publica quando o mínimo acabou de fechar", () => {
    expect(devePublicarSozinho(estado())).toBe(true);
  });

  it("não publica com o mínimo incompleto", () => {
    expect(devePublicarSozinho(estado({ faltamObrigatorios: 1 }))).toBe(false);
  });

  it("não republica o que já está no ar", () => {
    expect(devePublicarSozinho(estado({ publishedAt: "2026-09-03T10:00:00Z" }))).toBe(false);
  });

  /**
   * A GUARDA QUE PROTEGE O CRIADOR, e a razão de `auto_published_at` existir
   * como coluna.
   *
   * Cenário: ele concluiu o cadastro, o perfil foi ao ar sozinho, e ele decidiu
   * TIRAR do ar. Depois voltou e editou a cidade. O mínimo continua completo e
   * `published_at` voltou a ser nulo — sem esta guarda os dois estados seriam
   * indistinguíveis de "nunca publicou", e a automação arrastaria o perfil de
   * volta ao ar por cima de uma decisão explícita dele.
   */
  it("NÃO republica o que o criador tirou do ar de propósito", () => {
    const despublicadoDepoisDeIrAoArSozinho = estado({
      publishedAt: null,
      autoPublishedAt: "2026-09-03T10:00:00Z",
    });
    expect(devePublicarSozinho(despublicadoDepoisDeIrAoArSozinho)).toBe(false);
  });

  /**
   * Um admin em cadastro assistido preenchendo o último campo publicaria o
   * perfil do criador SEM passar por `admin_set_kennel_published` — que é o
   * caminho auditado. Seria a publicação silenciosa por admin que duas
   * migrations foram escritas para eliminar, reintroduzida por um efeito
   * colateral.
   */
  it("não publica durante cadastro assistido: o admin tem porta auditada", () => {
    expect(devePublicarSozinho(estado({ assistindo: true }))).toBe(false);
  });

  it("basta uma guarda para barrar", () => {
    expect(
      devePublicarSozinho(
        estado({ faltamObrigatorios: 3, publishedAt: "x", autoPublishedAt: "y", assistindo: true }),
      ),
    ).toBe(false);
  });
});
