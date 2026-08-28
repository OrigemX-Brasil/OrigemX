import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import { decidirEnvio, JANELA_DIAS, type EmailKind, type EnvioAnterior } from "./decisao";
import type { PecaPronta } from "./pecas";

/**
 * ============================================================================
 * A porta única de todo e-mail AO USUÁRIO.
 * ============================================================================
 *
 * TUDO passa por aqui — opt-out, teto de frequência e registro no log. Não
 * existe caminho alternativo, e é isso que torna a guarda de frequência
 * central em vez de repetida caso a caso: um disparo novo que não chame esta
 * função simplesmente não envia e-mail nenhum, porque ela é a única com o
 * transporte.
 *
 * NUNCA PROPAGA E NUNCA BLOQUEIA O FLUXO. Devolve `void`, tudo dentro de
 * try/catch. Cadastrar um cão não pode falhar porque o Resend caiu — mesma
 * garantia que `notificarEvento` já dá, e pelo mesmo motivo.
 *
 * SEM CHAVE, LOGA. Em desenvolvimento, teste e CI não há `RESEND_API_KEY`; o
 * módulo escreve no console e não toca em rede. É por isso que a suíte e2e
 * consegue verificar toda a REGRA (opt-out, teto, não repetir) sem depender de
 * serviço externo: o registro em `user_emails` acontece de qualquer forma.
 *
 * CHAVE DE SERVIÇO, e o motivo é o mesmo já documentado em
 * `clienteDeContagem()` do módulo interno: a contagem precisa enxergar linhas
 * que a RLS esconderia, e `user_emails` não tem policy nenhuma de propósito —
 * ela não interessa a nenhum client.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 8_000;

function apenasServidor(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "src/lib/notify/usuario só roda no servidor. Importar em componente de " +
        "cliente expõe a intenção de usar RESEND_API_KEY, que lá é sempre undefined.",
    );
  }
}

function clienteDeServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

type Supabase = NonNullable<ReturnType<typeof clienteDeServico>>;

/**
 * O e-mail de destino mora em `auth.users`, não em `profiles` — o schema
 * espelha os dois 1:1 pelo id, e o endereço nunca foi copiado para a nossa
 * tabela (ver `admin_get_profile_email`). Só a chave de serviço lê de lá.
 */
async function emailDoUsuario(supabase: Supabase, profileId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(profileId);
  if (error) return null;
  return data.user?.email ?? null;
}

async function enviarPeloResend(para: string, peca: PecaPronta): Promise<void> {
  const chave = process.env.RESEND_API_KEY;
  const de = process.env.NOTIFY_FROM;

  if (!chave || !de) {
    // Caminho de desenvolvimento e de teste. Escreve o que TERIA saído, para
    // dar para conferir sem configurar nada — e sem tocar em rede.
    console.info(`[email:usuario] (sem envio) para=${para} assunto=${peca.assunto}`);
    return;
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: de,
        to: [para],
        subject: peca.assunto,
        html: peca.html,
        text: peca.texto,
      }),
      signal: controle.signal,
    });

    if (!res.ok) {
      console.error(
        `[email:usuario] Resend recusou (${res.status}): ${(await res.text()).slice(0, 300)}`,
      );
    }
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Envia — se a decisão deixar. Não devolve nada e não levanta nada.
 *
 * Chamar sempre dentro de `after()` do `next/server`, como `notificarEvento`:
 * assim a resposta chega ao usuário antes de a função começar, e o Next mantém
 * a execução viva depois dela. Um `void` solto seria congelado junto com a
 * função serverless e o e-mail não sairia.
 */
