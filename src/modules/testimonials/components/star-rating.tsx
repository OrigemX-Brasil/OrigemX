import { RATING_MAX } from "../constraints";

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={filled ? "text-data size-4 fill-current" : "text-border-strong size-4 fill-current"}
    >
      <path d="M10 1.2l2.75 5.57 6.15.9-4.45 4.34 1.05 6.12L10 15.05l-5.5 2.9 1.05-6.12L1.1 7.67l6.15-.9L10 1.2z" />
    </svg>
  );
}

/**
 * Estrelas, só leitura — painel e página pública.
 *
 * `null`/`0` não renderiza nada: ausência de nota não é nota zero, e cinco
 * estrelas vazias mentiria "avaliado com zero", que não é o que aconteceu.
 *
 * Preenchida vs. vazia é diferença de FORMA (`fill-current` sempre, só a cor
 * muda), não só de cor — a mesma regra de "cor nunca sozinha" que
 * `puppy-status-chip.tsx` já segue, aqui reforçada pelo `aria-label` com o
 * número por extenso para quem usa leitor de tela.
 */
export function StarRating({ value }: { value: number | null }) {
  if (!value) return null;

  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`Nota ${value} de ${RATING_MAX}`}
    >
      {Array.from({ length: RATING_MAX }, (_, i) => (
        <StarIcon key={i} filled={i < value} />
      ))}
    </div>
  );
}
