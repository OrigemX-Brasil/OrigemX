import { isoToBr } from "@/modules/dogs/br-date";

import { expectedWhelpingDate } from "./gestation";

/**
 * ============================================================================
 * CTA de contato da ninhada — um LINK, e nada além disso.
 * ============================================================================
 *
 * A plataforma DIRECIONA para o WhatsApp do criador; a conversa acontece fora
 * do app. Não existe formulário de lead, não se persiste dado nenhum de quem
 * demonstra interesse, e nada é notificado por e-mail. Isso não é uma promessa
 * de comentário: este arquivo é uma função pura que devolve uma string, a
 * página renderiza um `<a href>`, e não há server action, `fetch` nem tabela
 * envolvida em lugar nenhum do caminho.
 *
 * PURO e sem banco, para o formato da mensagem ser testável sem subir nada.
 */

/** O que o criador precisa para saber QUAL ninhada é. */
type LitterContact = {
  /** `kennels.whatsapp` — só dígitos com código do país, por CHECK do banco. */
  phone: string | null | undefined;
  publicId: string;
  bornOn: string | null;
  matedOn: string | null;
  /** Base pública, de `siteUrl()` (`modules/public/metadata.ts`). */
  siteUrl: string;
};

/**
 * Espelha o CHECK `kennels_whatsapp_format`. A validação é repetida aqui de
 * propósito: função pura não deve depender de quem a chama ter lido a
 * migration, e um valor malformado — vindo de um seed manual, de um import
 * futuro, do que for — precisa produzir NENHUM BOTÃO em vez de um `wa.me`
 * quebrado que o visitante clica e não vai a lugar nenhum.
 */
const DIGITS_ONLY = /^[0-9]{10,15}$/;

/**
 * A mensagem pré-preenchida.
 *
 * `kennel_litters` NÃO TEM COLUNA DE NOME — a ninhada é identificada por data
 * e pelo link. Isso importa do lado de quem recebe: o criador é o dono do
 * canil, então "ninhada do Canil X" não lhe diz nada, e com três ninhadas
 * ativas ele não saberia qual. Data ele reconhece de imediato; o link resolve
 * qualquer ambiguidade que sobrar.
 *
 * As três formas seguem a mesma escolha que o cabeçalho da página já faz entre
 * nascimento e previsão — inclusive reusando `expectedWhelpingDate`, para as
 * duas nunca divergirem numa data.
 */
function mensagem(link: string, bornOn: string | null, matedOn: string | null): string {
  if (bornOn) {
    return `Olá! Tenho interesse na ninhada nascida em ${isoToBr(bornOn)} (${link}) no OrigemX.`;
  }

  const previsto = expectedWhelpingDate(matedOn);
  if (previsto) {
    return `Olá! Tenho interesse na ninhada prevista para ${isoToBr(previsto)} (${link}) no OrigemX.`;
  }

  // Ninhada sem data nenhuma ainda: o link sozinho já identifica.
  return `Olá! Tenho interesse nesta ninhada (${link}) no OrigemX.`;
}

/**
 * O `href` do CTA, ou `null` quando o criador não cadastrou telefone.
 *
 * `null` é a decisão de produto virando estrutura: sem href a página não
 * renderiza botão nenhum, e não há como o CTA existir prometendo um contato
 * que não está configurado. Não há fallback para Instagram ou site — um botão
 * escrito "Tenho interesse NESTA ninhada" que abre um perfil genérico promete
 * uma coisa e entrega outra.
 */
export function whatsappHref({
  phone,
  publicId,
  bornOn,
  matedOn,
  siteUrl,
}: LitterContact): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!DIGITS_ONLY.test(digits)) return null;

  // `replace` da barra final: `new URL().origin` não a tem, mas um
  // `NEXT_PUBLIC_SITE_URL` digitado com barra produziria `//n/xxx`.
  const link = `${siteUrl.replace(/\/+$/, "")}/n/${publicId}`;

  return `https://wa.me/${digits}?text=${encodeURIComponent(mensagem(link, bornOn, matedOn))}`;
}
