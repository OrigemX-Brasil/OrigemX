/**
 * ============================================================================
 * Quem pode receber e-mail, e quando — puro, sem rede e sem banco.
 * ============================================================================
 *
 * Mesmo desenho de `src/lib/notify/limite.ts`: a REGRA fica aqui, testável sem
 * subir nada, e o I/O fica em `guarda.ts`. É o que permite provar o teto de
 * frequência com uma tabela de casos em vez de sete cenários de ponta a ponta.
 *
 * NÃO CONFUNDIR COM O CORTA-CIRCUITO DE `limite.ts`. Aquele mede VOLUME GLOBAL
 * numa hora, para a cota do Resend não estourar no meio de uma feira e derrubar
 * o aviso do dia seguinte. Este mede QUANTOS AQUELE USUÁRIO recebeu numa
 * semana, e existe para não incomodar uma pessoa. Metas diferentes, janelas
 * diferentes, e por isso dois módulos.
 *
 * OS E-MAILS DE AUTH NÃO PASSAM POR AQUI. Confirmação de cadastro e
 * recuperação de senha saem do Supabase, e nem o opt-out nem o teto podem
 * bloqueá-los: são transacionais no sentido estrito — a pessoa pediu, e sem
 * eles ela não entra na conta.
 */

/** Os quatro e-mails ao usuário. Espelha o CHECK `user_emails_kind_valid`. */
export type EmailKind = "boas-vindas" | "primeiro-cao" | "selo-fundador" | "canil-publicado";

/**
 * TODOS os quatro são de evento único — cada um marca uma primeira vez que não
 * se repete (confirmou a conta, cadastrou o primeiro cão, ganhou o selo,
 * publicou o canil). Nenhum deve sair duas vezes, nunca.
 *
 * A lista existe explicitamente em vez de um `return true` implícito: se um dia
 * entrar um e-mail recorrente, quem o adicionar vai ter de decidir aqui, em vez
 * de herdar "não repete" sem perceber.
 */
const EVENTO_UNICO: ReadonlySet<EmailKind> = new Set<EmailKind>([
  "boas-vindas",
  "primeiro-cao",
  "selo-fundador",
  "canil-publicado",
]);

/** Janela do teto de frequência. */
export const JANELA_DIAS = 7;

/** Teto por usuário na janela. Pedido do produto: nunca mais de 2 por semana. */
export const MAX_POR_JANELA = 2;

export type EnvioAnterior = {
  kind: EmailKind;
  /** ISO. Vem de `user_emails.sent_at`. */
  sentAt: string;
};

export type Decisao =
  { enviar: true } | { enviar: false; motivo: "opt-out" | "teto-semanal" | "ja-enviado" };

export type Entrada = {
  kind: EmailKind;
  /** `profiles.email_opt_out`. Não-nulo = a pessoa saiu. */
  optOutAt: string | null;
  /** Envios anteriores DAQUELE usuário. A guarda passa a janela já filtrada
   *  ou não — esta função filtra de novo, para a regra não depender disso. */
  anteriores: readonly EnvioAnterior[];
  agora?: Date;
};

/**
 * A ordem das checagens é deliberada, e é a ordem do custo humano.
 *
 * 1. OPT-OUT primeiro. É a vontade expressa da pessoa e vale para tudo — nem
 *    faz sentido perguntar "já enviei este?" para quem pediu para não receber.
 * 2. JÁ ENVIADO antes do teto. Um e-mail de evento único que já saiu não deve
 *    ser reportado como "bloqueado pelo teto": o motivo real é outro, e o log
 *    ficaria mentindo sobre por que o envio não aconteceu.
 * 3. TETO por último, que é o caso "tudo certo, mas agora não".
 */
export function decidirEnvio({ kind, optOutAt, anteriores, agora = new Date() }: Entrada): Decisao {
  if (optOutAt) return { enviar: false, motivo: "opt-out" };

  if (EVENTO_UNICO.has(kind) && anteriores.some((e) => e.kind === kind)) {
    return { enviar: false, motivo: "ja-enviado" };
  }

  const inicio = agora.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000;
  const naJanela = anteriores.filter((e) => {
    const t = Date.parse(e.sentAt);
    // Data ilegível conta como FORA da janela: um registro corrompido não pode
    // silenciar e-mail legítimo. O erro seguro aqui é enviar a mais.
    return Number.isFinite(t) && t >= inicio;
  });

  if (naJanela.length >= MAX_POR_JANELA) return { enviar: false, motivo: "teto-semanal" };

  return { enviar: true };
}
