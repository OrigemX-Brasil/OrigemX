import type { Variants } from "framer-motion";

/**
 * Valores de movimento do painel de busca.
 *
 * Módulo separado por BUNDLE: só o painel importa daqui, então isto viaja no
 * chunk sob demanda junto com a framer-motion, nunca no carregamento das
 * páginas públicas.
 *
 * As curvas espelham `--ease-panel` em `tokens.css`. A duplicação é
 * inevitável — CSS quer `cubic-bezier(...)`, a framer-motion quer os quatro
 * números — mas os valores são os mesmos e estão anotados nos dois lados.
 */

/** expo-out: sai rápido e assenta devagar. É o que dá a sensação de peso. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** Entrada de saída: rápida e sem overshoot — fechar não pede personalidade. */
export const EASE_IN = [0.4, 0, 1, 1] as const;

/** Fecha rápido, mas NUNCA instantâneo — ver o comentário do `reduced`. */
const REDUCED_DURATION = 0.12;

export const overlayVariants = (reduced: boolean): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: reduced ? REDUCED_DURATION : 0.18, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    transition: { duration: reduced ? REDUCED_DURATION : 0.13, ease: EASE_IN },
  },
});

/**
 * Painel.
 *
 * `compact` (< sm) NÃO usa `scale`. O sheet do mobile é `inset-x-0`, colado
 * nas duas bordas da tela: `scale(.96)` numa largura de 390px descola ~8px de
 * cada lado e a página aparece pelo vão durante a animação inteira.
 *
 * REDUZIDO ANIMA `opacity` DE PROPÓSITO. Uma variant de saída que não muda
 * nenhuma propriedade pode resolver sem chamar `onExitComplete` — e é esse
 * callback que fecha o `<dialog>`. Sem ele, o modal fica aberto e trava a
 * página inteira. Movimento reduzido significa menos movimento, não nenhum.
 */
export const panelVariants = (reduced: boolean, compact: boolean): Variants => {
  if (reduced) {
    return {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { duration: REDUCED_DURATION, ease: EASE_OUT, staggerChildren: 0 },
      },
      exit: { opacity: 0, transition: { duration: REDUCED_DURATION, ease: EASE_IN } },
    };
  }

  return {
    hidden: { opacity: 0, y: compact ? -16 : -8, ...(compact ? {} : { scale: 0.96 }) },
    visible: {
      opacity: 1,
      y: 0,
      ...(compact ? {} : { scale: 1 }),
      transition: { duration: 0.22, ease: EASE_OUT, delayChildren: 0.04, staggerChildren: 0.03 },
    },
    exit: {
      opacity: 0,
      y: compact ? -10 : -6,
      ...(compact ? {} : { scale: 0.98 }),
      transition: { duration: 0.14, ease: EASE_IN },
    },
  };
};

/**
 * Item da lista de resultados.
 *
 * O atraso é calculado por índice em vez de `staggerChildren` do pai porque o
 * stagger só vale na PRIMEIRA lista de cada abertura — ver `staggeredRef` no
 * painel. Com debounce de 300ms os resultados trocam ~3x por segundo enquanto
 * se digita; re-escalonar 8 itens a cada troca é tremedeira, não polimento.
 *
 * O teto de 6 evita que o oitavo item entre 240ms depois do primeiro.
 */
export const resultVariants = (reduced: boolean, index: number, stagger: boolean): Variants => ({
  hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    ...(reduced ? {} : { y: 0 }),
    transition: {
      duration: reduced ? REDUCED_DURATION : 0.18,
      ease: EASE_OUT,
      delay: stagger && !reduced ? Math.min(index, 6) * 0.03 : 0,
    },
  },
});
