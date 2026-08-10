/**
 * ============================================================================
 * Geometria da árvore de pedigree em colunas — fonte única.
 * ============================================================================
 *
 * O cabeçalho de cada geração e o card de cada nó precisam concordar sobre
 * onde a coluna começa e quanto ela ocupa. Um desalinhamento aqui não é erro
 * de tipo — é um rótulo de geração pairando sobre a coluna errada, visível só
 * olhando a tela. Por isso a largura de card, a largura do cotovelo e a
 * largura total de cada "faixa" (cotovelo + card) vêm de UM lugar, e tanto
 * `pedigree-card.tsx` quanto o cabeçalho em `pedigree-tree.tsx` leem daqui —
 * nunca escrevem o número de novo.
 *
 * Larguras em PIXELS, aplicadas via `style={{ width }}`, não classe Tailwind:
 * o scanner do Tailwind não enxerga `w-[${n}px]` interpolado em runtime.
 * `layout.test.ts` prova que `band === card + ELBOW` e que a soma das faixas
 * bate com `treeWidth` — é o teste que pega a régua desalinhada antes de
 * alguém precisar olhar a tela para notar.
 */

/** Fotos só até aqui (sujeito + 3 gerações = no máximo 14 miniaturas). Da
 * geração seguinte em diante o card é só texto — ver o comentário completo em
 * `pedigree-tree.tsx` sobre o custo em 4G de feira. */
export const MAX_PHOTO_GENERATION = 3;

/** Tronco neutro (8px) + braço colorido (16px) + respiro (4px). */
export const ELBOW = 28;
/** Mesma ideia, escala menor — usado só no card de exemplo (`variant="preview"`). */
export const PREVIEW_ELBOW = 20;

export type GenerationSpec = {
  /** Largura do CARD desta geração, em px — sem o cotovelo. */
  card: number;
  /** Passo horizontal completo da coluna: cotovelo + card (geração 0 não tem cotovelo). */
  band: number;
  /** Rótulo da faixa de cabeçalho. Vazio na variante `preview`, que não desenha cabeçalho. */
  label: string;
  /** Esta geração mostra foto? Ver `MAX_PHOTO_GENERATION`. */
  photo: boolean;
};

function buildSpecs(
  cardWidths: readonly number[],
  elbow: number,
  labels: readonly string[],
): readonly GenerationSpec[] {
  return cardWidths.map((card, g) => ({
    card,
    band: g === 0 ? card : card + elbow,
    label: labels[g] ?? "",
    photo: g <= MAX_PHOTO_GENERATION,
  }));
}

/**
 * Árvore completa (`variant="full"`, perfil público do cão).
 *
 * Os cards encolhem a cada geração — mesma ideia da referência do cliente
 * (`assets/fotos/home-exemplo.jpg`): a 4ª/5ª geração é texto compacto, não
 * card com foto, porque ninguém lê 32 miniaturas de bisavô de bisavô.
 */
export const GENERATIONS: readonly GenerationSpec[] = buildSpecs(
  [168, 168, 152, 140, 116, 116],
  ELBOW,
  [
    "ESTE CÃO",
    "1ª GERAÇÃO · PAIS",
    "2ª GERAÇÃO · AVÓS",
    "3ª GERAÇÃO · BISAVÓS",
    "4ª GERAÇÃO · TRISAVÓS",
    "5ª GERAÇÃO · TETRAVÓS",
  ],
);

/**
 * Prévia (`variant="preview"`, card de exemplo da home). Só sujeito + pais —
 * o fixture de `example-profile-card.tsx` não tem avós. Sem foto: aquela
 * página precisa continuar 100% estática, e uma foto de ancestral exigiria
 * uma consulta que a página de captura não pode fazer.
 */
export const PREVIEW_GENERATIONS: readonly GenerationSpec[] = buildSpecs(
  [132, 132],
  PREVIEW_ELBOW,
  ["", ""],
);

/** Largura renderizada da árvore, da geração 0 até `depth` (inclusive). */
export function treeWidth(
  depth: number,
  specs: readonly GenerationSpec[] = GENERATIONS,
): number {
  let total = 0;
  for (let g = 0; g <= depth && g < specs.length; g += 1) total += specs[g]!.band;
  return total;
}
