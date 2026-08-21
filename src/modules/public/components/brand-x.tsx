/**
 * ============================================================================
 * O X da marca, como elemento de conteúdo.
 * ============================================================================
 *
 * Em pedigree, "×" significa "cruzado com". A marca do produto também é um X.
 * Os dois glifos são o mesmo — então, entre os progenitores de uma ninhada, o
 * símbolo do cruzamento É a marca.
 *
 * MESMA GEOMETRIA DO FAVICON (`src/app/icon.svg`): o mesmo `path`, a mesma
 * espessura proporcional, o mesmo `stroke-linecap`. Duas diferenças, as duas
 * deliberadas:
 *
 *   1. SEM o `<rect>` de fundo. Aquele quadrado arredondado é o LADRILHO do
 *      ícone de aba, não a marca — aqui o X vive sobre a superfície da página.
 *   2. As cores vêm dos TOKENS, não literais. O favicon hardcoda `#0066FF`/
 *      `#7B3DFF` porque um SVG servido como arquivo estático não enxerga as
 *      CSS variables da aplicação; um componente React enxerga, então aqui não
 *      há motivo para manter uma segunda cópia dos valores.
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
