import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/types/database";

/**
 * Client do Supabase para Server Component, Server Action e Route Handler.
 *
 * Continua usando a publishable key: a sessão vem do cookie e a RLS decide o
 * que este usuário enxerga. Nunca trocar pela secret key para "resolver" um
 * erro de permissão — isso desliga a autorização em vez de corrigi-la.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component, onde cookies são read-only.
            // Pode ser ignorado: o proxy.ts já renova a sessão a cada request.
          }
        },
      },
    },
  );
}
