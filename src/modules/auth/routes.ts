/**
 * Quais rotas exigem sessão.
 *
 * Isto é UX, não autorização — quem decide o que cada um vê é a RLS, no banco.
 *
 * DENYLIST de prefixo protegido, não allowlist de rota pública. Antes era o
 * contrário — uma lista do que É público, e qualquer coisa fora dela virava
 * redirect pro login. Isso incluía URL digitada errado: em vez de cair no
 * `not-found`, o visitante anônimo caía no login, porque "rota desconhecida"
 * e "rota que ainda não entrou na lista" eram a mesma coisa para o allowlist.
 * Denylist de UM prefixo é mais fácil de manter certo que allowlist de N
 * rotas — página pública nova nunca precisa tocar aqui.
 */

/** Único prefixo autenticado do app hoje. */
const PROTECTED_PREFIXES = ["/painel"];

/** Rotas que quem já tem sessão não precisa ver. */
const GUEST_ONLY = new Set(["/login", "/cadastro"]);

/** Casa o prefixo inteiro (segmento), não `/painel-privado`. */
export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isGuestOnlyRoute(pathname: string): boolean {
  return GUEST_ONLY.has(pathname);
}
