"use client";

import { Fragment } from "react";

import { RATING_MAX } from "../constraints";

/**
 * 5 rádios nativos, visualmente estrelas — o `<form>` continua sendo a fonte
 * de verdade, sem estado de React guardando a nota escolhida.
 *
 * TRUQUE DE CSS: os rádios nascem em ORDEM INVERSA no DOM (5, 4, 3, 2, 1) e
 * `flex-row-reverse` devolve a ordem visual certa (1..5). `:checked ~
 * .peer-checked` casa com QUALQUER `.peer-checked` que vem DEPOIS de
 * QUALQUER `.peer` marcado no DOM — como o DOM está invertido, "depois no
 * DOM" é "antes na tela", e por isso marcar a estrela N pinta N e todas as
 * anteriores, não só ela.
 *
 * O TRUQUE SÓ FUNCIONA COM `input` E `label` COMO IRMÃOS DIRETOS — é a razão
 * de existir `htmlFor`/`id` aqui em vez do padrão mais comum de envolver o
 * `<input>` dentro do `<label>`. `~` é o combinador de IRMÃO GERAL: só
 * enxerga elementos que compartilham o MESMO pai. Envolver cada input no seu
 * próprio label (como uma primeira versão deste componente fazia) prende
 * cada par input+estrela dentro de uma caixa separada — os pares deixam de
 * ser irmãos entre si, e `~` para de atravessar de um label para o outro.
 * Resultado medido: só a estrela clicada acendia, nunca as anteriores.
 *
 * `idPrefix` existe porque este componente pode aparecer MAIS DE UMA VEZ na
 * mesma tela ao mesmo tempo (o formulário de adicionar e a edição inline de
 * uma linha existente, lado a lado) — sem prefixo, os `id` colidiriam e o
 * `htmlFor` de uma instância passaria a mirar o rádio da outra.
 *
 * Link "sem nota" existe porque, sem ele, quem clicou uma estrela não tem
 * como voltar a "nenhuma nota" — a coluna é opcional, o controle precisa
 * conseguir voltar a vazio.
 */
export function StarRatingInput({
  idPrefix,
  name = "rating",
  defaultValue,
}: {
  idPrefix: string;
  name?: string;
  defaultValue?: number | null;
}) {
  const stars = Array.from({ length: RATING_MAX }, (_, i) => RATING_MAX - i);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-row-reverse items-center justify-end gap-0.5">
        {stars.map((n) => {
          const id = `${idPrefix}-nota-${n}`;
          return (
            <Fragment key={n}>
              <input
                type="radio"
                id={id}
                name={name}
                value={n}
                defaultChecked={defaultValue === n}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className="peer-checked:text-data text-border-strong cursor-pointer p-0.5 transition-colors"
              >
                <span className="sr-only">
                  {n} de {RATING_MAX} estrelas
                </span>
                <svg viewBox="0 0 20 20" aria-hidden="true" className="size-6 fill-current">
                  <path d="M10 1.2l2.75 5.57 6.15.9-4.45 4.34 1.05 6.12L10 15.05l-5.5 2.9 1.05-6.12L1.1 7.67l6.15-.9L10 1.2z" />
                </svg>
              </label>
            </Fragment>
          );
        })}
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
