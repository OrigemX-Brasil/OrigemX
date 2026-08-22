/**
 * ============================================================================
 * O X da marca, como elemento de conteúdo.
 * ============================================================================
 *
 * Em pedigree, "×" significa "cruzado com". A marca do produto também é um X.
 * Os dois glifos são o mesmo — então, entre os progenitores de uma ninhada, o
 * símbolo do cruzamento É a marca.
 *
 * O favicon (`src/app/icon.png`) é hoje um ASSET raster à parte, com seu
 * próprio acabamento — não compartilha `path`/geometria com este componente.
 * Este SVG é a versão vetorial, simples, do mesmo conceito de X, para viver
 * sobre a superfície da página (sem o quadrado de fundo do ladrilho de aba) e
 * usando as cores dos TOKENS — um componente React enxerga CSS variables, e
 * não há motivo para depender de um arquivo de imagem para isto.
 *
 * `aria-hidden` por padrão: onde ele é usado hoje, quem usa leitor de tela já
 * ouve os dois cards ("Mãe · nome", "Pai · nome") e um "X" solto no meio não
 * acrescentaria nada. Quem precisar dele anunciado passa `title`.
 *
 * O `id` do gradiente é constante de propósito. Ele é renderizado uma vez por
 * página; se um dia houver dois numa mesma tela, `id` duplicado é HTML
 * inválido e o segundo herda a pintura do primeiro — que, sendo o mesmo
 * gradiente, é visualmente idêntico. Trocar por `useId()` custaria transformar
 * isto num Client Component, e não é troca que valha.
 */

const GRADIENT_ID = "origemx-brand-x";

export function BrandX({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-azul)" />
          <stop offset="100%" stopColor="var(--color-violeta)" />
        </linearGradient>
      </defs>
      <path
        d="M9 9 L23 23 M23 9 L9 23"
        stroke={`url(#${GRADIENT_ID})`}
        strokeWidth={4.5}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
