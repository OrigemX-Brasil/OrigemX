import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
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
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=oauth`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
