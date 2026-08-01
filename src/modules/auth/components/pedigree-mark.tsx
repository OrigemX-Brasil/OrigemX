/**
 * A marca do OrigemX enquanto a identidade visual do cliente não chega.
 *
 * É uma chave de pedigree: um traço que entra e bifurca em dois, de novo e de
 * novo. A forma não é ornamento — ela diz a regra do domínio, que todo cão tem
 * exatamente um pai e uma mãe, e que a árvore se lê por caminho.
 *
 * Desenhada só com `currentColor`, então herda o token de quem a usa e
 * sobrevive à troca de paleta sem edição.
 */
export function PedigreeMark({
  generations = 2,
  className,
}: {
  generations?: 1 | 2 | 3;
  className?: string;
}) {
  const width = 24 + generations * 28;
  const height = 2 ** generations * 24;

  const branches: React.ReactElement[] = [];

  // Cada geração dobra o número de ramos. Percorre em coordenadas relativas
  // para o desenho continuar correto em qualquer profundidade.
  for (let gen = 0; gen < generations; gen += 1) {
    const count = 2 ** gen;
    const span = height / count;
    const x = 12 + gen * 28;

    for (let i = 0; i < count; i += 1) {
      const midY = span * i + span / 2;
      const topY = midY - span / 4;
      const bottomY = midY + span / 4;

      branches.push(
        <path
          key={`${gen}-${i}`}
          d={`M${x} ${midY} h14 M${x + 14} ${topY} V${bottomY} M${x + 14} ${topY} h14 M${x + 14} ${bottomY} h14`}
        />,
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="square"
      aria-hidden="true"
    >
      {branches}
    </svg>
  );
}
