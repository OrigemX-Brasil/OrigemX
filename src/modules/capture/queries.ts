import { createPublicClient } from "@/lib/supabase/public";

import { DEFAULT_SOURCE, normalizePath, normalizeSource, type EventKind } from "./events";

/**
 * ============================================================================
 * Gravação e leitura da medição.
 * ============================================================================
 *
 * A ESCRITA PASSA POR `public.record_landing_event`, função `SECURITY DEFINER`
 * estreita. A aplicação nunca precisa da chave secreta para isto, e `anon` não
 * tem INSERT na tabela — o que entra tem forma fixa e passa por corte de
 * tamanho no banco.
 *
 * Client ANÔNIMO, sem cookie: a gravação acontece na página de captura, que não
 * tem sessão nenhuma, e ler cookie aqui tornaria a rota do pixel dependente de
 * sessão sem motivo.
 */

/**
 * Registra um evento. NUNCA levanta e nunca bloqueia decisão.
 *
 * Se a métrica falhar, a página abre igual e o cadastro conclui igual. Um
 * contador quebrado não pode custar um cadastro — é a inversão exata da
 * prioridade certa.
 */
export async function recordEvent(
  kind: EventKind,
  source: string = DEFAULT_SOURCE,
  path = "/",
): Promise<void> {
  try {
    const supabase = createPublicClient();
    await supabase.rpc("record_landing_event", {
      p_kind: kind,
      // Normalizado aqui também, e não só no banco: o `left()` da função corta
      // tamanho, mas é esta passagem que faz "Feira", "FEIRA" e "feira " serem
      // uma origem só no relatório.
      p_source: normalizeSource(source),
      p_path: normalizePath(path),
    });
  } catch {
    // Silêncio proposital.
  }
}
