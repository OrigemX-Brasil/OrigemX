import Link from "next/link";

import { EXAMPLE_DOG_AVATAR_URL, EXAMPLE_DOG_PATH } from "@/modules/capture/example-dog";
import { PedigreeTree } from "@/modules/pedigree/components/pedigree-tree";
import { buildPedigree, type PedigreeRow } from "@/modules/pedigree/tree";
import { PublicImage } from "@/modules/public/components/public-image";

/**
 * Prévia do perfil público REAL do Thor (ver `example-dog.ts`) — a página de
 * captura promete "pedigree de várias gerações" e "endereço que não muda" em
 * texto; isto mostra, com o mesmo cão que o card abre ao clicar.
 *
 * `PedigreeTree` é o componente REAL do perfil (sem fetch, sem client JS —
 * ver o próprio arquivo). Os pais aqui são fixture — os MESMOS nomes/datas
 * das linhas reais no banco — só pra caber num card compacto sem ir buscar
 * dado em build/request time numa página que precisa continuar 100%
 * estática. `is_public: false` em toda linha: o nome do ancestral não vira
 * link aqui dentro (a árvore de verdade, na página real, é que decide isso).
 *
 * SÓ PAIS, sem avós: um nó com pai/mãe conhecidos vira `<details>` — um
 * elemento clicável de verdade — e o card inteiro já é um `<Link>` (ver
 * abaixo). `<details>` dentro de `<a>` navega E expande no mesmo clique, uma
 * briga de interação real, não teórica. Parar nos pais mantém todo nó como
 * folha (sem `<details>`), então não existe elemento clicável aninhado.
 */
const FIXTURE_ROWS: PedigreeRow[] = [
  {
    pos: 1,
    generation: 0,
    dog_id: "exemplo-thor",
    name: "Thor",
    is_public: false,
    public_id: null,
    sex: "male",
    breed: "Rottweiler",
    born_on: "2025-11-02",
    kennel_name: null,
  },
  {
    pos: 2,
    generation: 1,
    dog_id: "exemplo-rex",
    name: "Rex von Thalheim",
    is_public: false,
    public_id: null,
    sex: "male",
    breed: "Rottweiler",
    born_on: "2021-03-15",
    kennel_name: null,
  },
  {
    pos: 3,
    generation: 1,
    dog_id: "exemplo-bela",
    name: "Bela do Vale Negro",
    is_public: false,
    public_id: null,
    sex: "female",
    breed: "Rottweiler",
    born_on: "2021-07-22",
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
            alt="Thor"
            fallbackText="Thor"
            width={96}
            height={96}
            className="rounded-card size-16 shrink-0 object-cover"
          />
          <div className="flex flex-col gap-0.5">
            <h3 className="font-display text-lg font-semibold tracking-tight">Thor</h3>
            <p className="text-fg-muted text-sm">Macho · Rottweiler · nascido em 2025</p>
          </div>
        </div>

        <PedigreeTree pedigree={FIXTURE_PEDIGREE} />

        <p className="text-fg-faint text-xs">Prévia dos pais — o perfil completo vai até quatro gerações.</p>

        <span className="text-link text-sm font-medium">Ver perfil completo →</span>
      </div>
    </Link>
  );
}
