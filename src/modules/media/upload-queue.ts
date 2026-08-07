/**
 * ============================================================================
 * Orquestração pura de um lote de upload. Sem DOM, sem rede — testável com
 * workers falsos.
 * ============================================================================
 */

export type Split<T> = { aceitos: T[]; recusados: T[] };

/**
 * Corta a lista para caber no que resta na galeria.
 *
 * `remaining` negativo é tratado como zero — defensivo contra um prop
 * calculado errado (galeria hipoteticamente já acima do teto); não é motivo
 * para `slice` de índice negativo se comportar de modo menos óbvio.
 */
export function splitByGalleryLimit<T>(items: readonly T[], remaining: number): Split<T> {
  const limit = Math.max(0, remaining);
  return {
    aceitos: items.slice(0, limit),
    recusados: items.slice(limit),
  };
}

export type SettleResult<R> = { ok: true; value: R } | { ok: false; error: unknown };

/**
 * Roda `worker` para cada item, no máximo `limit` em voo ao mesmo tempo.
 *
 * Pool de tamanho fixo puxando de um cursor compartilhado — assim que um
 * worker termina um item, pega o próximo, em vez de processar em lotes fixos
 * (que deixariam um worker ocioso esperando o mais lento do seu lote).
 *
 * Cada chamada é isolada: uma que rejeita não cancela nem impede as demais —
 * é o que faz "falha individual não derruba as outras" ser verdade. O
 * resultado de cada item fica na SUA posição no array de saída,
 * independentemente da ordem em que os workers terminam.
 *
 * `onSettle` dispara assim que CADA item termina — é o que deixa a tela
 * atualizar o status de uma foto sem esperar o lote inteiro acabar.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onSettle?: (index: number, result: SettleResult<R>) => void,
): Promise<SettleResult<R>[]> {
  const results: SettleResult<R>[] = new Array(items.length);
  let next = 0;

  async function runOne(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;

      let result: SettleResult<R>;
      try {
        result = { ok: true, value: await worker(items[index], index) };
      } catch (error) {
        result = { ok: false, error };
      }

      results[index] = result;
      onSettle?.(index, result);
    }
  }

  // `limit <= 0` não pode travar o lote — vira 1 worker. `limit` maior que a
  // quantidade de itens não spawna worker ocioso. Lote vazio ainda spawna 1
  // worker que não encontra nada a fazer — mais simples que um caso especial.
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, runOne));

  return results;
}
