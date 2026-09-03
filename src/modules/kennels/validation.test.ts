import { describe, expect, it } from "vitest";

import { KENNEL_FORM_FIELDS } from "./fields";
import { isHttpUrl, normalizeKennelInput, slugify, validateKennel } from "./validation";

/** Preenche todos os obrigatórios com valor válido, para isolar um caso por vez. */
function validBase() {
  return { name: "Canil Aurora", slug: "canil-aurora" };
}

describe("slugify", () => {
  it("gera slug legível", () => {
    expect(slugify("Canil Aurora")).toBe("canil-aurora");
    expect(slugify("  Canil   do  Vale  ")).toBe("canil-do-vale");
  });

  it("remove acento antes de filtrar", () => {
    // Sem NFD + remoção de diacrítico, "Ipê" viraria "canil-ip".
    expect(slugify("Canil Ipê")).toBe("canil-ipe");
    expect(slugify("Criação São João")).toBe("criacao-sao-joao");
    expect(slugify("Canil Ñandú")).toBe("canil-nandu");
  });

  it("não deixa hífen sobrando nas pontas", () => {
    expect(slugify("!!! Canil !!!")).toBe("canil");
    expect(slugify("---")).toBe("");
  });

  it("respeita o limite de 60 sem terminar em hífen", () => {
    const s = slugify("a".repeat(80));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);

    const comCorte = slugify(`${"a".repeat(59)} palavra`);
    expect(comCorte.endsWith("-")).toBe(false);
  });

  it("devolve vazio quando não sobra nada utilizável", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});

