/**
 * ============================================================================
 * O núcleo do link de WhatsApp — compartilhado por ninhada e cão.
 * ============================================================================
 *
 * Extraído de `litters/contact.ts` quando a página do CÃO passou a ter CTA
 * próprio. O que as duas têm em comum é exatamente isto: validar o telefone e
 * montar o `wa.me`. O que NÃO é comum é a mensagem — a ninhada se identifica
 * por data, o cão por nome — e por isso a mensagem entra pronta, como texto.
 *
 * A plataforma DIRECIONA para o WhatsApp do criador; a conversa acontece fora
 * do app. Não existe formulário de lead, não se persiste dado de quem
 * demonstra interesse, e nada é notificado por e-mail. Isso não é promessa de
 * comentário: este arquivo é uma função pura que devolve string, a página
 * renderiza um `<a href>`, e não há server action, `fetch` nem tabela em
 * lugar nenhum do caminho.
 */

/**
 * Espelha o CHECK `kennels_whatsapp_format`. A validação é repetida aqui de
 * propósito: função pura não deve depender de quem a chama ter lido a
 * migration, e um valor malformado — vindo de um seed manual, de um import
 * futuro, do que for — precisa produzir NENHUM BOTÃO em vez de um `wa.me`
 * quebrado que o visitante clica e não vai a lugar nenhum.
 */
const DIGITS_ONLY = /^[0-9]{10,15}$/;

/**
 * `null` quando o criador não cadastrou telefone (ou cadastrou algo que o
 * CHECK do banco não aceitaria). É a decisão de produto virando estrutura:
 * sem href a página não renderiza botão nenhum, e não há como o CTA existir
 * prometendo um contato que não está configurado.
 */
export function whatsappLink({
  phone,
  message,
}: {
  /** `kennels.whatsapp` — só dígitos com código do país, por CHECK do banco. */
  phone: string | null | undefined;
  message: string;
}): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!DIGITS_ONLY.test(digits)) return null;

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * `{siteUrl}/{path}`, sem barra dobrada.
 *
 * `new URL().origin` não traz barra final, mas um `NEXT_PUBLIC_SITE_URL`
 * digitado com barra produziria `//d/xxx`.
 */
export function publicLink(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, "")}${path}`;
}
