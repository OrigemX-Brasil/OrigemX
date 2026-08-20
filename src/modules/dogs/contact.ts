import { publicLink, whatsappLink } from "@/modules/public/whatsapp";

/**
 * ============================================================================
 * CTA de contato do CÃO — um LINK, e nada além disso.
 * ============================================================================
 *
 * Mesmo desenho do CTA da ninhada (`litters/contact.ts`), e os dois dividem o
 * núcleo em `public/whatsapp.ts`. O que muda é só a mensagem: a ninhada se
 * identifica por DATA (ela não tem coluna de nome), o cão se identifica pelo
 * NOME, que é o que o criador reconhece de imediato.
 */

type DogContact = {
  /** `kennels.whatsapp` — só dígitos com código do país, por CHECK do banco. */
  phone: string | null | undefined;
  /** `dogs.public_id` — o identificador estável, o mesmo do QR. */
  publicId: string;
  dogName: string;
  /** `dogs.sex` — decide o artigo. Qualquer valor fora de "female" cai em "no". */
  sex: string;
  /** Base pública, de `siteUrl()` (`modules/public/metadata.ts`). */
  siteUrl: string;
};

/**
 * O `href` do CTA, ou `null` quando o criador não cadastrou telefone.
 *
 * Sem fallback para Instagram ou site — mesma decisão de produto já registrada
 * no CTA da ninhada: um botão escrito "Falar no WhatsApp" que abre um perfil
 * genérico promete uma coisa e entrega outra.
 */
export function dogWhatsappHref({
  phone,
  publicId,
  dogName,
  sex,
  siteUrl,
}: DogContact): string | null {
  const link = publicLink(siteUrl, `/d/${publicId}`);

  // "Tenho interesse NO Thor" / "NA Bella". O artigo errado é o tipo de
  // detalhe que faz a mensagem parecer gerada por máquina — e o sexo já está
  // cadastrado, é `not null` no banco.
  const artigo = sex === "female" ? "na" : "no";

  return whatsappLink({
    phone,
    message: `Olá! Tenho interesse ${artigo} ${dogName.trim()} (${link}) no OrigemX.`,
  });
}
