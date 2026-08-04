/**
 * ============================================================================
 * Corta-circuito de volume — puro.
 * ============================================================================
 *
 * O PROBLEMA QUE ISTO RESOLVE não é incômodo, é perda de sinal.
 *
 * A conta do Resend tem cota diária. Uma feira que converta 150 cadastros gera
 * ~150 avisos de conta e ~120 de canil em poucas horas. A cota estoura no meio
 * da tarde e, a partir dali, TODO envio falha — inclusive o evento importante
 * da manhã seguinte, que a equipe nunca fica sabendo.
 *
 * Ou seja: sem teto, o pico não só faz barulho, ele derruba a notificação para
 * depois do pico. A troca aqui é deliberada — perder o detalhe de cada cadastro
 * durante o pico para não perder tudo depois dele.
 *
 * SEM ESTADO NOVO. A contagem sai de `created_at`, coluna que já existe. Nada
 * de tabela de eventos, fila ou cron — que além de trabalho seriam escopo que o
 * contrato não pediu.
 */

/** Janela de contagem. Uma hora casa com a cota diária do provedor. */
export const JANELA_MINUTOS = 60;

/** Teto padrão. `NOTIFY_MAX_POR_HORA` sobrescreve. */
export const TETO_PADRAO = 20;

export function tetoConfigurado(
  bruto: string | undefined = process.env.NOTIFY_MAX_POR_HORA,
): number {
  const n = Number(bruto);
  // Valor ausente, lixo ou não-positivo cai no padrão. Zero desligaria o aviso
  // por completo sem ninguém perceber, e isso precisa ser explícito, não um
  // efeito colateral de variável mal preenchida.
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : TETO_PADRAO;
}

export type Decisao =
  /** Volume normal: manda o aviso individual. */
  | { acao: "enviar" }
  /** Acabou de estourar: manda UM aviso de volume alto no lugar. */
  | { acao: "avisar-volume"; quantidade: number }
  /** Já estourou e o aviso de volume já saiu: silêncio até a janela virar. */
  | { acao: "silenciar" };

/**
 * Decide o que fazer com base em quantos eventos daquele tipo já ocorreram na
 * janela — o recém-criado INCLUÍDO.
 *
 * O aviso de volume dispara numa FAIXA logo acima do teto, não num valor exato.
 * Com igualdade exata, duas gravações simultâneas veriam o mesmo número e
 * mandariam dois avisos, ou nenhuma veria e o aviso não sairia. A faixa torna
 * "sai pelo menos uma vez, e poucas" o comportamento provável — que é o que
 * importa aqui, já que não há estado para coordenar.
 */
export const LARGURA_DA_FAIXA = 3;

export function decidir(quantidadeNaJanela: number, teto: number = tetoConfigurado()): Decisao {
  if (quantidadeNaJanela <= teto) return { acao: "enviar" };

  if (quantidadeNaJanela <= teto + LARGURA_DA_FAIXA) {
    return { acao: "avisar-volume", quantidade: quantidadeNaJanela };
  }

  return { acao: "silenciar" };
}

/** Início da janela, para o filtro da consulta. */
export function inicioDaJanela(agora: Date = new Date()): string {
  return new Date(agora.getTime() - JANELA_MINUTOS * 60_000).toISOString();
}
