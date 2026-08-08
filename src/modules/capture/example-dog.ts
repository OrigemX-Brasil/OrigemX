/**
 * Identidade do cão de EXEMPLO da home ("Veja como fica") — Thor, Rottweiler,
 * canil "O Criador". Cão de verdade: existe no banco, tem foto, tem pedigree
 * de quatro gerações — não é fixture.
 *
 * Criado por `supabase/tests/seed-example-dog.sql` + `scripts/seed-example-dog-media.mts`,
 * os dois scripts de produção, rodados uma vez. `public_id` é gerado pelo
 * banco (`gen_public_id()`) como o de qualquer cão real — não existe forma de
 * escolher um literal tipo "exemplo": o formato é sempre 12 caracteres de um
 * alfabeto restrito (`dogs_public_id_format`), a mesma regra que garante que
 * o QR de um cliente real nunca muda.
 */
export const EXAMPLE_DOG_PUBLIC_ID = "afg6w6srgvpm";
export const EXAMPLE_DOG_PATH = `/d/${EXAMPLE_DOG_PUBLIC_ID}`;
export const EXAMPLE_DOG_URL = `https://www.origemxbr.com${EXAMPLE_DOG_PATH}`;

/** Foto principal (`position: 0`), bucket público — mesma URL que a página real usa. */
export const EXAMPLE_DOG_AVATAR_URL =
  "https://rvdsrpbybsrrqljparnw.supabase.co/storage/v1/object/public/kennel-media-public/58ce26b2-7fa1-4239-b7f0-0c223279eb74/caes/10000000-0000-4000-9000-000000000001/principal.jpg";
