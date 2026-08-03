import Link from "next/link";

import {
  describeNode,
  generationOf,
  parentPositions,
  pathLabel,
  relationOf,
  type Pedigree,
  type PedigreeNode,
} from "../tree";

/**
 * ============================================================================
 * Árvore de pedigree — aninhada, sem uma linha de JavaScript de cliente.
 * ============================================================================
 *
 * POR QUE ANINHADA E NÃO EM COLUNAS: a tabela clássica de pedigree tem 32
 * colunas na quinta geração. Em 380px, isso é rolagem horizontal — o gesto que
 * as pessoas menos esperam numa página que abriram escaneando um QR, e o que
 * mais esconde conteúdo. A árvore aninhada usa a única dimensão que sobra no
 * celular, que é a vertical, e recolhe o que não cabe.
 *
 * POR QUE `<details>` NATIVO: abre e fecha antes de qualquer hidratação,
 * funciona com JavaScript desligado, já vem com semântica de disclosure para
 * leitor de tela, é operável por teclado sem `tabindex` e o triângulo gira
 * sozinho. Um acordeão em React seria mais código para entregar menos.
 *
 * ABERTURA PADRÃO: gerações 1 e 2 abertas — pais e avós são o que quase todo
 * mundo veio ver. Da terceira em diante, recolhidas: abrir tudo daria uma
 * página de 62 linhas onde ninguém acha nada.
 *
 * O nome do ancestral aparece SEMPRE, inclusive de registro não publicado de
 * outro criador. É decisão de produto registrada em supabase/README.md; o resto
 * dos campos o banco não devolve.
 */

export function PedigreeTree({ pedigree }: { pedigree: Pedigree | null }) {
  if (!pedigree?.subject) return null;

  const [sirePos, damPos] = parentPositions(1);
  const sire = pedigree.byPosition.get(sirePos);
  const dam = pedigree.byPosition.get(damPos);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">Pedigree</h2>
        <p className="text-fg-faint text-xs">
          {pedigree.knownAncestors === 0
            ? "Nenhum ancestral cadastrado"
            : `${pedigree.knownAncestors} de ${pedigree.possibleAncestors} ancestrais · ${pedigree.depth} ${pedigree.depth === 1 ? "geração" : "gerações"}`}
        </p>
      </div>

      {pedigree.knownAncestors === 0 ? (
        <p className="border-border bg-surface rounded-card text-fg-faint border px-5 py-4 text-sm">
          Pai e mãe ainda não foram informados.
        </p>
      ) : (
        <div className="border-border bg-surface rounded-card border p-2 sm:p-3">
          <ol className="flex flex-col gap-1">
            <Branch node={sire} pos={sirePos} pedigree={pedigree} />
            <Branch node={dam} pos={damPos} pedigree={pedigree} />
          </ol>
        </div>
      )}

      {pedigree.repeated.size > 0 ? (
        <p className="text-fg-faint text-xs">
          O selo <span className="text-data font-mono">×N</span> marca o ancestral que ocupa N
          posições desta árvore (linebreeding). Cada ocorrência aparece no seu próprio caminho.
        </p>
      ) : null}
    </section>
  );
}

/** Um galho: o nó, e — se houver ancestral conhecido acima — os pais dele. */
function Branch({
  node,
  pos,
  pedigree,
}: {
  node: PedigreeNode | undefined;
  pos: number;
  pedigree: Pedigree;
}) {
  if (!node) return <UnknownBranch pos={pos} />;

  const [sirePos, damPos] = parentPositions(pos);
  const sire = pedigree.byPosition.get(sirePos);
  const dam = pedigree.byPosition.get(damPos);

  // Nenhum dos dois conhecido: folha. Um `<details>` vazio é um triângulo que
  // promete algo e não entrega.
  if (!sire && !dam) {
    return (
      <li className="pl-[1.35rem]">
        <NodeRow node={node} pedigree={pedigree} />
      </li>
    );
  }

  return (
    <li>
      <details open={node.generation <= 2}>
        <summary className="rounded-control marker:text-fg-faint focus-visible:outline-ring hover:bg-surface-hover cursor-pointer py-1.5 pr-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2">
          <NodeRow node={node} pedigree={pedigree} />
        </summary>

        <ol className="border-border mt-1 ml-[0.6rem] flex flex-col gap-1 border-l pl-2 sm:pl-3">
          <Branch node={sire} pos={sirePos} pedigree={pedigree} />
          <Branch node={dam} pos={damPos} pedigree={pedigree} />
        </ol>
      </details>
    </li>
  );
}

