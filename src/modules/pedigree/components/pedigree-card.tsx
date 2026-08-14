import Link from "next/link";

import { PublicImage } from "@/modules/public/components/public-image";

import { generationOf, pathLabel, relationOf, shortSupport, type PedigreeNode } from "../tree";

/**
 * Os cards da árvore de pedigree. Um componente por variante de geração:
 * `AncestorCard` (com foto) e `CompactCard` (só texto, geração funda).
 *
 * A LARGURA VEM DE FORA (`width`, em px), nunca é calculada aqui: quem chama
 * sabe se está desenhando a árvore `full` (`GENERATIONS`, em `layout.ts`) ou
 * a `preview` do card de exemplo (`PREVIEW_GENERATIONS`, menor). SEM `width`
 * o card ocupa a largura toda — é assim que o acordeão do mobile
 * (`pedigree-generations.tsx`) usa os mesmos componentes sem geometria de
 * coluna nenhuma. Três apresentações, um componente de card só.
 */

/** Largura fixa (coluna) ou `w-full` (lista do mobile). */
function sizing(width?: number) {
  return width === undefined
    ? { style: undefined, className: "w-full" }
    : { style: { width }, className: "shrink-0" };
}

/**
 * Card com foto — sujeito e ancestral até a 3ª geração.
 *
 * UM SÓ `<Link>` por card, no nome, esticado com `after:absolute after:inset-0`
 * (o card inteiro fica clicável, mas só um elemento é interativo). É o que
 * mantém `getByRole("link", { name })` contando exatamente uma ocorrência por
 * posição — dois links no mesmo card dobraria a contagem que o teste de
 * linebreeding espera.
 */
