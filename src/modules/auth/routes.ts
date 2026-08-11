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

/**
 * Prefixos autenticados do app.
 *
 * `/admin` exige sessão aqui, igual a `/painel` — mas sessão não é
 * autorização de admin. Quem decide isso é `requireAdmin()`, em
 * `queries.ts`, que roda no layout de `/admin` e relê `role`/`suspended_at`
 * do banco a cada request. Checar role AQUI exigiria consulta a tabela em
 * toda navegação — este arquivo e o proxy continuam sem tocar em banco,
 * de propósito.
 */
const PROTECTED_PREFIXES = ["/painel", "/admin"];

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
