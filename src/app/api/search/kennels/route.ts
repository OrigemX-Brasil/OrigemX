import { NextResponse } from "next/server";

import { searchPublicKennels } from "@/modules/public/queries";

/**
 * `GET /api/search/kennels?q=termo` — autocomplete da lupa do cabeçalho.
 *
 * Sem sessão: o resultado é sempre canil publicado, a mesma visão que
 * qualquer visitante anônimo já tem em `/c/[slug]`. Não há por que ramificar
 * por usuário logado.
 *
 * `limit: 8` fixo — é prévia, não a lista completa (essa é `/busca`).
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";

  const { items } = await searchPublicKennels({ q, limit: 8 });

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" } },
  );
}
