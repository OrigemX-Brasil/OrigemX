import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/**
 * Client ANÔNIMO, sem cookies e sem sessão. Para páginas públicas.
 *
 * Dois motivos, e o segundo é o que importa de verdade:
 *
 * 1. Ler cookie força render dinâmico no Next. Sem isto, ISR é impossível e a
 *    página pública consulta o banco a cada acesso.
 *
 * 2. CACHEAR UMA PÁGINA RENDERIZADA COM A SESSÃO DE ALGUÉM SERVIRIA A VISÃO
 *    DAQUELA PESSOA PARA TODO MUNDO. A RLS teria sido avaliada como ela, e o
 *    HTML resultante — que pode conter rascunho, canil não publicado, o que for
 *    — iria para o cache compartilhado. O client anônimo torna o conteúdo
 *    cacheado correto por construção: o que ele enxerga é exatamente o que
 *    qualquer visitante pode ver.
 *
 * Nunca usar isto em tela autenticada: lá a sessão é justamente o ponto.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        // Sem isto, o client tentaria ler a sessão de storage do navegador —
        // que no servidor não existe, e que tornaria o resultado dependente de
        // quem chamou.
        detectSessionInUrl: false,
      },
    },
  );
}
