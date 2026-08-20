import { MAX_AUTHOR_NAME_LENGTH, MAX_TESTIMONIAL_TEXT_LENGTH, RATING_MAX, RATING_MIN } from "./constraints";

/**
 * Validação de depoimento. Roda no client e de novo na Server Action; os
 * CHECKs do banco são a última linha.
 *
 * `dog_id` NÃO entra aqui — é um `<select>` populado pelos próprios cães do
 * canil, e a única checagem que importa (o cão pertence a este canil) é o
 * trigger `testimonials_check_dog_kennel`, no banco. Validar de novo em TS
 * exigiria a mesma lista de cães que o `<select>` já usa para se popular —
 * duplicação que diverge na primeira mudança.
 */

export type TestimonialInput = {
  author_name?: string;
  text?: string;
  rating?: string;
  dog_id?: string;
};

export type TestimonialErrors = Partial<Record<"author_name" | "text" | "rating", string>>;

export type NormalizedTestimonial = {
  author_name: string;
  text: string;
  rating: number | null;
  dog_id: string | null;
};

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeTestimonial(raw: TestimonialInput): NormalizedTestimonial {
  const ratingRaw = clean(raw.rating);
  return {
    author_name: (raw.author_name ?? "").trim(),
    text: (raw.text ?? "").trim(),
    rating: ratingRaw ? Number(ratingRaw) : null,
    dog_id: clean(raw.dog_id),
  };
}

export function validateTestimonial(raw: TestimonialInput): TestimonialErrors {
  const errors: TestimonialErrors = {};
  const values = normalizeTestimonial(raw);

  if (!values.author_name) {
    errors.author_name = "Informe o nome de quem deu o depoimento.";
  } else if (values.author_name.length > MAX_AUTHOR_NAME_LENGTH) {
    errors.author_name = `Deve ter no máximo ${MAX_AUTHOR_NAME_LENGTH} caracteres.`;
  }

  if (!values.text) {
    errors.text = "Escreva o depoimento.";
  } else if (values.text.length > MAX_TESTIMONIAL_TEXT_LENGTH) {
    errors.text = `Deve ter no máximo ${MAX_TESTIMONIAL_TEXT_LENGTH} caracteres.`;
  }

  if (values.rating !== null) {
    if (!Number.isInteger(values.rating) || values.rating < RATING_MIN || values.rating > RATING_MAX) {
      errors.rating = `A nota vai de ${RATING_MIN} a ${RATING_MAX}.`;
    }
  }

  return errors;
}
