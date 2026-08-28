import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/types/database";

/**
 * ============================================================================
 * Descadastro de e-mail — `/e/descadastro?t=<token>`
 * ============================================================================
 *
 * SEM LOGIN, e é o ponto inteiro da rota. A LGPD exige que dar baixa seja tão
 * fácil quanto entrar; obrigar a autenticar transformaria "não quero mais
 * receber" num fluxo de recuperação de senha. O link vai no rodapé de todo
 * e-mail não-transacional e precisa funcionar no primeiro clique, de qualquer
 * dispositivo, inclusive num cliente de e-mail que abre o navegador sem sessão.
 *
 * O QUE AUTORIZA É O TOKEN, não a sessão: `profiles.unsubscribe_token` é um
 * uuid aleatório por linha, e NÃO o id do usuário — com o id, quem descobrisse
 * um uuid (eles aparecem em caminho de Storage) descadastraria outra pessoa.
 *
 * TOKEN INVÁLIDO RESPONDE IGUAL A TOKEN VÁLIDO. Diferenciar transformaria a
 * rota num verificador de tokens: quem tivesse uma lista poderia descobrir
 * quais existem observando a resposta. O usuário legítimo nunca vê diferença,
 * porque o token dele funciona.
 *
 * GET, e não POST, apesar de gravar. É clique em link de e-mail — não há
 * formulário do outro lado. O risco clássico do GET que escreve é o
 * pré-carregador do cliente de e-mail disparar sozinho; aqui isso não é dano:
 * o efeito é exatamente o que o usuário pediria, e ele reverte no painel.
 */

export const dynamic = "force-dynamic";

function clienteDeServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("t");

  // Uma resposta só, para qualquer desfecho — ver o comentário acima.
  const confirmacao = NextResponse.redirect(`${origin}/e/descadastro/pronto`);

  if (!token) return confirmacao;

  try {
    const supabase = clienteDeServico();
    if (!supabase) return confirmacao;

    // `is("email_opt_out", null)`: quem já saiu não tem o horário reescrito.
    // A data do primeiro pedido é a que importa numa disputa de LGPD.
    await supabase
      .from("profiles")
      .update({ email_opt_out: new Date().toISOString() })
      .eq("unsubscribe_token", token)
      .is("email_opt_out", null);
  } catch (erro) {
    // Mesma postura do resto do módulo: a falha morre aqui. Uma página de erro
    // faria a pessoa achar que continua inscrita e tentar de novo.
    console.error("[descadastro] falhou:", erro instanceof Error ? erro.message : erro);
  }

  return confirmacao;
}
