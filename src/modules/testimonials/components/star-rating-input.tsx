"use client";

import { RATING_MAX } from "../constraints";

/**
 * 5 rádios nativos, visualmente estrelas — o `<form>` continua sendo a fonte
 * de verdade, sem estado de React guardando a nota escolhida.
 *
 * TRUQUE DE CSS, primeira vez no projeto: os rádios nascem em ORDEM INVERSA
 * no DOM (5, 4, 3, 2, 1) e `flex-row-reverse` devolve a ordem visual certa
 * (1..5). Isso é o que permite `peer-checked:text-data` preencher a estrela
 * escolhida E TODAS AS ANTERIORES com um seletor só: `:checked ~
 * .peer-checked` do CSS casa com QUALQUER `.peer-checked` que vem DEPOIS de
 * QUALQUER `.peer` marcado no DOM — como o DOM está invertido, "depois no
 * DOM" é "antes na tela".
 *
 * Link "sem nota" existe porque, sem ele, quem clicou uma estrela não tem
 * como voltar a "nenhuma nota" — a coluna é opcional, o controle precisa
 * conseguir voltar a vazio.
 */
export function StarRatingInput({
  name = "rating",
  defaultValue,
}: {
  name?: string;
  defaultValue?: number | null;
}) {
  const stars = Array.from({ length: RATING_MAX }, (_, i) => RATING_MAX - i);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-row-reverse items-center justify-end gap-0.5">
        {stars.map((n) => (
          <label key={n} className="cursor-pointer p-0.5">
            <span className="sr-only">
              {n} de {RATING_MAX} estrelas
            </span>
            <input
              type="radio"
              name={name}
              value={n}
              defaultChecked={defaultValue === n}
              className="peer sr-only"
            />
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="text-border-strong peer-checked:text-data size-6 fill-current transition-colors"
            >
              <path d="M10 1.2l2.75 5.57 6.15.9-4.45 4.34 1.05 6.12L10 15.05l-5.5 2.9 1.05-6.12L1.1 7.67l6.15-.9L10 1.2z" />
            </svg>
          </label>
        ))}
      </div>
      <label className="text-fg-faint hover:text-fg cursor-pointer text-xs transition-colors">
        <input
          type="radio"
          name={name}
          value=""
          defaultChecked={!defaultValue}
          className="sr-only"
        />
        sem nota
      </label>
    </div>
  );
}
