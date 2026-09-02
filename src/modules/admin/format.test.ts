import { describe, expect, it } from "vitest";

import {
  actionLabel,
  DEFAULT_HIDE_REASON,
  DEFAULT_SUSPEND_REASON,
  DEFAULT_UNHIDE_REASON,
  DEFAULT_UNSUSPEND_REASON,
  detailsSummary,
  endOfDaySaoPaulo,
  entityHref,
  entityLabel,
  resolveHideReason,
  resolveSuspendReason,
  startOfDaySaoPaulo,
} from "./format";

describe("resolveSuspendReason", () => {
  it("campo vazio vira motivo padrão de suspensão", () => {
    expect(resolveSuspendReason("", true)).toBe(DEFAULT_SUSPEND_REASON);
  });

  it("campo só com espaço conta como vazio", () => {
    expect(resolveSuspendReason("   ", false)).toBe(DEFAULT_UNSUSPEND_REASON);
  });

  it("motivo de reativação é diferente do de suspensão", () => {
    expect(resolveSuspendReason("", false)).not.toBe(resolveSuspendReason("", true));
  });

  it("motivo escrito pelo admin é preservado, sem truncar nem trocar", () => {
    expect(resolveSuspendReason("Denúncia confirmada por outro criador", true)).toBe(
      "Denúncia confirmada por outro criador",
    );
  });

  it("apara espaço nas pontas do motivo escrito", () => {
    expect(resolveSuspendReason("  Reincidência  ", true)).toBe("Reincidência");
  });
});

describe("resolveHideReason", () => {
  it("campo vazio vira motivo padrão de ocultar", () => {
    expect(resolveHideReason("", true)).toBe(DEFAULT_HIDE_REASON);
  });

  it("campo só com espaço conta como vazio", () => {
    expect(resolveHideReason("   ", false)).toBe(DEFAULT_UNHIDE_REASON);
  });

  it("motivo de reativação é diferente do de ocultar", () => {
    expect(resolveHideReason("", false)).not.toBe(resolveHideReason("", true));
  });

  it("motivo escrito pelo admin é preservado, sem truncar nem trocar", () => {
    expect(resolveHideReason("Duplicata do canil Serra Azul", true)).toBe(
      "Duplicata do canil Serra Azul",
    );
  });

  it("apara espaço nas pontas do motivo escrito", () => {
    expect(resolveHideReason("  Duplicata  ", true)).toBe("Duplicata");
  });
});

describe("startOfDaySaoPaulo / endOfDaySaoPaulo", () => {
  it("início do dia carrega o offset fixo -03:00", () => {
    expect(startOfDaySaoPaulo("2026-08-10")).toBe("2026-08-10T00:00:00-03:00");
  });

  it("fim do dia vai até o último milissegundo, mesmo offset", () => {
    expect(endOfDaySaoPaulo("2026-08-10")).toBe("2026-08-10T23:59:59.999-03:00");
  });

  it("início e fim do mesmo dia produzem instantes distintos e ordenados", () => {
    const inicio = new Date(startOfDaySaoPaulo("2026-08-10")).getTime();
    const fim = new Date(endOfDaySaoPaulo("2026-08-10")).getTime();
    expect(inicio).toBeLessThan(fim);
  });
});

