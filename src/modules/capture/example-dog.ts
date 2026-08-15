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

/** Foto de capa do pai (Fire Fighter From Kanekt), mesmo bucket público — para o `thumbs` da prévia de pedigree em `example-profile-card.tsx`. */
export const EXAMPLE_SIRE_AVATAR_URL =
  "https://rvdsrpbybsrrqljparnw.supabase.co/storage/v1/object/public/kennel-media-public/a4bd3927-2030-4fa7-8754-70775ad2b988/caes/e5f228c2-2d1b-42a8-8925-3f0fb5ecd9fc/ce504b56-180b-4a13-876e-a2dd74dde582.jpg";

/** Foto de capa da mãe (Sensation Power Chronos), mesmo bucket público — idem. */
export const EXAMPLE_DAM_AVATAR_URL =
  "https://rvdsrpbybsrrqljparnw.supabase.co/storage/v1/object/public/kennel-media-public/5715f466-0713-4c82-9c54-9fea567792e8/caes/bd898109-c87d-4bbe-949e-5412e5662289/d5c53cda-1e3a-4d53-8a3c-924ce12d72c5.webp";