/**
 * Posição sem ancestral cadastrado.
 *
 * Só aparece quando o irmão de posição existe — a lacuna assimétrica é
 * informação ("sabe-se a mãe, não o pai"). Quando NENHUM dos dois é conhecido, o
 * nó abaixo vira folha e nada disto é desenhado: 32 linhas de "não informado" na
 * quinta geração seriam ruído, não dado.
 */
function UnknownBranch({ pos }: { pos: number }) {
  return (
    <li className="pl-[1.35rem]">
      <div className="flex flex-wrap items-baseline gap-x-2 py-1.5">
        <RelationChip pos={pos} />
        <span className="text-fg-faint text-sm">Não informado</span>
      </div>
    </li>
  );
}

/** Conteúdo de um nó: relação, nome e apoio. Vive dentro do summary ou da folha. */
function NodeRow({ node, pedigree }: { node: PedigreeNode; pedigree: Pedigree }) {
  const support = describeNode(node);
  const occurrences = pedigree.repeated.get(node.dog_id)?.length ?? 1;

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 align-middle">
      <RelationChip pos={node.pos} />

      {node.is_public && node.public_id ? (
        <Link
          href={`/d/${node.public_id}`}
          className="text-link hover:text-link-hover rounded-control text-sm font-medium underline underline-offset-4 transition-colors"
        >
          {node.name}
        </Link>
      ) : (
        // Sem `public_id` não há link possível — o banco não devolveu, de
        // propósito. Mostrar o nome sem link é mais honesto que um link morto.
        <span className="text-fg-muted text-sm font-medium" title="Registro ainda não publicado">
          {node.name}
        </span>
      )}

      {node.repeated ? <RepeatChip count={occurrences} /> : null}

      {support ? <span className="text-fg-faint text-xs">{support}</span> : null}
    </span>
  );
}

/**
 * A relação, derivada da posição.
 *
 * Até a segunda geração, "Pai" e "Mãe" bastam: o aninhamento visual ainda é
 * curto e óbvio. Da terceira em diante o caminho completo entra por extenso —
 * "mãe da mãe do pai" —, porque a essa altura contar níveis de recuo já não é
 * confiável, e para quem usa leitor de tela o recuo simplesmente não existe.
 */
function RelationChip({ pos }: { pos: number }) {
  const path = pathLabel(pos);
  const curto = generationOf(pos) <= 2;

  return (
    <span
      // Maiúscula com tracking só no rótulo curto. "MÃE DA MÃE DO PAI DO PAI DO
      // PAI" ocuparia mais largura que o nome do cão em 380px, e o caminho é
      // apoio, não título.
      className={
        curto
          ? "text-fg-faint font-mono text-[0.65rem] tracking-wider uppercase"
          : "text-fg-faint font-mono text-[0.65rem]"
      }
      title={curto && path ? `Caminho: ${path}` : undefined}
    >
      {curto ? relationOf(pos) : path}
    </span>
  );
}

function RepeatChip({ count }: { count: number }) {
  return (
    <span
      className="text-data bg-data-subtle rounded-control px-1.5 py-0.5 font-mono text-[0.65rem]"
      title={`Este ancestral ocupa ${count} posições desta árvore (linebreeding)`}
    >
      ×{count}
    </span>
  );
}
