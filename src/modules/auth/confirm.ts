import { type EmailOtpType } from "@supabase/supabase-js";

/**
 * As duas decisões da rota `/auth/confirm`, isoladas do I/O.
 *
 * A rota faz três coisas: escolhe como verificar, verifica (rede), e decide
 * para onde mandar. A primeira e a terceira são pura lógica — e são onde um
 * engano é sutil e caro, porque o sintoma aparece na caixa de entrada de outra
 * pessoa, dias depois. Ficam aqui, testáveis, em vez de dentro do handler.
 */

/**
 * Só os tipos que os nossos templates emitem.
 *
 * `type` chega pela URL. Repassá-lo cru ao `verifyOtp` deixaria um estranho
 * escolher qual verificação tentar — `invite` e `magiclink` não são fluxos
 * deste app e não devem ser alcançáveis por quem monta uma URL à mão.
 */
export const TIPOS_ACEITOS: readonly EmailOtpType[] = ["signup", "recovery", "email_change"];

export type Tentativa =
  | { via: "otp"; tokenHash: string; tipo: EmailOtpType }
  | { via: "code"; code: string }
  | { via: "nenhuma" };

/**
 * Como verificar, a partir do que veio na URL.
 *
 * `token_hash` tem precedência sobre `code`: é o padrão para o qual os
 * templates foram corrigidos. O `code` continua aceito porque link antigo, com
 * `{{ .ConfirmationURL }}`, pode estar numa caixa de entrada agora — e porque
 * o PKCE do `@supabase/ssr` é que devolve essa forma.
 *
 * O fluxo implícito (`#access_token=`) não aparece aqui porque não PODE:
 * fragmento de URL não é enviado no HTTP e nunca chega ao servidor.
 */
export function escolherTentativa(params: URLSearchParams): Tentativa {
  const tokenHash = params.get("token_hash");
  const tipo = params.get("type");
  const code = params.get("code");

  if (tokenHash && tipo && TIPOS_ACEITOS.includes(tipo as EmailOtpType)) {
    return { via: "otp", tokenHash, tipo: tipo as EmailOtpType };
  }

  if (code) return { via: "code", code };

  return { via: "nenhuma" };
}

/**
 * Para onde mandar, depois de tentar.
 *
 * A regra que corrige o falso erro: **sessão válida vale mais que token
 * consumido**. O token é de uso único, e nem sempre quem o gasta é a pessoa —
 * Gmail, Outlook e antivírus corporativo abrem o link para inspecionar antes do
 * clique humano. Quando isso acontece, a conta já foi ativada e o clique real
 * chega com um token gasto: reportar erro ali seria anunciar uma falha que não
 * houve.
 *
 * Só é erro quando não há sessão E o token não vale.
 */
export function destinoFinal(estado: {
  verificou: boolean;
  temSessao: boolean;
  next: string;
}): string {
  if (estado.verificou) return estado.next;
  if (estado.temSessao) return estado.next;
  return "/login?erro=link";
}