describe("isHttpUrl", () => {
  it("aceita http e https", () => {
    expect(isHttpUrl("https://canilaurora.com.br")).toBe(true);
    expect(isHttpUrl("http://canilaurora.com.br")).toBe(true);
  });

  it("recusa esquema perigoso — perfil público renderiza este valor", () => {
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("recusa lixo", () => {
    expect(isHttpUrl("canilaurora.com.br")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("normalizeKennelInput", () => {
  it("apara espaço", () => {
    expect(normalizeKennelInput({ name: "  Canil Aurora  " }).name).toBe("Canil Aurora");
  });

  it("sobe UF para maiúscula e desce slug para minúscula", () => {
    expect(normalizeKennelInput({ state: "sp" }).state).toBe("SP");
    expect(normalizeKennelInput({ slug: "Canil-Aurora" }).slug).toBe("canil-aurora");
  });

  it("tira o @ na frente do handle do Instagram, sem mexer no resto", () => {
    expect(normalizeKennelInput({ instagram_handle: "@Canil.Aurora" }).instagram_handle).toBe(
      "Canil.Aurora",
    );
    expect(normalizeKennelInput({ instagram_handle: "Canil.Aurora" }).instagram_handle).toBe(
      "Canil.Aurora",
    );
  });

  it("vazio vira null, não string vazia", () => {
    // String vazia faria a completude contar o campo como preenchido e o
    // perfil público exibir rótulo sem conteúdo.
    expect(normalizeKennelInput({ city: "" }).city).toBeNull();
    expect(normalizeKennelInput({ city: "   " }).city).toBeNull();
  });

  it("ignora campo não enviado, para não sobrescrever com null numa edição parcial", () => {
    const out = normalizeKennelInput({ name: "Canil Aurora" });
    expect("city" in out).toBe(false);
  });
});

describe("validateKennel", () => {
  it("aceita entrada válida", () => {
    expect(validateKennel(validBase())).toEqual({});
  });

  it("exige apenas o que a COLUNA exige (notNull), nunca o peso", () => {
    const errors = validateKennel({});
    const naoNulos = KENNEL_FORM_FIELDS.filter((f) => f.notNull).map((f) => f.name);
    for (const nome of naoNulos) {
      expect(errors[nome], nome).toBeDefined();
    }
  });

  /**
   * O OUTRO LADO, e é o que sustenta o aditivo de fluxo de 03/09/2026: cidade,
   * estado, raças, WhatsApp e logo entram no cadastro MÍNIMO (peso `required`,
   * pesam 2 na completude) e mesmo assim NÃO podem travar o salvar.
   *
   * Antes do aditivo `weight === "required"` significava as duas coisas ao
   * mesmo tempo, e promover "cidade" a obrigatória teria bloqueado a tela — o
   * oposto do pedido. Se alguém reintroduzir esse acoplamento, é aqui que
   * aparece.
   */
  it("campo do mínimo que NÃO é notNull não bloqueia o salvar", () => {
    const errors = validateKennel({});
    const minimoNulavel = KENNEL_FORM_FIELDS.filter((f) => f.weight === "required" && !f.notNull);

    expect(minimoNulavel.length, "o mínimo precisa ter campo nulável para este teste valer").
      toBeGreaterThan(0);
    for (const field of minimoNulavel) {
      expect(errors[field.name], field.name).toBeUndefined();
    }
  });

  it("não exige recomendado nem opcional", () => {
    const errors = validateKennel(validBase());
    const naoObrigatorios = KENNEL_FORM_FIELDS.filter((f) => f.weight !== "required");
    for (const field of naoObrigatorios) {
      expect(errors[field.name], field.name).toBeUndefined();
    }
  });

  it("recusa slug fora do formato", () => {
    expect(validateKennel({ ...validBase(), slug: "Canil Aurora" }).slug).toBeDefined();
    expect(validateKennel({ ...validBase(), slug: "canil_aurora" }).slug).toBeDefined();
    expect(validateKennel({ ...validBase(), slug: "-canil" }).slug).toBeDefined();
    expect(validateKennel({ ...validBase(), slug: "canil--aurora" }).slug).toBeDefined();
  });

  it("recusa slug curto demais — o endereço é queimado para sempre", () => {
    expect(validateKennel({ ...validBase(), slug: "ab" }).slug).toBeDefined();
    expect(validateKennel({ ...validBase(), slug: "abc" }).slug).toBeUndefined();
  });

  it("recusa UF fora do formato", () => {
    expect(validateKennel({ ...validBase(), state: "São Paulo" }).state).toBeDefined();
    expect(validateKennel({ ...validBase(), state: "S" }).state).toBeDefined();
    // minúscula é normalizada antes de validar
    expect(validateKennel({ ...validBase(), state: "sp" }).state).toBeUndefined();
  });

  it("recusa URL com esquema perigoso", () => {
    expect(
      validateKennel({ ...validBase(), website_url: "javascript:alert(1)" }).website_url,
    ).toBeDefined();
  });

  it("aceita handle do Instagram com ou sem @, e recusa formato inválido", () => {
    expect(
      validateKennel({ ...validBase(), instagram_handle: "canil.aurora" }).instagram_handle,
    ).toBeUndefined();
    expect(
      validateKennel({ ...validBase(), instagram_handle: "@canil.aurora" }).instagram_handle,
    ).toBeUndefined();
    expect(
      validateKennel({ ...validBase(), instagram_handle: "canil aurora" }).instagram_handle,
    ).toBeDefined();
    expect(
      validateKennel({ ...validBase(), instagram_handle: "instagram.com/canilaurora" })
        .instagram_handle,
    ).toBeDefined();
    expect(
      validateKennel({ ...validBase(), instagram_handle: "https://instagram.com/canilaurora" })
        .instagram_handle,
    ).toBeDefined();
  });

  it("recusa handle do Instagram acima de 30 caracteres", () => {
    expect(
      validateKennel({ ...validBase(), instagram_handle: "a".repeat(31) }).instagram_handle,
    ).toBeDefined();
    expect(
      validateKennel({ ...validBase(), instagram_handle: "a".repeat(30) }).instagram_handle,
    ).toBeUndefined();
  });

  it("recusa campo acima do limite de tamanho", () => {
    const campoComLimite = KENNEL_FORM_FIELDS.find((f) => f.maxLength && f.input === "textarea");
    if (!campoComLimite?.maxLength) return;
    const errors = validateKennel({
      ...validBase(),
      [campoComLimite.name]: "x".repeat(campoComLimite.maxLength + 1),
    });
    expect(errors[campoComLimite.name]).toBeDefined();
  });

  it("aceita espaço em branco como ausência num campo obrigatório", () => {
    const errors = validateKennel({ ...validBase(), name: "    " });
    expect(errors.name).toBeDefined();
  });
});
