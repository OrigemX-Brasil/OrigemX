import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOURCE,
  EXTERNAL_SOURCE,
  formatRate,
  isBot,
  isCapturePath,
  MAX_SOURCE_LENGTH,
  normalizePath,
  normalizeSource,
  readReferer,
  resolveSignupSource,
  rollupBySource,
  totals,
  type CaptureEvent,
} from "./events";

describe("normalizeSource", () => {
  it("sem marcação na URL, o acesso é 'direto'", () => {
    expect(normalizeSource(null)).toBe(DEFAULT_SOURCE);
    expect(normalizeSource(undefined)).toBe(DEFAULT_SOURCE);
    expect(normalizeSource("")).toBe(DEFAULT_SOURCE);
    expect(normalizeSource("   ")).toBe(DEFAULT_SOURCE);
  });

  it("caixa e acento não podem virar origens diferentes no relatório", () => {
    expect(normalizeSource("Feira")).toBe("feira");
    expect(normalizeSource("FEIRA")).toBe("feira");
    expect(normalizeSource(" feira ")).toBe("feira");
    expect(normalizeSource("Exposição")).toBe("exposicao");
  });

  it("reduz a um alfabeto pequeno — o valor vem de fora e não é confiável", () => {
    expect(normalizeSource("feira sp 2026")).toBe("feira-sp-2026");
    expect(normalizeSource("<script>alert(1)</script>")).toBe("script-alert-1-script");
    expect(normalizeSource("../../etc/passwd")).toBe("etc-passwd");
    expect(normalizeSource("'; drop table --")).toBe("drop-table");
  });

  it("corta no teto da coluna e não deixa hífen solto na ponta", () => {
    const enorme = normalizeSource("a".repeat(200));
    expect(enorme.length).toBe(MAX_SOURCE_LENGTH);

    const cortado = normalizeSource(`${"a".repeat(MAX_SOURCE_LENGTH - 1)} bbbb`);
    expect(cortado.length).toBeLessThanOrEqual(MAX_SOURCE_LENGTH);
    expect(cortado.endsWith("-")).toBe(false);
  });

  it("valor só de símbolos não vira origem vazia", () => {
    expect(normalizeSource("###")).toBe(DEFAULT_SOURCE);
    expect(normalizeSource("---")).toBe(DEFAULT_SOURCE);
  });
});

describe("normalizePath", () => {
  it("aceita caminho e corta no teto da coluna", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/d/abc123")).toBe("/d/abc123");
    expect(normalizePath(`/${"a".repeat(500)}`).length).toBe(200);
  });

  it("o que não é caminho cai para a raiz", () => {
    expect(normalizePath(null)).toBe("/");
    expect(normalizePath("https://outro.site/x")).toBe("/");
    expect(normalizePath("javascript:alert(1)")).toBe("/");
  });
});

describe("readReferer — de onde o pixel foi carregado", () => {
  it("lê caminho e origem da URL que o navegador informou", () => {
    expect(readReferer("https://origemxbr.com/?de=feira", "origemxbr.com")).toEqual({
      path: "/",
      source: "feira",
    });
  });

  it("sem o parâmetro, é acesso direto", () => {
    expect(readReferer("https://origemxbr.com/", "origemxbr.com")).toEqual({
      path: "/",
      source: DEFAULT_SOURCE,
    });
  });

  it("ignora a porta — em desenvolvimento ela muda o tempo todo", () => {
    expect(readReferer("http://localhost:3311/?de=qr", "localhost").source).toBe("qr");
  });

  it("domínio diferente vira 'externo' e não escreve o caminho de terceiro", () => {
    const info = readReferer("https://outro.site/pagina-deles?de=spam", "origemxbr.com");

    expect(info.source).toBe(EXTERNAL_SOURCE);
    expect(info.path).toBe("/");
  });

  it("sem referer, ou com referer quebrado, não levanta", () => {
    expect(readReferer(null)).toEqual({ path: "/", source: DEFAULT_SOURCE });
    expect(readReferer("nao é url")).toEqual({ path: "/", source: DEFAULT_SOURCE });
  });

  it("sem host esperado, não faz a checagem de domínio", () => {
    expect(readReferer("https://qualquer.coisa/?de=x").source).toBe("x");
  });
});

describe("isCapturePath — a trava que mantém a métrica honesta", () => {
  it("só a página de captura conta como acesso", () => {
    expect(isCapturePath("/")).toBe(true);
  });

  /**
   * O caso que originou a função: o prefetch do convite no rodapé fazia o pixel
   * disparar a partir do perfil do cão, e um acesso a perfil era contado como
   * acesso à landing.
   */
  it.each(["/d/n5xyxy8kd73b", "/c/canil-do-vale", "/c/aurora/p/abc", "/painel", "/cadastro"])(
    "%s NÃO conta como acesso à captura",
    (path) => {
      expect(isCapturePath(path)).toBe(false);
    },
  );

  it("caminho da raiz com barra sobrando não passa — readReferer já normaliza", () => {
    expect(isCapturePath("//")).toBe(false);
    expect(isCapturePath("")).toBe(false);
  });
});

