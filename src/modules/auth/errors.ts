/**
 * Erro do GoTrue → log no servidor + mensagem que a pessoa entende.
 *
 * Existe por um bug real: o cadastro em produção mostrava "Não foi possível
 * concluir. Tente novamente." e ninguém tinha como saber por quê. A causa era
 * `Error sending confirmation email` — o SMTP —, mas a tradução jogava essa
 * mensagem no genérico e a linha seguinte descartava o erro original. A
 * informação existia por um instante e era destruída ali.
 *
 * Duas responsabilidades, de propósito no mesmo lugar:
 *
 *  1. `registrarAuthError` escreve o erro CRU no log do servidor. Erro que não
 *     loga é erro que custa horas.
 *  2. `traduzirAuthError` é pura, e por isso testável: é a única coisa entre a
 *     falha do GoTrue e o que o usuário lê.
 *
 * `tratarAuthError` faz as duas numa chamada só — é o que os call sites usam,
 * para que nenhum possa esquecer de logar.
 */

/** Estrutural em vez de importar `AuthError`: mantém o módulo testável sem rede. */
export type AuthErrorLike = {
  message?: string | null;
  status?: number | null;
  code?: string | null;
};

const MIN_PASSWORD = 8;

/**
 * Tira e-mail de qualquer texto antes de ele virar log.
 *
 * Não é paranoia: a mensagem de e-mail inválido do GoTrue vem com o endereço
 * embutido (`Email address "fulano@exemplo.com" is invalid`). Sem isto, ligar o
 * log resolveria um problema e criaria outro — endereço de usuário gravado em
 * texto puro na infraestrutura de log.
 */
export function redigir(texto: string): string {
  return texto.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<e-mail>");
}

/**
 * O erro cru, no log do servidor. Nunca no que volta para o navegador.
 *
 * `onde` identifica a operação (`signUp`, `signIn`…) porque a mensagem do
 * GoTrue sozinha não diz de qual fluxo veio, e é a primeira pergunta de quem
 * abre o log.
 */
export function registrarAuthError(onde: string, error: AuthErrorLike): void {
  const status = error.status ?? "?";
  const code = error.code ?? "sem-code";
  console.error(`[auth:${onde}] ${status} ${code}: ${redigir(error.message ?? "")}`);
}

/**
 * Mensagens do GoTrue chegam em inglês. Traduz as que o usuário realmente
 * encontra, sem revelar mais do que o necessário: credencial inválida não diz
 * se foi o e-mail ou a senha que estava errada.
 *
 * Função PURA. O log fica em `registrarAuthError`.
 */
export function traduzirAuthError(message: string): string {
  const m = (message ?? "").toLowerCase();

  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";

  if (m.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Procure o link que enviamos.";
  }

  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "Já existe uma conta com esse e-mail.";
  }

  /*
   * O bug que originou este módulo.
   *
   * A conta É criada e só o envio falha, então "tente novamente" era a pior
   * orientação possível: a repetição bate em "já existe uma conta" e a pessoa
   * conclui que se cadastrou duas vezes. A mensagem precisa dizer que a conta
   * existe, que a culpa não é dela, e não prometer um reenvio que o app ainda
   * não tem.
   */
  if (m.includes("error sending confirmation") || m.includes("error sending signup")) {
    return (
      "Sua conta foi criada, mas não conseguimos enviar o e-mail de confirmação — " +
      "a falha é nossa, não sua. Aguarde alguns minutos e verifique a caixa de " +
      "entrada e o spam. Se não chegar, entre em contato com a gente."
    );
  }

  if (m.includes("error sending recovery") || m.includes("error sending magic link")) {
    return "Não conseguimos enviar o e-mail agora. Aguarde alguns minutos e tente de novo.";
  }

  /*
   * Falha do lado do banco — trigger, permissão, migration faltando. Não é algo
   * que a pessoa possa corrigir digitando diferente, então a mensagem não deve
   * sugerir que o erro está nos dados dela.
   */
  if (m.includes("database error")) {
    return (
      "Não foi possível concluir por uma falha no nosso servidor. " +
      "Tente de novo em alguns minutos."
    );
  }

  if (
    m.includes("signups not allowed") ||
    m.includes("email signups are disabled") ||
    m.includes("signup is disabled")
  ) {
    return "Os cadastros estão temporariamente desativados. Tente mais tarde.";
  }

  // Antes do teste de `password`: a mensagem de e-mail inválido do Supabase é
  // "Email address ... is invalid" e caía no genérico "Não foi possível
  // concluir" — quem digitou o e-mail errado não tinha como saber onde estava o
  // erro. Achado montando a suíte E2E.
  if (m.includes("email address") && m.includes("invalid")) {
    return "E-mail inválido. Confira o endereço e tente de novo.";
  }

  /*
   * Espera obrigatória entre dois envios para o mesmo endereço. Vem como "For
   * security purposes, you can only request this after 51 seconds." — não
   * contém "rate limit", então caía no genérico. O número está na mensagem;
   * devolvê-lo transforma "tente de novo" em uma instrução que a pessoa
   * consegue seguir.
   */
  const espera = /after (\d+) seconds?/.exec(m);
  if (espera) {
    return `Aguarde ${espera[1]} segundos antes de tentar de novo.`;
  }

  if (m.includes("password")) return `A senha precisa ter ao menos ${MIN_PASSWORD} caracteres.`;

  if (m.includes("rate limit") || m.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }

  return "Não foi possível concluir. Tente novamente.";
}

/** Loga o cru e devolve o traduzido. É o que os call sites devem usar. */
export function tratarAuthError(onde: string, error: AuthErrorLike): string {
  registrarAuthError(onde, error);
  return traduzirAuthError(error.message ?? "");
}
