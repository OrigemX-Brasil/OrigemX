import { after, NextResponse, type NextRequest } from "next/server";

import { notificarEvento } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { isNewAccount, normalizeSource, SOURCE_PARAM } from "@/modules/capture/events";
import { recordEvent } from "@/modules/capture/queries";
import { sanitizeNext } from "@/modules/auth/redirect";

/**
 * Retorno do OAuth (Google).
 *
 * O provedor devolve um `code` de uso único; aqui ele vira sessão em cookie
 * httpOnly. O fluxo é PKCE — o verifier fica em cookie e nunca sai do servidor,
 * então interceptar o `code` na URL não basta para roubar a sessão.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const next = sanitizeNext(searchParams.get("next"));

  // O provedor pode recusar — usuário cancelou, consentimento negado.
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?erro=oauth`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=oauth`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=oauth`);
  }

  // Conversão do Anexo I.11, caminho Google.
  //
  // O OAuth não distingue "cadastrou" de "entrou": o provedor devolve o mesmo
  // `code` nos dois casos e o Supabase cria a conta em silêncio quando ela não
  // existe. A idade da conta é o sinal que sobra — ver `isNewAccount`.
  //
  // Sem isto, todo cadastro feito por Google sumiria da conta de conversão e a
  // taxa entregue ao cliente sairia menor do que a real.
  if (isNewAccount(data.user?.created_at)) {
    await recordEvent("signup", normalizeSource(searchParams.get(SOURCE_PARAM)));

    // Aviso interno, no MESMO sinal que a métrica usa. Uma segunda regra para
    // responder "é conta nova?" divergiria da primeira no primeiro ajuste.
    const usuario = data.user;
    if (usuario) {
      after(async () => {
        try {
          await notificarEvento({
            tipo: "conta-criada",
            // O Google devolve o nome em `full_name` ou `name`, conforme o
            // escopo concedido. Nenhum dos dois é garantido.
            nome:
              (usuario.user_metadata?.full_name as string | undefined) ??
              (usuario.user_metadata?.name as string | undefined) ??
              null,
            origem: "google",
            id: usuario.id,
          });
        } catch {
          // O login por Google não pode falhar por causa de e-mail interno.
        }
      });
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