describe("entityLabel / entityHref", () => {
  it("traduz os cinco tipos de entidade conhecidos", () => {
    expect(entityLabel("profile")).toBe("Usuário");
    expect(entityLabel("kennel")).toBe("Canil");
    expect(entityLabel("dog")).toBe("Cão");
    expect(entityLabel("litter")).toBe("Ninhada");
    expect(entityLabel("media")).toBe("Imagem");
  });

  it("tipo desconhecido devolve o próprio valor, sem quebrar a tela", () => {
    expect(entityLabel("outro")).toBe("outro");
  });

  it("monta o link certo para cada tipo de entidade", () => {
    expect(entityHref("profile", "abc")).toBe("/admin/usuarios/abc");
    expect(entityHref("kennel", "abc")).toBe("/admin/canis/abc");
    expect(entityHref("dog", "abc")).toBe("/admin/caes/abc");
  });

  it("tipo desconhecido não gera link", () => {
    expect(entityHref("outro", "abc")).toBeNull();
  });

  it("ninhada tem rótulo mas não tem link: não existe tela /admin/ninhadas", () => {
    expect(entityLabel("litter")).toBe("Ninhada");
    expect(entityHref("litter", "abc")).toBeNull();
  });

  // Mesma razão da ninhada: não existe tela para uma imagem isolada. Quem tem
  // tela é o DONO dela, e o id dele está no `details`.
  it("imagem tem rótulo mas não tem link", () => {
    expect(entityLabel("media")).toBe("Imagem");
    expect(entityHref("media", "abc")).toBeNull();
  });
});

describe("actionLabel", () => {
  it("traduz as ações de cadastro em nome do usuário", () => {
    expect(actionLabel("dog.create_for_user")).toBe("Cadastrou cão para o usuário");
    expect(actionLabel("litter.create_for_user")).toBe("Cadastrou ninhada para o usuário");
    expect(actionLabel("kennel.create_for_user")).toBe("Cadastrou canil para o usuário");
    expect(actionLabel("media.create_for_user")).toBe("Enviou imagem para o usuário");
  });

  // Pares separados, e não um `set_published` com booleano no details: é o que
  // torna "o que este admin colocou no ar" um `where action =` em vez de um
  // filtro dentro do JSON.
  it("publicar e tirar do ar são ações distintas, por entidade", () => {
    expect(actionLabel("dog.publish")).toBe("Publicou cão");
    expect(actionLabel("dog.unpublish")).toBe("Tirou cão do ar");
    expect(actionLabel("kennel.publish")).toBe("Publicou canil");
    expect(actionLabel("kennel.unpublish")).toBe("Tirou canil do ar");
  });

  it("ação desconhecida devolve o próprio valor, sem quebrar a tela", () => {
    expect(actionLabel("dog.explode")).toBe("dog.explode");
  });
});

