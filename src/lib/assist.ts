import { createClient } from "@/lib/supabase/server";

/**
 * ============================================================================
 * Cadastro assistido — o lado da aplicação.
 * ============================================================================
 *
 * A REGRA MORA NO BANCO, não aqui. `private.assisting_profile()` é quem as
 * policies consultam, e é ela que decide se a escrita passa. Este módulo só
 * responde às perguntas que a TELA precisa fazer: "estou assistindo alguém?",
 * "quem?", e "de quem deve ser o registro que estou criando agora?".
 *
 * Nada aqui autoriza coisa alguma. Se este arquivo mentisse, o banco recusaria
 * a escrita do mesmo jeito — é a mesma divisão de trabalho que `founder.ts` já
 * segue com `kennel_is_founder_eligible`.
 */

export type AssistSession = {
  id: string;
  targetProfileId: string;
  targetName: string | null;
  reason: string;
  startedAt: string;
};

/** O `owner` embutido vem como objeto OU array, conforme o PostgREST infere. */
function nomeDoAlvo(alvo: unknown): string | null {
  const row = Array.isArray(alvo) ? alvo[0] : alvo;
  return (row as { full_name: string | null } | null | undefined)?.full_name ?? null;
}

/**
 * A sessão aberta do admin atual, ou `null`.
 *
 * Sem filtro por `admin_id`: a policy `admin_assist_sessions_select` já limita a
 * leitura, e o índice único parcial garante no máximo uma aberta por admin —
 * repetir o filtro aqui só criaria uma segunda definição de "minha sessão" para
 * divergir depois. Para quem não é admin, a policy devolve nada.
 */
export async function getAssistSession(): Promise<AssistSession | null> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  const { data } = await supabase
    .from("admin_assist_sessions")
    .select("id, target_profile_id, reason, started_at, alvo:profiles!admin_assist_sessions_target_profile_id_fkey(full_name)")
    .eq("admin_id", user.user.id)
    .is("ended_at", null)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    targetProfileId: data.target_profile_id,
    targetName: nomeDoAlvo(data.alvo),
    reason: data.reason,
    startedAt: data.started_at,
  };
}

/**
 * De quem é o registro que está sendo criado agora.
 *
 * Assistindo, o dono é o CRIADOR — nunca o admin. É esta linha que impede a
 * repetição do defeito que gravou quatro fotos com `owner_id` de admin: as
 * ações do dono estampavam `user.id` sem perguntar em nome de quem estavam
 * rodando.
 *
 * As policies exigem exatamente isto (`owner_id in (auth.uid(),
 * assisting_profile())`), então errar aqui vira recusa do banco, não registro
 * torto — mas a recusa é péssima UX, e a atribuição certa é barata.
 */
export async function resolveOwnerId(userId: string): Promise<string> {
  const sessao = await getAssistSession();
  return sessao?.targetProfileId ?? userId;
}

/**
 * O alvo da sessão, para os CARREGADORES do painel do dono decidirem se abrem
 * o registro para este admin. `null` quando não há sessão — e aí eles se
 * comportam exatamente como sempre se comportaram.
 *
 * Consulta ENXUTA de propósito, sem o join de `getAssistSession`: isto roda em
 * toda abertura de tela do painel, inclusive a de um criador comum que nunca
 * verá uma sessão. Para ele a policy não devolve linha nenhuma, e o custo é uma
 * consulta indexada por `admin_id`.
 */
export async function assistingProfileId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  const { data } = await supabase
    .from("admin_assist_sessions")
    .select("target_profile_id")
    .eq("admin_id", user.user.id)
    .is("ended_at", null)
    .maybeSingle();

  return data?.target_profile_id ?? null;
}
