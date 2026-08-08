import { describe, expect, it } from "vitest";

import { translateKennelError } from "./errors";

/**
 * As strings de `message` abaixo são VERBATIM do que o supabase-js devolveu no
 * banco real — capturadas em `reports/rls-report.json` pelo `test:rls`. Não são
 * palpite sobre o formato: testar contra um formato inventado provaria só que a
 * função concorda comigo.
 */
describe("translateKennelError", () => {
  it("distingue 'você já tem um canil' de 'esse endereço é de outro'", () => {
    const posse = translateKennelError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "kennels_owner_uk"',
      details: "Key (owner_id)=(6f1a5c2e-0000-4000-8000-000000000001) already exists.",
    });
    expect(posse.field).toBe("form");
    expect(posse.message).toMatch(/já tem um canil/i);
    expect(posse.message).toMatch(/exclua o atual/i);

    const slug = translateKennelError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "kennels_slug_key"',
      details: "Key (slug)=(canil-teste) already exists.",
    });
    expect(slug.field).toBe("slug");
    expect(slug.message).toMatch(/endereço/i);
  });

  /**
   * Regressão direta do defeito que motivou este módulo: a action tratava
   * QUALQUER 23505 como colisão de slug, então o segundo canil mandava o
   * criador trocar um endereço que não tinha problema nenhum.
   */
  it("não manda trocar o endereço quando o 23505 não é do slug", () => {
    const r = translateKennelError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "kennels_founder_number_key"',
    });
    expect(r.field).toBe("form");
    expect(r.message).not.toMatch(/endereço/i);
  });

  it("traduz os CHECKs de slug apontando o campo", () => {
    expect(
      translateKennelError({
        code: "23514",
        message: 'new row for relation "kennels" violates check constraint "kennels_slug_format"',
      }).field,
    ).toBe("slug");

    expect(
      translateKennelError({
        code: "23514",
        message: 'new row for relation "kennels" violates check constraint "kennels_slug_length"',
      }).message,
    ).toMatch(/3 e 60/);
  });

  it("traduz privilégio insuficiente sem falar de privilégio", () => {
    const r = translateKennelError({
      code: "42501",
      message: "permission denied for table kennels",
    });
    expect(r.field).toBe("form");
    expect(r.message).toMatch(/permissão/i);
  });

  it("tem uma saída para erro desconhecido e para erro ausente", () => {
    expect(translateKennelError(null).field).toBe("form");
    expect(translateKennelError({ code: "08006", message: "connection failure" }).message).toMatch(
      /tente novamente/i,
    );
  });

  /**
   * A tela é lida por criador de cão, não por quem escreve SQL. Nenhuma
   * mensagem pode vazar jargão de banco — mesma asserção do teste de dogs.
   */
  it("nunca vaza jargão de banco na mensagem", () => {
    const casos = [
      { code: "23505", message: 'unique constraint "kennels_owner_uk"' },
      { code: "23505", message: 'unique constraint "kennels_slug_key"' },
      { code: "23505", message: "outro qualquer" },
      { code: "23514", message: 'check constraint "kennels_slug_format"' },
      { code: "23514", message: 'check constraint "kennels_name_not_blank"' },
      { code: "42501", message: "permission denied" },
      null,
    ];

    for (const caso of casos) {
      const { message } = translateKennelError(caso);
      expect(message).not.toMatch(/constraint|23505|23514|42501|kennels_|owner_id|uuid/i);
    }
  });
});