describe("detailsSummary", () => {
  describe("ações que mudam um valor", () => {
    it("monta de → para", () => {
      expect(detailsSummary({ de: null, para: "2026-08-10T12:00:00Z" })).toBe(
        "— → 2026-08-10T12:00:00Z",
      );
    });

    it("details sem as duas chaves e sem forma de criação não vira texto", () => {
      expect(detailsSummary({ de: 1 })).toBeNull();
      expect(detailsSummary({})).toBeNull();
      expect(detailsSummary(null)).toBeNull();
    });
  });

  describe("cadastro em nome do usuário", () => {
    /** O `details` que `admin_create_dog_for_kennel` grava, na íntegra. */
    function detalhesDeCao(over: Record<string, unknown> = {}) {
      return {
        kennel_id: "k-1",
        owner_id: "u-1",
        litter_id: null,
        nome: "Rex de Aurora",
        sexo: "male",
        published_at: null,
        founder_number_atribuido: null,
        ...over,
      };
    }

    it("cão comum mostra só o nome", () => {
      expect(detailsSummary(detalhesDeCao())).toBe("Rex de Aurora");
    });

    it("filhote é identificado pelo litter_id, não por uma ação separada", () => {
      expect(detailsSummary(detalhesDeCao({ litter_id: "n-1" }))).toBe(
        "Rex de Aurora · filhote de ninhada",
      );
    });

    it("filhote que herdou a publicação da ninhada diz isso", () => {
      expect(
        detailsSummary(
          detalhesDeCao({ litter_id: "n-1", published_at: "2026-09-01T10:00:00Z" }),
        ),
      ).toBe("Rex de Aurora · filhote de ninhada · nasceu publicado com a ninhada");
    });

    // O selo é IRREVERSÍVEL e é efeito colateral de um trigger. Se não aparecer
    // no histórico, a queima de um número do pool fica invisível.
    it("selo Fundador queimado pela ação aparece no resumo", () => {
      expect(detailsSummary(detalhesDeCao({ founder_number_atribuido: 105 }))).toBe(
        "Rex de Aurora · selo Fundador nº 105",
      );
    });

    it("canil que já tinha selo não repete o número: a RPC grava null", () => {
      expect(detailsSummary(detalhesDeCao({ founder_number_atribuido: null }))).toBe(
        "Rex de Aurora",
      );
    });

    it("ninhada grava só ids, que não viram texto útil", () => {
      expect(
        detailsSummary({ kennel_id: "k-1", owner_id: "u-1", sire_id: null, dam_id: null }),
      ).toBeNull();
    });
  });

  describe("canil cadastrado em nome do usuário", () => {
    /** O `details` que `admin_create_kennel_for_user` grava, na íntegra. */
    function detalhesDeCanil(over: Record<string, unknown> = {}) {
      return { owner_id: "u-1", nome: "Canil Aurora", slug: "canil-aurora", ...over };
    }

    // O endereço não é enfeite no histórico: `kennels_slug_key` é único GLOBAL e
    // não parcial por `deleted_at`, então ele ficou queimado para sempre no
    // instante desta linha — e quem o escolheu foi o admin, não o dono.
    it("mostra o nome e o endereço definitivo", () => {
      expect(detailsSummary(detalhesDeCanil())).toBe("Canil Aurora · /c/canil-aurora");
    });

    it("canil sem slug no details cai só no nome, sem inventar barra solta", () => {
      expect(detailsSummary(detalhesDeCanil({ slug: "" }))).toBe("Canil Aurora");
    });
  });

  describe("imagem enviada em nome do usuário", () => {
    /** O `details` que `admin_register_media_for_user` grava, na íntegra. */
    function detalhesDeMidia(over: Record<string, unknown> = {}) {
      return {
        owner_id: "u-1",
        role: "kennel_logo",
        entity_id: "k-1",
        kennel_id: "k-1",
        storage_path: "u-1/kennel_logo/k-1/abc.webp",
        size_bytes: 51234,
        founder_number_atribuido: null,
        ...over,
      };
    }

    it("diz qual imagem foi, mesmo sem nome no details", () => {
      expect(detailsSummary(detalhesDeMidia())).toBe("logo do canil");
      expect(detailsSummary(detalhesDeMidia({ role: "dog_gallery" }))).toBe("foto do cão");
    });

    // O caso que mais importa desta tela: o logo costuma ser o ÚLTIMO requisito
    // de `kennel_is_founder_eligible`, então é o envio que queima o número — e
    // `kennels_freeze_founder_number` o torna irreversível.
    it("selo Fundador queimado pelo envio do logo aparece no resumo", () => {
      expect(detailsSummary(detalhesDeMidia({ founder_number_atribuido: 137 }))).toBe(
        "logo do canil · selo Fundador nº 137",
      );
    });

    it("papel desconhecido não vira texto inventado", () => {
      expect(detailsSummary(detalhesDeMidia({ role: "outra_coisa" }))).toBeNull();
    });
  });

  describe("publicação por admin", () => {
    // Publicar grava `{de, para}` como toda ação que MUDA um valor, então cai no
    // primeiro ramo e nunca chega em `createdSummary` — mesmo com `slug` no
    // details, que existe para a trilha e não para a célula de resumo.
    it("publicar canil mostra a transição, não o endereço", () => {
      expect(
        detailsSummary({
          owner_id: "u-1",
          slug: "canil-aurora",
          de: null,
          para: "2026-09-01T10:00:00Z",
        }),
      ).toBe("— → 2026-09-01T10:00:00Z");
    });

    it("tirar do ar é a transição inversa", () => {
      expect(
        detailsSummary({
          owner_id: "u-1",
          kennel_id: "k-1",
          de: "2026-09-01T10:00:00Z",
          para: null,
        }),
      ).toBe("2026-09-01T10:00:00Z → —");
    });
  });
});
