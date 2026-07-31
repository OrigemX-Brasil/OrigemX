import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/types/database";

/**
 * Renova a sessão do Supabase a cada request. Chamado pelo `src/proxy.ts`.
 *
 * Não decide autorização — isso é da RLS. Aqui só mantemos o cookie de sessão
 * fresco, para que Server Components não recebam um token expirado.
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
  await supabase.auth.getClaims();

  // Devolver ESTE objeto. Criar um NextResponse novo sem copiar os cookies
  // dessincroniza navegador e servidor e derruba a sessão.
  return supabaseResponse;
}
