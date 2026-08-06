import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { destinoFinal, escolherTentativa } from "@/modules/auth/confirm";
import { registrarAuthError } from "@/modules/auth/errors";
import { getAuthUser } from "@/modules/auth/queries";
import { sanitizeNext } from "@/modules/auth/redirect";

/**
 * Links enviados por e-mail: confirmação de cadastro, recuperação de senha e
 * troca de endereço. Os três chegam aqui.
 *
 * O Supabase tem dois padrões de link, mutuamente exclusivos:
 *
 *   `{{ .ConfirmationURL }}` → aponta para o `/auth/v1/verify` do GoTrue, que
 *      verifica o token ELE MESMO e devolve a sessão em `?code=` (PKCE) ou em
 *      `#access_token=` (implícito).
 *
 *   `token_hash`             → aponta para cá, e QUEM verifica somos nós.
 *
 * Esta rota lia só `token_hash` enquanto os templates usavam
 * `{{ .ConfirmationURL }}`. O parâmetro nunca chegava, e todo mundo era mandado
 * para `/login?erro=link` — DEPOIS de o GoTrue já ter ativado a conta. A pessoa
 * lia "link expirado" e conseguia entrar em seguida. Os templates foram
 * corrigidos para `token_hash`; a rota aceita as duas formas porque link antigo
 * pode estar numa caixa de entrada agora.
 *
 * O fluxo implícito é o único que esta rota não tem como atender: fragmento de
 * URL não é enviado no HTTP, então nenhum código de servidor pode lê-lo. É
 * exatamente por isso que `token_hash` é o padrão certo aqui.
 *
 * A decisão — o que tentar, e para onde ir depois — mora em
 * `@/modules/auth/confirm`, testada. Aqui fica só o I/O.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = sanitizeNext(searchParams.get("next"));

  const tentativa = escolherTentativa(searchParams);
  const supabase = await createClient();

  let verificou = false;

  if (tentativa.via === "otp") {
    const { error } = await supabase.auth.verifyOtp({
      type: tentativa.tipo,
      token_hash: tentativa.tokenHash,
    });
    if (error) registrarAuthError("confirm:verifyOtp", error);
    verificou = !error;
  } else if (tentativa.via === "code") {
    const { error } = await supabase.auth.exchangeCodeForSession(tentativa.code);
    if (error) registrarAuthError("confirm:exchangeCode", error);
    verificou = !error;
  }

  // Só consulta a sessão quando a verificação não resolveu — é a rede que o
  // caminho feliz não precisa pagar.
  const temSessao = verificou ? true : (await getAuthUser()) !== null;

  return NextResponse.redirect(`${origin}${destinoFinal({ verificou, temSessao, next })}`);
}