export async function enviarEmailAoUsuario(profileId: string, peca: PecaPronta): Promise<void> {
  try {
    apenasServidor();

    const supabase = clienteDeServico();
    if (!supabase) {
      console.info("[email:usuario] sem chave de serviço; nada enviado.");
      return;
    }

    const { data: perfil } = await supabase
      .from("profiles")
      .select("email_opt_out")
      .eq("id", profileId)
      .maybeSingle();

    // Perfil ausente é o caso de conta recém-apagada. Não é erro, e não há a
    // quem enviar.
    if (!perfil) return;

    // Só a janela interessa para a decisão. `JANELA_DIAS` é a mesma constante
    // que `decidirEnvio` usa para filtrar de novo — a consulta corta o volume,
    // a função pura é quem decide.
    const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentes } = await supabase
      .from("user_emails")
      .select("id, kind, sent_at")
      .eq("profile_id", profileId)
      .gte("sent_at", desde)
      .order("sent_at", { ascending: false })
      .limit(50);

    /**
     * O `kind` de evento único precisa ser procurado no HISTÓRICO INTEIRO, não
     * só na janela de 7 dias: "primeiro cão" enviado há um ano continua sendo
     * um envio que não deve se repetir. Por isso esta segunda consulta,
     * estreita (só aquele kind, uma linha).
     */
    const { data: mesmoKind } = await supabase
      .from("user_emails")
      .select("id, kind, sent_at")
      .eq("profile_id", profileId)
      .eq("kind", peca.kind)
      .limit(1);

    /**
     * DEDUPLICAR POR `id` É OBRIGATÓRIO, não higiene.
     *
     * As duas consultas se SOBREPÕEM: um envio recente do mesmo `kind` volta
     * nas duas, e concatenar sem deduplicar contaria a MESMA linha duas vezes.
     * Com o teto em 2, um único e-mail na semana já bloquearia o próximo —
     * silenciosamente, e só para quem tivesse recebido aquele mesmo tipo antes.
     *
     * Foi um defeito real desta função, encontrado porque a prova de
     * não-vacuidade do e2e não falhava nem com as duas guardas desligadas: o
     * teto estava barrando no lugar delas, pela contagem dobrada.
     */
    const porId = new Map<string, EnvioAnterior>();
    for (const r of [...(recentes ?? []), ...(mesmoKind ?? [])]) {
      porId.set(r.id, { kind: r.kind as EmailKind, sentAt: r.sent_at });
    }
    const anteriores: EnvioAnterior[] = [...porId.values()];

    const decisao = decidirEnvio({
      kind: peca.kind,
      optOutAt: perfil.email_opt_out,
      anteriores,
    });

    if (!decisao.enviar) {
      console.info(`[email:usuario] ${peca.kind} não enviado (${decisao.motivo}).`);
      return;
    }

    const para = await emailDoUsuario(supabase, profileId);
    if (!para) return;

    await enviarPeloResend(para, peca);

    /**
     * O LOG É ESCRITO DEPOIS DO ENVIO, e mesmo quando não há chave do Resend.
     *
     * Depois: se gravássemos antes e o envio falhasse, o e-mail ficaria
     * marcado como enviado e nunca mais sairia — um evento único perdido para
     * sempre. Falhar e não registrar deixa a porta aberta para a próxima
     * tentativa.
     *
     * Mesmo sem chave: em desenvolvimento o registro é o que torna a REGRA
     * verificável de ponta a ponta (o teste confere que o segundo cão não
     * gera linha) sem depender de serviço externo.
     */
    await supabase.from("user_emails").insert({ profile_id: profileId, kind: peca.kind });
  } catch (erro) {
    // O ponto do módulo inteiro. Aqui a falha morre.
    console.error(
      "[email:usuario] falhou e o fluxo segue:",
      erro instanceof Error ? erro.message : erro,
    );
  }
}

/**
 * A URL de descadastro daquele usuário. `null` quando não há token — conta
 * apagada no meio do caminho.
 *
 * Fica aqui, e não em `pecas.ts`, porque exige banco: o token é segredo por
 * linha e não se deriva de nada que quem monta a peça já tenha.
 */
export async function urlDeDescadastro(profileId: string, base: string): Promise<string | null> {
  const supabase = clienteDeServico();
  if (!supabase) return null;

  const { data } = await supabase
    .from("profiles")
    .select("unsubscribe_token")
    .eq("id", profileId)
    .maybeSingle();

  if (!data?.unsubscribe_token) return null;
  return new URL(`/e/descadastro?t=${data.unsubscribe_token}`, base).toString();
}
