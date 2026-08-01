/**
 * Saneamento do destino pós-autenticação.
 *
 * O parâmetro `next` chega de fora — de query string, de campo escondido, do
 * retorno do provedor OAuth. Redirecionar para ele sem checar é open redirect:
 * um link `/login?next=https://golpe.exemplo` levaria a vítima para fora logo
 * depois de ela digitar a senha, com a aparência de continuar no OrigemX.
 *
 * Vive isolado aqui porque três lugares precisam da mesma regra — as Server
 * Actions, o callback do OAuth e o confirm do e-mail. Regra duplicada é regra
 * que diverge.
 */

export const DEFAULT_NEXT = "/painel";

/**
 * Controle (tab e newline inclusive), espaço e DEL.
 *
 * Escrito com código em vez de regex: caractere de controle literal no fonte é
 * invisível na revisão e some em qualquer normalização de arquivo.
 */
function hasControlOrSpace(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Só caminho interno passa. Barra:
 *
 *   https://golpe   protocolo explícito
 *   //golpe         URL protocol-relative
 *   /\golpe         o navegador normaliza `\` para `/`, virando `//golpe` —
 *                   este é o bypass que a checagem ingênua de "//" não pega
 *   /(tab)/golpe    controle e espaço, que alguns parsers descartam antes de
 *                   resolver a URL
 */
export function sanitizeNext(value: unknown, fallback: string = DEFAULT_NEXT): string {
  if (typeof value !== "string") return fallback;

  const raw = value.trim();
  if (raw.length === 0) return fallback;

  // Precisa ser caminho absoluto interno.
  if (!raw.startsWith("/")) return fallback;

  // `//` e `/\` escapam para outro host. O navegador trata os dois igual.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;

  // Barra invertida em qualquer posição pode virar separador de autoridade
  // dependendo do parser. Não há caso legítimo dela numa rota nossa.
  if (raw.includes("\\")) return fallback;

  // Controle e espaço: alguns parsers removem antes de resolver, o que muda o
  // significado da string depois de ela já ter passado pela validação.
  if (hasControlOrSpace(raw)) return fallback;

  return raw;
}
