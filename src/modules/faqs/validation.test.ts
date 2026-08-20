import { describe, expect, it } from "vitest";

import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "./constraints";
import { normalizeFaq, validateFaq } from "./validation";

describe("normalizeFaq", () => {
  it("apara espaço nos dois campos", () => {
    expect(normalizeFaq({ question: "  Entrega?  ", answer: "  Sim.  " })).toEqual({
      question: "Entrega?",
      answer: "Sim.",
    });
  });
});

describe("validateFaq", () => {
  it("pergunta e resposta preenchidas é válido", () => {
    expect(validateFaq({ question: "Como funciona a entrega?", answer: "Combinamos por WhatsApp." })).toEqual(
      {},
    );
  });

  it("sem pergunta falha", () => {
    expect(validateFaq({ answer: "Sim." }).question).toBeDefined();
  });

  it("sem resposta falha", () => {
    expect(validateFaq({ question: "Entrega?" }).answer).toBeDefined();
  });

  it("pergunta além do limite falha, espelhando kennel_faqs_question_len", () => {
    const errors = validateFaq({
      question: "a".repeat(MAX_QUESTION_LENGTH + 1),
      answer: "Sim.",
    });
    expect(errors.question).toBeDefined();
  });

  it("resposta além do limite falha, espelhando kennel_faqs_answer_len", () => {
    const errors = validateFaq({
      question: "Entrega?",
      answer: "a".repeat(MAX_ANSWER_LENGTH + 1),
    });
    expect(errors.answer).toBeDefined();
  });
});
