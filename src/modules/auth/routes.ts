/**
 * Quais rotas abrem sem sessão.
 *
 * Isto é UX, não autorização — quem decide o que cada um vê é a RLS, no banco.
 * Ainda assim é uma lista que merece teste: um prefixo largo demais manda o
 * usuário para o login em cima de uma página que deveria ser pública, e o
 * perfil público é o produto.
 */

/**
 * Correspondência EXATA. Não usar prefixo aqui: `/login` como prefixo casaria
 * `/login-secreto` também.
 */
const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/nova-senha",
  /**
   * Pixel de medição da página de captura. Aberto porque a página de captura é
   * aberta — exigir sessão para contar um acesso anônimo seria contraditório.
   *
   * O matcher do proxy já pula esta rota, então na prática esta linha não é
   * consultada. Ela existe como rede: se alguém simplificar o matcher um dia, o
   * pixel continua respondendo em vez de virar redirect silencioso para o login
   * — e a métrica morreria sem ninguém perceber.
   */
  "/api/e",
]);

/**
 * Prefixos, sempre terminados em `/` para casar segmento inteiro.
 *
 * `/d/` — perfil do cão por public_id. É o destino do QR Code impresso e
 *         precisa abrir sem sessão, para sempre.
 * `/c/` — canil e cão por slug legível.
 * `/auth/` — callback do OAuth e confirmação por e-mail, que rodam justamente
 *            enquanto ainda não existe sessão.
 */
const PUBLIC_PREFIXES = ["/auth/", "/d/", "/c/"];

/** Rotas que quem já tem sessão não precisa ver. */
const GUEST_ONLY = new Set(["/login", "/cadastro"]);

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isGuestOnlyRoute(pathname: string): boolean {
  return GUEST_ONLY.has(pathname);
}
