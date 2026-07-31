import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/**
 * Client do Supabase para o navegador.
 *
 * Usa a publishable key — a única que pode chegar ao bundle. Toda autorização
 * é decidida pela RLS no banco, então esta chave sozinha não dá acesso a nada
 * que o usuário já não pudesse ver.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
