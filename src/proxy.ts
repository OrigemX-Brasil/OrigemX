import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, exceto estáticos e imagens — sem isto, a renovação de
     * sessão dispararia em cada CSS e cada foto de cão servida pelo Storage.
     *
     * `api/e` também fica de fora: é o pixel de medição da página de captura,
     * que não tem sessão para renovar. Deixá-lo passar aqui custaria uma ida ao
     * Supabase (`getClaims`) a cada acesso da landing — numa feira, uma chamada
     * de rede inútil por visitante, na página que mais precisa ser rápida.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/e|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
