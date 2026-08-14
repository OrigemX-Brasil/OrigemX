import { describe, expect, it } from "vitest";

import { DESCRIPTION_PREVIEW_LENGTH, MAX_LITTER_PHOTOS, previewDescription } from "./constraints";

describe("previewDescription", () => {
  it("null vira null", () => {
    expect(previewDescription(null)).toBeNull();
  });

  it("texto curto passa intacto", () => {
    expect(previewDescription("Quatro filhotes, cor preta.")).toBe("Quatro filhotes, cor preta.");
  });

  it("texto exatamente no limite passa intacto, sem reticências", () => {
    const text = "a".repeat(DESCRIPTION_PREVIEW_LENGTH);
    expect(previewDescription(text)).toBe(text);
  });

  it("texto longo corta no espaço mais próximo, com reticências", () => {
    const text = `${"palavra ".repeat(30)}fim`;
    const result = previewDescription(text)!;

    expect(result.length).toBeLessThanOrEqual(DESCRIPTION_PREVIEW_LENGTH + 1);
    expect(result.endsWith("…")).toBe(true);
    // Não corta uma palavra ao meio: o caractere antes de "…" nunca é o meio
    // de "palavra" — só espaço ou a própria palavra inteira.
    expect(result.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("palavra única maior que o limite não trava — corta no limite bruto", () => {
    const text = "a".repeat(DESCRIPTION_PREVIEW_LENGTH + 50);
    const result = previewDescription(text)!;
    expect(result.length).toBe(DESCRIPTION_PREVIEW_LENGTH + 1);
  });
});

describe("MAX_LITTER_PHOTOS", () => {
  it("espelha o índice único parcial media_litter_position_uk (posições 1-4)", () => {
    expect(MAX_LITTER_PHOTOS).toBe(4);
  });
});