describe("resolveSignupSource — a origem de um cadastro", () => {
  const host = "origemxbr.com";

  it("o parâmetro explícito vence o referer", () => {
    expect(resolveSignupSource("perfil", "https://origemxbr.com/?de=feira", host)).toBe("perfil");
  });

  it("sem parâmetro, recupera a campanha do referer da landing", () => {
    expect(resolveSignupSource(null, "https://origemxbr.com/?de=feira", host)).toBe("feira");
  });

  it("vindo da landing sem campanha, é 'direto' — igual ao acesso", () => {
    // Simetria com o pixel: se o acesso foi contado como 'direto', a conversão
    // também precisa ser, senão o relatório mostra origem com acesso e sem
    // cadastro ao lado de origem com cadastro e sem acesso.
    expect(resolveSignupSource(null, "https://origemxbr.com/", host)).toBe(DEFAULT_SOURCE);
  });

  it("sem referer, conta como direto em vez de inventar campanha", () => {
    expect(resolveSignupSource(null, null, host)).toBe(DEFAULT_SOURCE);
    expect(resolveSignupSource("", null, host)).toBe(DEFAULT_SOURCE);
  });

  it("chegando de fora do site, é 'externo'", () => {
    expect(resolveSignupSource(null, "https://www.google.com/search?q=canil", host)).toBe(
      EXTERNAL_SOURCE,
    );
  });

  it("parâmetro explícito também é normalizado", () => {
    expect(resolveSignupSource("Feira SP", null, host)).toBe("feira-sp");
  });
});

describe("isBot — lido e descartado, nunca gravado", () => {
  it.each([
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Googlebot"],
    ["facebookexternalhit/1.1", "prévia do Facebook"],
    ["WhatsApp/2.23", "prévia do WhatsApp"],
    ["curl/8.4.0", "curl"],
    ["python-requests/2.31.0", "script"],
    ["Mozilla/5.0 HeadlessChrome/120", "navegador headless"],
    ["bingbot/2.0", "Bingbot"],
    // Flagrados pelo teste ponta a ponta: o fetch do Node manda 'node' e
    // passava como visitante de verdade.
    ["node", "runtime do Node"],
    ["node-fetch/3.3.2", "node-fetch"],
    ["undici", "cliente HTTP do Node"],
    ["axios/1.6.0", "axios"],
    ["okhttp/4.12.0", "okhttp"],
    ["Go-http-client/2.0", "Go"],
    ["Java/17.0.9", "Java"],
    ["PostmanRuntime/7.36.0", "Postman"],
  ])("reconhece %s (%s)", (ua) => {
    expect(isBot(ua)).toBe(true);
  });

  it("não confunde 'node' dentro de palavra de navegador legítimo", () => {
    // A âncora ^node$ existe para isto: sem ela, qualquer UA contendo as
    // letras "node" viraria robô.
    expect(isBot("Mozilla/5.0 (Linux; Android 13; Nodestar X1) Chrome/120")).toBe(false);
  });

  it("user agent ausente ou vazio conta como robô", () => {
    expect(isBot(null)).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("   ")).toBe(true);
  });

  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15", "iPhone"],
    ["Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 Chrome/120", "Android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36", "desktop"],
  ])("não confunde %s com robô (%s)", (ua) => {
    expect(isBot(ua)).toBe(false);
  });
});

describe("rollupBySource", () => {
  const eventos: CaptureEvent[] = [
    { kind: "view", source: "feira" },
    { kind: "view", source: "feira" },
    { kind: "view", source: "feira" },
    { kind: "view", source: "feira" },
    { kind: "signup", source: "feira" },
    { kind: "view", source: "direto" },
    { kind: "view", source: "direto" },
  ];

  it("conta acesso e cadastro por origem", () => {
    const rows = rollupBySource(eventos);

    expect(rows.find((r) => r.source === "feira")).toEqual({
      source: "feira",
      views: 4,
      signups: 1,
      rate: 0.25,
    });
  });

  it("ordena da origem mais acessada para a menos", () => {
    expect(rollupBySource(eventos).map((r) => r.source)).toEqual(["feira", "direto"]);
  });

  it("origem sem cadastro tem taxa zero, não taxa nula", () => {
    expect(rollupBySource(eventos).find((r) => r.source === "direto")?.rate).toBe(0);
  });

  /**
   * Zero acesso com cadastro é sinal de furo na medição — pixel bloqueado, por
   * exemplo. Sumir com a linha esconderia o problema justamente onde ele
   * aparece.
   */
  it("cadastro sem nenhum acesso aparece, com taxa INDEFINIDA e não zero", () => {
    const row = rollupBySource([{ kind: "signup", source: "cartaz" }])[0];

    expect(row).toEqual({ source: "cartaz", views: 0, signups: 1, rate: null });
  });

  it("lista vazia devolve lista vazia", () => {
    expect(rollupBySource([])).toEqual([]);
  });
});

describe("totals", () => {
  it("soma as origens e calcula a taxa geral", () => {
    const rows = rollupBySource([
      { kind: "view", source: "a" },
      { kind: "view", source: "a" },
      { kind: "view", source: "b" },
      { kind: "view", source: "b" },
      { kind: "signup", source: "a" },
    ]);

    expect(totals(rows)).toEqual({ views: 4, signups: 1, rate: 0.25 });
  });

  it("sem acesso nenhum, a taxa é indefinida", () => {
    expect(totals([])).toEqual({ views: 0, signups: 0, rate: null });
  });
});

describe("formatRate", () => {
  it("uma casa decimal", () => {
    expect(formatRate(0.25)).toBe("25.0%");
    expect(formatRate(0.0333)).toBe("3.3%");
    expect(formatRate(1)).toBe("100.0%");
    expect(formatRate(0)).toBe("0.0%");
  });

  it("indefinida não vira 0%", () => {
    expect(formatRate(null)).toBe("—");
  });
});
