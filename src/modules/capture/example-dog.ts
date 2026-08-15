/**
 * Identidade do cão de EXEMPLO da home ("Veja como fica") — Fire Moon New
 * Creation & Power Chronos, American Staffordshire Terrier, canil New
 * Creation (Hugo Pereira). Cão de cliente real, com consentimento — ao
 * contrário do exemplo anterior (Thor, seedado à parte especificamente para
 * ser neutro), este já existia, publicado, com foto e pedigree de verdade.
 *
 * `public_id` é o mesmo de qualquer cão real, gerado pelo banco
 * (`gen_public_id()`) — não existe forma de escolher um literal tipo
 * "exemplo": o formato é sempre 12 caracteres de um alfabeto restrito
 * (`dogs_public_id_format`), a mesma regra que garante que o QR de um
 * cliente real nunca muda.
 */
export const EXAMPLE_DOG_PUBLIC_ID = "mtqypbeqaxqp";
export const EXAMPLE_DOG_PATH = `/d/${EXAMPLE_DOG_PUBLIC_ID}`;
export const EXAMPLE_DOG_URL = `https://www.origemxbr.com${EXAMPLE_DOG_PATH}`;

/** Foto principal (`position: 0`), bucket público — mesma URL que a página real usa. */
export const EXAMPLE_DOG_AVATAR_URL =
  "https://rvdsrpbybsrrqljparnw.supabase.co/storage/v1/object/public/kennel-media-public/a4bd3927-2030-4fa7-8754-70775ad2b988/caes/6fc3a8d7-8507-4f9a-a720-4ac903b31cd4/ebce010c-3c44-4717-8f99-c28a88643596.jpg";