export function AncestorCard({
  node,
  width,
  thumbUrl,
  repeatCount,
  linkable = true,
  showPath = false,
}: {
  node: PedigreeNode;
  /** Ausente = `w-full` (lista do mobile). Ver `sizing`. */
  width?: number;
  /** Ausente para o sujeito: a foto dele já vem de outra consulta (ver `thumbnailTargets`). */
  thumbUrl?: string;
  repeatCount?: number;
  /** `false` no sujeito (linkar a própria página não faz sentido) e em toda
   * a variante `preview`, que nunca emite `<Link>` — ver `pedigree-tree.tsx`. */
  linkable?: boolean;
  /** Ver `RelationChip`: no mobile o caminho precisa ser texto, não `sr-only`. */
  showPath?: boolean;
}) {
  const support = shortSupport(node);
  const canLink = linkable && node.is_public && Boolean(node.public_id);
  const box = sizing(width);

  return (
    <article
      style={box.style}
      className={`border-border bg-surface rounded-card relative flex flex-col gap-2 border p-2.5 ${box.className}`}
    >
      <div className="flex items-start gap-2">
        {/* `alt=""`: decorativa — o nome ao lado já identifica o cão. */}
        <PublicImage
          src={thumbUrl}
          alt=""
          fallbackText={node.name}
          width={40}
          height={40}
          sizes="40px"
          className="border-border rounded-control size-10 shrink-0 border object-cover"
        />
        <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
          <RelationChip pos={node.pos} showPath={showPath} />
          {canLink ? (
            <Link
              href={`/d/${node.public_id}`}
              prefetch={false}
              title={node.name}
              className="text-fg hover:text-link after:absolute after:inset-0 truncate text-sm font-medium transition-colors"
            >
              {node.name}
            </Link>
          ) : (
            <span
              className="text-fg-muted truncate text-sm font-medium"
              title={node.is_public ? node.name : "Registro ainda não publicado"}
            >
              {node.name}
            </span>
          )}
        </div>
      </div>

      {support || repeatCount || node.sex ? (
        <div className="flex items-center justify-between gap-1">
          <span className="text-fg-faint truncate text-xs">{support}</span>
          <span className="flex shrink-0 items-center gap-1">
            <SexGlyph sex={node.sex} />
            {repeatCount && repeatCount > 1 ? <RepeatChip count={repeatCount} /> : null}
          </span>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Card compacto — 4ª geração em diante. Sem foto, sem borda, sem fundo: 16 a
 * 32 retângulos de borda virariam ruído, e o cotovelo colorido já delimita
 * onde cada um se encaixa.
 */
export function CompactCard({
  node,
  width,
  repeatCount,
  linkable = true,
  showPath = false,
}: {
  node: PedigreeNode;
  /** Ausente = `w-full` (lista do mobile). Ver `sizing`. */
  width?: number;
  repeatCount?: number;
  linkable?: boolean;
  showPath?: boolean;
}) {
  const canLink = linkable && node.is_public && Boolean(node.public_id);
  const box = sizing(width);

  return (
    <article
      style={box.style}
      className={`relative flex flex-col gap-0.5 px-1.5 py-1 ${box.className}`}
    >
      <div className="flex items-center gap-1">
        <SexGlyph sex={node.sex} />
        <RelationChip pos={node.pos} showPath={showPath} />
        {canLink ? (
          <Link
            href={`/d/${node.public_id}`}
            prefetch={false}
            title={node.name}
            className="text-fg hover:text-link after:absolute after:inset-0 block truncate text-xs font-medium transition-colors"
          >
            {node.name}
          </Link>
        ) : (
          <span
            className="text-fg-muted block truncate text-xs font-medium"
            title={node.is_public ? node.name : "Registro ainda não publicado"}
          >
            {node.name}
          </span>
        )}
      </div>
      {repeatCount && repeatCount > 1 ? <RepeatChip count={repeatCount} /> : null}
    </article>
  );
}

/**
 * Posição sem ancestral cadastrado.
 *
 * Só é desenhado quando o IRMÃO de posição existe — a lacuna assimétrica é
 * informação ("sabe-se a mãe, não o pai"). Ver a regra completa no comentário
 * de `Subtree`, em `pedigree-tree.tsx`.
 */
export function UnknownSlot({
  pos,
  width,
  showPath = false,
  compact = false,
}: {
  pos: number;
  /** Ausente = `w-full` (lista do mobile). Ver `sizing`. */
  width?: number;
  showPath?: boolean;
  /**
   * Densidade do `CompactCard`, para a geração funda da árvore em colunas.
   *
   * Não é estética: numa grade uniforme a altura da LINHA é ditada pelo item
   * que ocupa uma linha só, e na 5ª geração esse item é o card compacto (~24px).
   * Uma lacuna com o `p-2.5` do padrão mede ~38px e estica as 32 linhas de uma
   * vez — a árvore inteira ganhava um terço de altura por causa de um único
   * "Não informado". Quem liga é `pedigree-tree.tsx`, pela MESMA regra que
   * decide card com ou sem foto (`GenerationSpec.photo`).
   */
  compact?: boolean;
}) {
  const box = sizing(width);

  return (
    <div
      style={box.style}
      className={`border-border/60 text-fg-faint rounded-card flex items-center gap-2 border border-dashed text-xs ${
        compact ? "px-1.5 py-0.5" : "p-2.5"
      } ${showPath ? "" : "justify-center text-center"} ${box.className}`}
    >
      {showPath ? (
        <span className="font-mono text-[0.6rem]">{pathLabel(pos)}</span>
      ) : (
        <span className="sr-only">{pathLabel(pos)}: </span>
      )}
      Não informado
    </div>
  );
}

/**
 * A relação, derivada da posição — não guardada.
 *
 * DUAS APRESENTAÇÕES, e a diferença não é estética:
 *
 * `showPath` (lista do mobile): o caminho por extenso, SEMPRE visível. Numa
 * lista de uma geração só, quatro cards dizendo "PAI"/"MÃE" seriam
 * indistinguíveis entre si — quem diz qual é qual é "pai do pai" contra "pai
 * da mãe". Na coluna não existe esse problema porque a posição na árvore já
 * responde isso visualmente.
 *
 * Sem `showPath` (colunas do desktop): "PAI"/"MÃE" até a 2ª geração, onde
 * cabem e bastam. Da 3ª em diante o card não tem largura para "MÃE DA MÃE DO
 * PAI" sem empurrar o nome pra fora, então o caminho vira `sr-only` — para
 * quem usa leitor de tela, onde espaço não é o limite e o cotovelo colorido
 * não existe.
 */
function RelationChip({ pos, showPath = false }: { pos: number; showPath?: boolean }) {
  if (pos <= 1) return null;

  if (showPath) {
    return <span className="text-fg-faint font-mono text-[0.6rem]">{pathLabel(pos)}</span>;
  }

  if (generationOf(pos) <= 2) {
    return (
      <span className="text-fg-faint font-mono text-[0.6rem] tracking-wider uppercase">
        {relationOf(pos)}
      </span>
    );
  }

  return <span className="sr-only">{pathLabel(pos)}</span>;
}

function RepeatChip({ count }: { count: number }) {
  return (
    <span
      className="text-data bg-data-subtle rounded-control px-1 py-0.5 font-mono text-[0.6rem]"
      title={`Este ancestral ocupa ${count} posições desta árvore (linebreeding)`}
    >
      ×{count}
    </span>
  );
}

/** `sex` vem nulo quando o banco mascara o registro restrito — some, honesto. */
function SexGlyph({ sex }: { sex: string | null }) {
  if (sex !== "male" && sex !== "female") return null;

  return (
    <span className="text-fg-faint text-[0.65rem]">
      <span aria-hidden="true">{sex === "male" ? "♂" : "♀"}</span>
      <span className="sr-only">{sex === "male" ? "Macho" : "Fêmea"}</span>
    </span>
  );
}
