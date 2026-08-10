import { GENERATIONS, MAX_PHOTO_GENERATION } from "../layout";
import { parentPositions, type Pedigree, type PedigreeNode } from "../tree";
import { AncestorCard, CompactCard, UnknownSlot } from "./pedigree-card";

/**
 * ============================================================================
 * Pedigree no MOBILE — uma geração por vez, cards empilhados.
 * ============================================================================
 *
 * A árvore em colunas (`pedigree-tree.tsx`) é o desenho certo no desktop e o
 * errado em 360px: para alinhar o colchete, cada par de pais é distribuído em
 * duas trilhas de altura igual, e numa tela estreita isso vira card solto no
 * meio de um vão vertical enorme, com rolagem lateral sem referência.
 *
 * Aqui a leitura é outra: NÃO é a árvore inteira encolhida, é uma lista por
 * geração. Cada `<details>` é uma geração, os cards ocupam a largura toda e
 * ficam colados. Zero JavaScript — `<details>` nativo abre e fecha antes de
 * qualquer hidratação, é operável por teclado sem `tabindex` e já vem com
 * semântica de disclosure para leitor de tela.
 *
 * SEM o atributo `name` (acordeão exclusivo), de propósito: ele fecharia a 2ª
 * geração por padrão, e o padrão aqui é gerações 1 e 2 ABERTAS — pais e avós
 * são o que quase todo mundo veio ver. É a mesma regra `generation <= 2` que
 * o componente antigo já usava.
 *
 * O CAMINHO POR EXTENSO É OBRIGATÓRIO AQUI (`showPath`): numa lista de uma
 * geração só, quatro cards dizendo "PAI"/"MÃE" não se distinguem. Na coluna,
 * a posição na árvore responde isso sozinha; na lista, quem responde é o
 * texto "pai do pai" contra "pai da mãe".
 *
 * A COR DA LINHA VIRA BORDA ESQUERDA do item, com o mesmo significado do
 * cotovelo do desktop (posição par = pai = azul; ímpar = mãe = violeta), então
 * a legenda do rodapé continua valendo nos dois layouts. Como no desktop, a
 * cor não carrega nada sozinha: o caminho por extenso está escrito no card.
 */
export function PedigreeGenerations({
  pedigree,
  thumbs,
}: {
  pedigree: Pedigree;
  thumbs?: ReadonlyMap<string, string>;
}) {
  return (
    <div className="border-border bg-surface rounded-card divide-border divide-y overflow-hidden border">
      {pedigree.generations.slice(1).map((nodes, index) => {
        const generation = index + 1;
        const slots = slotsOf(pedigree, generation);

        return (
          <details key={generation} open={generation <= 2} className="group">
            <summary className="hover:bg-surface-hover focus-visible:outline-ring marker:text-fg-faint flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors focus-visible:-outline-offset-2 focus-visible:outline-2">
              <span className="text-fg-faint font-mono text-[0.625rem] tracking-[0.15em] uppercase">
                {GENERATIONS[generation]?.label}
              </span>
              <span className="text-fg-faint shrink-0 font-mono text-[0.625rem] tabular-nums">
                {nodes.length}/{2 ** generation}
              </span>
            </summary>

            <ul className="flex flex-col gap-2 px-3 pb-3">
              {slots.map((slot) => (
                <li
                  key={slot.pos}
                  // Par = pai = azul; ímpar = mãe = violeta. Mesma semântica
                  // do cotovelo do desktop, ver `pedigree-tree.tsx`.
                  className={`rounded-card border-l-[3px] pl-2 ${
                    slot.pos % 2 === 0 ? "border-accent" : "border-secondary"
                  }`}
                >
                  {slot.node ? (
                    generation <= MAX_PHOTO_GENERATION ? (
                      <AncestorCard
                        node={slot.node}
                        thumbUrl={thumbs?.get(slot.node.dog_id)}
                        repeatCount={pedigree.repeated.get(slot.node.dog_id)?.length}
                        showPath
                      />
                    ) : (
                      <CompactCard
                        node={slot.node}
                        repeatCount={pedigree.repeated.get(slot.node.dog_id)?.length}
                        showPath
                      />
                    )
                  ) : (
                    <UnknownSlot pos={slot.pos} showPath />
                  )}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

/**
 * As posições que essa geração deve desenhar, em ordem.
 *
 * MESMA REGRA DA ÁRVORE: uma lacuna só vira "Não informado" quando o IRMÃO de
 * posição existe — saber a mãe e não o pai é informação. Quando NENHUM dos
 * dois é conhecido, o filho é folha e nada é desenhado; sem isso, a 5ª geração
 * de uma árvore rasa viraria 32 cartões de "Não informado", que é ruído, não
 * dado.
 */
function slotsOf(
  pedigree: Pedigree,
  generation: number,
): { pos: number; node: PedigreeNode | undefined }[] {
  const slots: { pos: number; node: PedigreeNode | undefined }[] = [];

  // Os pais de cada nó conhecido da geração anterior — é o que garante que a
  // lacuna só apareça onde de fato houve um cão de quem procurar os pais.
  for (const parent of pedigree.generations[generation - 1] ?? []) {
    const [sirePos, damPos] = parentPositions(parent.pos);
    const sire = pedigree.byPosition.get(sirePos);
    const dam = pedigree.byPosition.get(damPos);
    if (!sire && !dam) continue;

    slots.push({ pos: sirePos, node: sire });
    slots.push({ pos: damPos, node: dam });
  }

  return slots;
}
