import { NextResponse } from "next/server";

import { searchPublicDogs, type PublicDogSearchItem } from "@/modules/dogs/queries";

const AUTOCOMPLETE_LIMIT = 8;
const OWN_DRAFTS_TO_SHOW = 5;

/**
 * `GET /api/search/dogs?q=termo` — autocomplete da lupa do cabeçalho, lado
 * dos cães.
 *
 * ROTA SEPARADA de `/api/search/kennels`, de propósito: o resultado de cão
 * depende da SESSÃO de quem pergunta (o rascunho do próprio dono entra), e
 * por isso a resposta NÃO pode ir num cache compartilhado — `private`, nunca
 * `public`. Com `public`, a resposta cacheada para o termo "Rex" buscado
 * pelo dono do rascunho "Rex" seria servida, dentro da janela de cache, a
 * qualquer outro visitante que buscasse o mesmo termo — vazando o rascunho.
 * Canis não têm essa exceção (nunca tiveram rascunho visível na busca), por
 * isso a rota deles continua com cache compartilhado, inalterada.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";

  const { items, ownDrafts } = await searchPublicDogs(q, { limit: AUTOCOMPLETE_LIMIT });
  const merged: PublicDogSearchItem[] = [...ownDrafts.slice(0, OWN_DRAFTS_TO_SHOW), ...items].slice(
    0,
    AUTOCOMPLETE_LIMIT,
  );

  return NextResponse.json({ items: merged }, { headers: { "Cache-Control": "private, max-age=15" } });
}
