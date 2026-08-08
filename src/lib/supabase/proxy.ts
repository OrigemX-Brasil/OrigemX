import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // Devolver ESTE objeto. Criar um NextResponse novo sem copiar os cookies
  // dessincroniza navegador e servidor e derruba a sessão.
  return supabaseResponse;
}
