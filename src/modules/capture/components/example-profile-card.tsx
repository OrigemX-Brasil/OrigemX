import { PedigreeTree } from "@/modules/pedigree/components/pedigree-tree";
import { buildPedigree, type PedigreeRow } from "@/modules/pedigree/tree";
import { PublicImage } from "@/modules/public/components/public-image";

/**
 * Prévia de EXEMPLO do perfil público — a página de captura promete "pedigree
 * de cinco gerações" e "endereço que não muda" em texto; isto mostra.
 *
 * `PedigreeTree` é o componente REAL do perfil (sem fetch, sem client JS —
 * ver o próprio arquivo), só alimentado com um fixture em vez de dado do
 * banco. Fica sempre em sincronia com o visual verdadeiro do produto, ao
 * contrário de um screenshot que envelhece na primeira mudança de layout.
 *
 * `is_public: false` / `public_id: null` em toda linha: sem isso o nome do
 * ancestral viraria link para `/d/<id-de-mentira>`, que daria 404 — um perfil
 * de exemplo não pode fingir profundidade que não tem.
 *
 * Duas gerações (pais + avós paternos), não cinco: é PRÉVIA, cabe num card,
 * e o texto abaixo da árvore diz isso — não deixa a promessa maior sem dizer
 * que aqui é só um recorte.
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
    breed: "Golden Retriever",
    born_on: "2022-03-15",
    kennel_name: null,
  },
  {
    pos: 2,
    generation: 1,
    dog_id: "exemplo-apollo",
    name: "Apollo",
    is_public: false,
    public_id: null,
    sex: "male",
    breed: "Golden Retriever",
    born_on: "2019-06-01",
    kennel_name: "Canil Estrela",
  },
  {
    pos: 3,
    generation: 1,
    dog_id: "exemplo-bella",
    name: "Bella",
    is_public: false,
    public_id: null,
    sex: "female",
    breed: "Golden Retriever",
    born_on: "2018-11-20",
    kennel_name: "Canil Aurora",
  },
  {
    pos: 4,
    generation: 2,
    dog_id: "exemplo-zeus",
    name: "Zeus",
    is_public: false,
    public_id: null,
    sex: "male",
    breed: "Golden Retriever",
    born_on: "2016-02-10",
    kennel_name: "Canil Nobre",
  },
  {
    pos: 5,
    generation: 2,
    dog_id: "exemplo-luna",
    name: "Luna",
    is_public: false,
    public_id: null,
    sex: "female",
    breed: "Golden Retriever",
    born_on: "2016-05-18",
    kennel_name: "Canil Nobre",
  },
];

const FIXTURE_PEDIGREE = buildPedigree(FIXTURE_ROWS);

export function ExampleProfileCard() {
  return (
    <div className="border-border bg-surface rounded-card flex flex-col overflow-hidden border">
      {/* Barra de "navegador", decorativa — deixa claro que isto é a TELA de um
          endereço, não um cartão solto. */}
      <div className="border-border bg-surface-raised flex items-center gap-3 border-b px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="bg-fg-faint/40 size-2 rounded-full" />
          <span className="bg-fg-faint/40 size-2 rounded-full" />
          <span className="bg-fg-faint/40 size-2 rounded-full" />
        </span>
        <span className="bg-surface text-fg-faint rounded-control flex-1 truncate px-2 py-1 font-mono text-[0.65rem]">
          origemxbr.com/d/exemplo01ab
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
            src={null}
            alt="Thor"
            fallbackText="Thor"
            width={96}
            height={96}
            className="rounded-card size-16 shrink-0"
          />
          <div className="flex flex-col gap-0.5">
            <h3 className="font-display text-lg font-semibold tracking-tight">Thor</h3>
            <p className="text-fg-muted text-sm">Macho · Golden Retriever · nascido em 2022</p>
          </div>
        </div>

        <PedigreeTree pedigree={FIXTURE_PEDIGREE} />

        <p className="text-fg-faint text-xs">
          Prévia de duas gerações — o perfil completo vai até cinco.
        </p>
      </div>
    </div>
  );
}
