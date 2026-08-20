import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "./constraints";

/**
 * Validação de FAQ. Roda no client e de novo na Server Action; os CHECKs do
 * banco são a última linha.
 */

export type FaqInput = {
  question?: string;
  answer?: string;
};

export type FaqErrors = Partial<Record<"question" | "answer", string>>;

export type NormalizedFaq = {
  question: string;
  answer: string;
};

export function normalizeFaq(raw: FaqInput): NormalizedFaq {
  return {
    question: (raw.question ?? "").trim(),
    answer: (raw.answer ?? "").trim(),
  };
}

export function validateFaq(raw: FaqInput): FaqErrors {
  const errors: FaqErrors = {};
  const values = normalizeFaq(raw);

  if (!values.question) {
    errors.question = "Escreva a pergunta.";
  } else if (values.question.length > MAX_QUESTION_LENGTH) {
    errors.question = `Deve ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`;
  }

  if (!values.answer) {
    errors.answer = "Escreva a resposta.";
  } else if (values.answer.length > MAX_ANSWER_LENGTH) {
    errors.answer = `Deve ter no máximo ${MAX_ANSWER_LENGTH} caracteres.`;
  }

  return errors;
}
