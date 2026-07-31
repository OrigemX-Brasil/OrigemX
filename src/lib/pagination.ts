/**
 * Paginação por keyset.
 *
 * INVARIANTE: nenhuma listagem sem paginação e limite. Toda função de lista em
 * `src/modules/<dominio>/queries.ts` passa por aqui — assim o teto é uma regra
 * do módulo, não a disciplina de quem escreveu a query.
 *
 * Keyset e não OFFSET: com OFFSET o banco varre e descarta as N primeiras
 * linhas, então a página 50 custa 50x a página 1. Um canil grande com muitos
 * cães degradaria exatamente onde mais dói.
 */

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

export type PageParams = {
  limit?: number;
  /** Cursor opaco devolvido pela página anterior. */
  cursor?: string | null;
};

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

/**
 * Normaliza o limite pedido. Valor ausente, inválido ou acima do teto vira um
 * valor seguro — nunca um SELECT sem limite.
 */
export function resolveLimit(limit?: number): number {
  if (!Number.isFinite(limit) || limit === undefined || limit < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
}

/**
 * Cursor = (created_at, id). O `id` desempata registros criados no mesmo
 * instante; sem ele, um lote importado no mesmo segundo faria linhas sumirem
 * ou repetirem entre páginas.
 */
export type Cursor = { createdAt: string; id: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const [createdAt, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    // Cursor adulterado na URL: trata como primeira página em vez de estourar.
    return null;
  }
}
