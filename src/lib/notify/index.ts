import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import { type EventoInterno } from "./eventos";
import { decidir, inicioDaJanela, JANELA_MINUTOS, tetoConfigurado } from "./limite";
import { montarEmail } from "./template";

/**
 * ============================================================================
 * Notificação interna para a equipe, pela API do Resend.
 * ============================================================================
 *
 * NÃO CONFUNDIR com o e-mail transacional. Aquele — confirmação de cadastro,
 * recuperação de senha — sai do Supabase pelo SMTP do Resend e vai para o
 * USUÁRIO. Este sai do nosso código, pela API, e vai para a EQUIPE.
 *
 * ------------------------------------------------------------------ garantias
 *
 * NUNCA PROPAGA. A assinatura devolve `void` e o corpo inteiro está num
 * try/catch. Cadastrar um cão não pode falhar porque a caixa de e-mail da
 * equipe está fora do ar — a notificação é acessório, o cadastro é o produto.
 *
 * SEM CHAVE, LOGA. Em desenvolvimento, teste e CI não há `RESEND_API_KEY`;
 * o módulo escreve no console e retorna, sem tocar em rede. Nenhum teste fica
 * dependente de serviço externo.
 *
 * SÓ NO SERVIDOR. `RESEND_API_KEY` não tem `NEXT_PUBLIC_`, então o Next nunca a
 * embute no bundle do navegador — lá ela seria `undefined`. A guarda abaixo
 * transforma um import errado em erro alto na hora, em vez de um envio mudo que
 * ninguém investiga.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Teto do envio. Acima disso o Resend recusaria de qualquer forma. */
const TIMEOUT_MS = 8_000;

function apenasServidor(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "src/lib/notify só roda no servidor. Importar em componente de cliente " +
        "expõe a intenção de usar RESEND_API_KEY, que lá é sempre undefined.",
    );
  }
}

/**
 * Client com a chave secreta, só para CONTAR.
 *
 * A contagem precisa enxergar linhas que a RLS esconde do próprio usuário: um
 * criador não vê o canil recém-criado por outra pessoa, então uma consulta com
 * a sessão dele responderia sempre "1" e o corta-circuito nunca dispararia.
 *
 * Por que aqui a chave secreta é aceitável e no pixel de captura não foi: aquele
 * é endpoint PÚBLICO, que qualquer um chama à vontade — por isso ganhou uma
 * função `SECURITY DEFINER` estreita. Este caminho só existe dentro de server
 * action e route handler já autenticados, e é o uso que o próprio `.env.example`
 * descreve para a chave. A alternativa seria uma função aberta ao `anon`
 * devolvendo "quantas contas nasceram na última hora", que é métrica de negócio
 * do cliente e não deve ficar pública.
 */
function clienteDeContagem() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;

  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

/** Quantos eventos daquele tipo na janela, incluindo o que acabou de nascer. */
async function contarNaJanela(tipo: EventoInterno["tipo"]): Promise<number | null> {
  if (tipo === "volume-alto") return null;

  const supabase = clienteDeContagem();
  if (!supabase) return null;

  const tabela = tipo === "conta-criada" ? "profiles" : "kennels";
  const { count, error } = await supabase
    .from(tabela)
    .select("id", { count: "exact", head: true })
    .gte("created_at", inicioDaJanela());

  if (error) return null;
  return count ?? null;
}

async function enviar(assunto: string, html: string, texto: string): Promise<void> {
  const chave = process.env.RESEND_API_KEY;
  const para = process.env.NOTIFY_EMAIL;
  const de = process.env.NOTIFY_FROM;

  if (!chave || !para || !de) {
    // Caminho de desenvolvimento. Escreve o que TERIA saído, para dar para
    // conferir o conteúdo sem configurar nada.
    console.info(`[notify] (sem envio) ${assunto}\n${texto}`);
    return;
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: de, to: [para], subject: assunto, html, text: texto }),
      signal: controle.signal,
    });

    if (!res.ok) {
      // O corpo do erro do Resend diz o motivo — cota estourada, domínio não
      // verificado, chave inválida. Sem ele, o log seria só "falhou".
      console.error(`[notify] Resend recusou (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Avisa a equipe. Não devolve nada e não levanta nada.
 *
 * Chamar sempre dentro de `after()` do `next/server`: assim a resposta vai para
 * o usuário antes desta função começar, e o Next mantém a execução viva depois
 * dela — um `void notificarEvento(...)` solto seria congelado junto com a
 * função serverless e o e-mail não sairia.
 */
export async function notificarEvento(evento: EventoInterno): Promise<void> {
  try {
    apenasServidor();

    const quantidade = await contarNaJanela(evento.tipo);

    // Sem contagem — chave ausente ou consulta falhou — segue e envia. Perder o
    // corta-circuito é aceitável; perder a notificação por causa dele não.
    if (quantidade !== null) {
      const decisao = decidir(quantidade, tetoConfigurado());

      if (decisao.acao === "silenciar") return;

      if (decisao.acao === "avisar-volume") {
        const aviso = montarEmail({
          tipo: "volume-alto",
          evento: evento.tipo as "conta-criada" | "canil-criado",
          quantidade: decisao.quantidade,
          janelaMinutos: JANELA_MINUTOS,
        });
        await enviar(aviso.assunto, aviso.html, aviso.texto);
        return;
      }
    }

    const email = montarEmail(evento);
    await enviar(email.assunto, email.html, email.texto);
  } catch (erro) {
    // O ponto do módulo inteiro. Aqui a falha morre.
    console.error("[notify] falhou e o fluxo segue:", erro instanceof Error ? erro.message : erro);
  }
}

export type { EventoInterno } from "./eventos";
