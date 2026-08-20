/**
 * ============================================================================
 * Limites de FAQ. Espelham os CHECKs da migration `faq_do_canil`.
 * ============================================================================
 *
 * Mudar um número aqui sem mudar o banco quebra o salvamento num ponto que só
 * aparece em produção — mesmo aviso que abre os outros `constraints.ts`.
 */

/** Espelha `kennel_faqs_question_len`. */
export const MAX_QUESTION_LENGTH = 150;
/** Espelha `kennel_faqs_answer_len`. */
export const MAX_ANSWER_LENGTH = 600;

/**
 * Teto de perguntas por canil. NÃO existe constraint equivalente no banco: é
 * guarda contra cadastro em loop e serve de `limit` da consulta.
 */
export const MAX_FAQS_PER_KENNEL = 20;

/**
 * SUGESTÕES clicáveis no formulário de adicionar — clicar preenche o campo de
 * pergunta; a resposta é sempre digitada pelo criador, nunca pré-preenchida:
 * garantia de saúde e política de entrega variam por canil, e um texto nosso
 * ali pareceria promessa da OrigemX, não do criador.
 */
export const SUGGESTED_QUESTIONS = [
  "Como funciona a entrega?",
  "Qual a garantia de saúde?",
  "Posso retirar pessoalmente?",
] as const;
