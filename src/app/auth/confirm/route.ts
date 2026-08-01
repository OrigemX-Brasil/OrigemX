import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sanitizeNext } from "@/modules/auth/redirect";

/**
 * Links enviados por e-mail: confirmação de cadastro e recuperação de senha.
 *
 * O Supabase manda `token_hash` + `type`. Trocamos por sessão aqui, no servidor.
 * O token é de uso único e expira — um link vazado depois de usado não serve.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const next = sanitizeNext(searchParams.get("next"));

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?erro=link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // Link expirado ou já usado. Não distinguimos os casos: para quem tem o
    // link isso não muda nada, e para quem não tem é informação de graça.
    return NextResponse.redirect(`${origin}/login?erro=link`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
