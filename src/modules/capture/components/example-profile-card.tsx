import Link from "next/link";

import { EXAMPLE_DOG_AVATAR_URL, EXAMPLE_DOG_PATH } from "@/modules/capture/example-dog";
import { PedigreeTree } from "@/modules/pedigree/components/pedigree-tree";
import { buildPedigree, type PedigreeRow } from "@/modules/pedigree/tree";
import { PublicImage } from "@/modules/public/components/public-image";

/**
 * Prévia do perfil público REAL da Fire Moon New Creation & Power Chronos
 * (ver `example-dog.ts`) — a página de captura promete "pedigree de várias
 * gerações" e "endereço que não muda" em texto; isto mostra, com o mesmo cão
 * que o card abre ao clicar.
 *
 * `PedigreeTree` é o componente REAL do perfil (sem fetch, sem client JS —
 * ver o próprio arquivo), com `variant="preview"`. Os pais aqui são fixture —
 * os MESMOS nomes/datas das linhas reais no banco — só pra caber num card
 * compacto sem ir buscar dado em build/request time numa página que precisa
 * continuar 100% estática. `is_public: false` em toda linha: o nome do
 * ancestral não vira link aqui dentro (a árvore de verdade, na página real, é
 * que decide isso) — mas quem garante isso é o `variant="preview"`, não o
 * dado: ele NUNCA emite `<Link>`, então nada aqui depende de toda linha
 * manter `is_public: false` para o card inteiro (que já é um `<Link>`, ver
 * abaixo) continuar sem `<a>` aninhado.
 *
 * SÓ PAIS, sem avós: a fixture não tem por que crescer só porque o risco de
 * elemento aninhado sumiu — o card de exemplo é uma prévia, "Ver perfil
 * completo →" é onde a árvore de verdade (com avós, bisavós…) aparece.
 */
const FIXTURE_ROWS: PedigreeRow[] = [
  {
    pos: 1,
    generation: 0,
    dog_id: "exemplo-firemoon",
    name: "Fire Moon New Creation & Power Chronos",
    is_public: false,
    public_id: null,
    sex: "female",
    breed: "American Staffordshire Terrier",
    born_on: "2021-12-09",
    kennel_name: null,
  },
  {
    pos: 2,
    generation: 1,
    dog_id: "exemplo-firefighter",
    name: "Fire Fighter From Kanekt",
    is_public: false,
    public_id: null,
    sex: "male",
    breed: "American Staffordshire Terrier",
    born_on: "2017-07-20",
    kennel_name: null,
  },
  {
    pos: 3,
    generation: 1,
    dog_id: "exemplo-sensation",
    name: "Sensation Power Chronos",
    is_public: false,
    public_id: null,
    sex: "female",
    breed: "American Staffordshire Terrier",
    born_on: "2015-10-13",
    kennel_name: null,
  },
];

const FIXTURE_PEDIGREE = buildPedigree(FIXTURE_ROWS);

export function ExampleProfileCard() {
  return (
    <Link
      href={EXAMPLE_DOG_PATH}
      className="border-border bg-surface hover:bg-surface-hover rounded-card focus-visible:outline-ring flex flex-col overflow-hidden border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {/* Barra de "navegador", decorativa — deixa claro que isto é a TELA de um
          endereço, não um cartão solto. */}
      <div className="border-border bg-surface-raised flex items-center gap-3 border-b px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="bg-fg-faint/40 size-2 rounded-full" />
          <span className="bg-fg-faint/40 size-2 rounded-full" />
          <span className="bg-fg-faint/40 size-2 rounded-full" />
        </span>
        <span className="bg-surface text-fg-faint rounded-control flex-1 truncate px-2 py-1 font-mono text-[0.65rem]">
          origemxbr.com{EXAMPLE_DOG_PATH}
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Registro</span>
          <span className="text-fg-faint bg-surface-hover rounded-control px-2 py-0.5 font-mono text-[0.65rem] tracking-wide uppercase">
            Exemplo
          </span>
        </div>

        <div className="flex items-center gap-4">
          <PublicImage
            src={EXAMPLE_DOG_AVATAR_URL}
            alt="Fire Moon New Creation & Power Chronos"
            fallbackText="Fire Moon New Creation & Power Chronos"
            width={96}
            height={96}
            className="rounded-card size-16 shrink-0 object-cover"
          />
          <div className="flex flex-col gap-0.5">
            <h3 className="font-display text-lg font-semibold tracking-tight">
              Fire Moon New Creation & Power Chronos
            </h3>
            <p className="text-fg-muted text-sm">
              Fêmea · American Staffordshire Terrier · nascida em 2021
            </p>
          </div>
        </div>

        <PedigreeTree pedigree={FIXTURE_PEDIGREE} variant="preview" />

        <p className="text-fg-faint text-xs">Prévia dos pais — o perfil completo vai até cinco gerações.</p>

        <span className="text-link text-sm font-medium">Ver perfil completo →</span>
      </div>
    </Link>
  );
}
