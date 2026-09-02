import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ASSIST_COOKIE } from "@/lib/assist-cookie";
import type { Database } from "@/lib/types/database";
import { isGuestOnlyRoute, isProtectedRoute } from "@/modules/auth/routes";

/**
 * Renova a sessão do Supabase a cada request e faz o desvio de rota.
 *
 * ISTO NÃO É AUTORIZAÇÃO. É checagem otimista de borda, para o usuário não
 * bater numa tela vazia — o guia do Next 16 chama de "optimistic check" e
 * recomenda exatamente isso. Quem decide o que cada um enxerga é a RLS, no
 * banco. Se este arquivo sumisse, nenhum dado vazaria; só a navegação ficaria
 * feia.
 */

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Não colocar código entre createServerClient e getClaims(). Qualquer coisa
  // aqui no meio causa logout aleatório e é muito difícil de depurar.
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;

  /**
   * Redirect PRESERVANDO os cookies que o refresh acabou de emitir.
   *
   * Devolver um NextResponse.redirect limpo descartaria o token renovado:
   * navegador e servidor sairiam de sincronia e a sessão cairia sozinha, de
   * forma intermitente e quase impossível de reproduzir.
   */
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  if (!hasSession && isProtectedRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  if (hasSession && isGuestOnlyRoute(pathname)) {
    return redirectTo("/painel");
  }

  /**
   * CADASTRO ASSISTIDO — as telas do criador passam a morar sob `/admin`.
   *
   * Durante uma sessão, o admin trabalha nos MESMOS componentes do painel do
   * criador (ver `app/admin/assistir/[profileId]`). Sem este desvio, o primeiro
   * `redirect()` de qualquer Server Action — que aponta para `/painel/...`,
   * como sempre apontou — jogaria o admin para fora do prefixo administrativo,
   * e a fronteira visual se romperia no primeiro "salvar".
   *
   * Resolver isso nos links custaria tornar ~40 `href`, `redirect` e
   * `revalidatePath` cientes do caminho-base, espalhados por todo o painel — o
   * arquivo de maior tráfego do produto. Aqui é uma regra só.
   *
   * O COOKIE É DICA DE UI, NUNCA AUTORIZAÇÃO. Quem decide o que este admin
   * escreve é `private.assisting_profile()`, no banco. Adulterar o cookie muda
   * o PREFIXO da URL e mais nada: sem sessão aberta, o layout de
   * `/admin/assistir` devolve 404 e a RLS recusa toda escrita. É a mesma
   * natureza otimista do desvio de rota logo acima.
   */
  const assistindo = request.cookies.get(ASSIST_COOKIE)?.value;
  if (hasSession && assistindo && pathname.startsWith("/painel")) {
    const url = request.nextUrl.clone();
    url.pathname = `/admin/assistir/${assistindo}${pathname.slice("/painel".length)}`;
    // Mantém a query: é ela que carrega busca, cursor de paginação e as
    // confirmações de "recém-criado" que as telas leem.
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  // Devolver ESTE objeto. Criar um NextResponse novo sem copiar os cookies
  // dessincroniza navegador e servidor e derruba a sessão.
  return supabaseResponse;
}
