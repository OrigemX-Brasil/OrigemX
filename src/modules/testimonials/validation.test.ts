import { describe, expect, it } from "vitest";

import { MAX_AUTHOR_NAME_LENGTH, MAX_TESTIMONIAL_TEXT_LENGTH } from "./constraints";
import { normalizeTestimonial, validateTestimonial } from "./validation";

describe("normalizeTestimonial", () => {
  it("apara espaço, vazio vira null, nota digitada vira número", () => {
    expect(
      normalizeTestimonial({
        author_name: "  Maria Silva  ",
        text: "  Ótimo criador!  ",
        rating: "5",
        dog_id: "  ",
      }),
    ).toEqual({ author_name: "Maria Silva", text: "Ótimo criador!", rating: 5, dog_id: null });
  });

  it("sem nota vira null, não zero", () => {
    expect(
      normalizeTestimonial({ author_name: "Maria", text: "Bom", rating: "" }).rating,
    ).toBeNull();
  });
});

describe("validateTestimonial", () => {
  it("nome e texto preenchidos, sem nota, é válido", () => {
    expect(validateTestimonial({ author_name: "Maria Silva", text: "Ótimo criador!" })).toEqual({});
  });

  it("sem nome falha", () => {
    const errors = validateTestimonial({ text: "Ótimo criador!" });
    expect(errors.author_name).toBeDefined();
  });

  it("sem texto falha", () => {
    const errors = validateTestimonial({ author_name: "Maria" });
    expect(errors.text).toBeDefined();
  });

  it("nome além do limite falha, espelhando testimonials_author_name_len", () => {
    const errors = validateTestimonial({
      author_name: "a".repeat(MAX_AUTHOR_NAME_LENGTH + 1),
      text: "Ótimo",
    });
    expect(errors.author_name).toBeDefined();
  });

  it("texto além do limite falha, espelhando testimonials_text_len", () => {
    const errors = validateTestimonial({
      author_name: "Maria",
      text: "a".repeat(MAX_TESTIMONIAL_TEXT_LENGTH + 1),
    });
    expect(errors.text).toBeDefined();
  });

  it("nota de 1 a 5 é válida", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(
        validateTestimonial({ author_name: "Maria", text: "Bom", rating: String(n) }),
      ).toEqual({});
    }
  });

  it("nota fora de 1-5 falha, espelhando testimonials_rating_valid", () => {
    for (const n of ["0", "6", "-1"]) {
      const errors = validateTestimonial({ author_name: "Maria", text: "Bom", rating: n });
      expect(errors.rating).toBeDefined();
    }
  });

  it("nota não-inteira falha", () => {
    const errors = validateTestimonial({ author_name: "Maria", text: "Bom", rating: "3.5" });
    expect(errors.rating).toBeDefined();
  });
});
