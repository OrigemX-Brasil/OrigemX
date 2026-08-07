import { describe, expect, it } from "vitest";

import { runWithConcurrency, splitByGalleryLimit } from "./upload-queue";

describe("splitByGalleryLimit", () => {
  it("aceita tudo quando cabe", () => {
    const { aceitos, recusados } = splitByGalleryLimit(["a", "b", "c"], 5);
    expect(aceitos).toEqual(["a", "b", "c"]);
    expect(recusados).toEqual([]);
  });

  it("corta na posição que resta", () => {
    const { aceitos, recusados } = splitByGalleryLimit(["a", "b", "c", "d", "e"], 2);
    expect(aceitos).toEqual(["a", "b"]);
    expect(recusados).toEqual(["c", "d", "e"]);
  });

  it("remaining 0 recusa tudo", () => {
    const { aceitos, recusados } = splitByGalleryLimit(["a", "b"], 0);
    expect(aceitos).toEqual([]);
    expect(recusados).toEqual(["a", "b"]);
  });

  it("remaining negativo é tratado como zero, não como slice negativo", () => {
    const { aceitos, recusados } = splitByGalleryLimit(["a", "b"], -3);
    expect(aceitos).toEqual([]);
    expect(recusados).toEqual(["a", "b"]);
  });

  it("lista vazia devolve os dois lados vazios", () => {
    expect(splitByGalleryLimit([], 5)).toEqual({ aceitos: [], recusados: [] });
  });
});

/** Promise controlada de fora — evita teste de timing baseado em setTimeout. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("runWithConcurrency", () => {
  it("processa todos os itens exatamente uma vez", async () => {
    const chamadas: number[] = [];
    const results = await runWithConcurrency([10, 20, 30, 40], 2, async (item) => {
      chamadas.push(item);
      return item * 2;
    });

    expect(chamadas.sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
    expect(results).toEqual([
      { ok: true, value: 20 },
      { ok: true, value: 40 },
      { ok: true, value: 60 },
      { ok: true, value: 80 },
    ]);
  });

  it("nunca roda mais que `limit` workers ao mesmo tempo", async () => {
    let emVoo = 0;
    let picoObservado = 0;
    const portas = Array.from({ length: 6 }, () => deferred<void>());

    const execucao = runWithConcurrency(portas, 3, async (porta) => {
      emVoo += 1;
      picoObservado = Math.max(picoObservado, emVoo);
      await porta.promise;
      emVoo -= 1;
    });

    // Dá tempo de os 3 primeiros workers entrarem e ficarem presos na porta.
    await Promise.resolve();
    await Promise.resolve();
    expect(emVoo).toBe(3);

    for (const porta of portas) porta.resolve();
    await execucao;

    expect(picoObservado).toBe(3);
  });

  it("uma falha no meio do lote não impede nem cancela as outras", async () => {
    const results = await runWithConcurrency([1, 2, 3, 4], 2, async (item) => {
      if (item === 3) throw new Error("falhou o item 3");
      return item;
    });

    expect(results[0]).toEqual({ ok: true, value: 1 });
    expect(results[1]).toEqual({ ok: true, value: 2 });
    expect(results[2].ok).toBe(false);
    expect(results[3]).toEqual({ ok: true, value: 4 });

    if (!results[2].ok) {
      expect((results[2].error as Error).message).toBe("falhou o item 3");
    }
  });

  it("o resultado fica na posição de ENTRADA, não na ordem de conclusão", async () => {
    // O item 0 é o mais lento; se o array de saída seguisse a ordem de
    // término em vez da posição de entrada, este teste pegaria isso.
    const atraso = [deferred<void>(), deferred<void>()];

    const execucao = runWithConcurrency([0, 1], 2, async (item) => {
      if (item === 0) await atraso[0].promise;
      return `item-${item}`;
    });

    atraso[1]?.resolve();
    await Promise.resolve();
    atraso[0]?.resolve();

    const results = await execucao;
    expect(results[0]).toEqual({ ok: true, value: "item-0" });
    expect(results[1]).toEqual({ ok: true, value: "item-1" });
  });

  it("onSettle dispara para cada item, com o índice certo", async () => {
    const chamados: number[] = [];
    await runWithConcurrency(
      ["a", "b", "c"],
      3,
      async (item) => item,
      (index) => chamados.push(index),
    );
    expect(chamados.sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("limit maior que a quantidade de itens não quebra", async () => {
    const results = await runWithConcurrency(["x"], 10, async (item) => item);
    expect(results).toEqual([{ ok: true, value: "x" }]);
  });

  it("limit zero ou negativo não trava — vira 1 worker", async () => {
    const results = await runWithConcurrency(["x", "y"], 0, async (item) => item);
    expect(results).toEqual([
      { ok: true, value: "x" },
      { ok: true, value: "y" },
    ]);
  });

  it("lote vazio devolve lista vazia sem lançar", async () => {
    const results = await runWithConcurrency<string, string>([], 3, async (item) => item);
    expect(results).toEqual([]);
  });
});
