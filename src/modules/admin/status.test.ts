import { describe, expect, it } from "vitest";

import { dogStatus, kennelStatus } from "./status";

const NOW = "2026-01-01T00:00:00.000Z";

describe("kennelStatus", () => {
  it("rascunho: nada preenchido", () => {
    expect(kennelStatus({ deleted_at: null, hidden_at: null, published_at: null })).toBe("draft");
  });

  it("publicado: só published_at", () => {
    expect(kennelStatus({ deleted_at: null, hidden_at: null, published_at: NOW })).toBe(
      "published",
    );
  });

  it("oculto vence publicado — decisão do admin sobrepõe a do dono", () => {
    expect(kennelStatus({ deleted_at: null, hidden_at: NOW, published_at: NOW })).toBe("hidden");
  });

  it("excluído vence oculto e publicado — é o estado mais forte", () => {
    expect(kennelStatus({ deleted_at: NOW, hidden_at: NOW, published_at: NOW })).toBe("deleted");
  });
});

describe("dogStatus", () => {
  const base = { owner_id: "u1", kennel_id: "k1" } as const;

  it("rascunho: nada preenchido, cão comum", () => {
    expect(
      dogStatus({ ...base, deleted_at: null, hidden_at: null, published_at: null }),
    ).toBe("draft");
  });

  it("publicado", () => {
    expect(
      dogStatus({ ...base, deleted_at: null, hidden_at: null, published_at: NOW }),
    ).toBe("published");
  });

  it("fantasma (sem dono e sem canil) vence publicado/rascunho", () => {
    expect(
      dogStatus({
        owner_id: null,
        kennel_id: null,
        deleted_at: null,
        hidden_at: null,
        published_at: null,
      }),
    ).toBe("ghost");
  });

  it("oculto vence fantasma — moderação é o que o admin precisa ver primeiro", () => {
    expect(
      dogStatus({
        owner_id: null,
        kennel_id: null,
        deleted_at: null,
        hidden_at: NOW,
        published_at: null,
      }),
    ).toBe("hidden");
  });

  it("excluído vence tudo", () => {
    expect(
      dogStatus({ ...base, deleted_at: NOW, hidden_at: NOW, published_at: NOW }),
    ).toBe("deleted");
  });
});
