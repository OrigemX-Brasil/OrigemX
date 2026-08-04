import { describe, expect, it } from "vitest";

import { assuntoDe, detalhesDe, type EventoInterno } from "./eventos";
import { decidir, LARGURA_DA_FAIXA, TETO_PADRAO, tetoConfigurado } from "./limite";
import { escapar, montarEmail } from "./template";

const CONTA: EventoInterno = {
  tipo: "conta-criada",
  nome: "Maria do Canil",
  origem: "email",
  id: "11111111-1111-4111-8111-111111111111",
};

const CANIL: EventoInterno = {
  tipo: "canil-criado",
  nome: "Canil Aurora",
  slug: "canil-aurora",
  cidade: "Curitiba",
  estado: "PR",
  id: "22222222-2222-4222-8222-222222222222",
};

describe("assunto", () => {
  it("diz o que aconteceu antes de a pessoa abrir", () => {
    expect(assuntoDe(CONTA)).toBe("OrigemX · nova conta: Maria do Canil");
    expect(assuntoDe(CANIL)).toBe("OrigemX · novo canil: Canil Aurora");
  });

  it("conta sem nome não vira 'nova conta: null'", () => {
    expect(assuntoDe({ ...CONTA, nome: null })).toBe("OrigemX · nova conta");
  });
});

describe("detalhes", () => {
  it("nome vazio vira aviso legível, não string em branco", () => {
    const linhas = detalhesDe({ ...CONTA, nome: "   " });
    expect(linhas[0]).toEqual(["Criador", "(nome não informado)"]);
  });

  it("canil sem cidade omite a linha em vez de mostrar vazia", () => {
    const rotulos = detalhesDe({ ...CANIL, cidade: null, estado: null }).map(([r]) => r);
    expect(rotulos).not.toContain("Local");
  });
});

/**
 * ============================================================================
 * A minimização precisa ser garantida por CÓDIGO
 * ============================================================================
 *
 * O contrato diz "nome e o evento, nada sensível". Confiar em quem escreve a
 * chamada é o modo de essa regra durar até o próximo desenvolvedor com pressa.
 * Estes testes tratam o e-mail montado como a fronteira: o que não estiver no
 * tipo do evento não pode aparecer na saída, mesmo que o chamador tente.
 */
describe("dado mínimo", () => {
  const SENSIVEL = {
    telefone: "+5541999998888",
    email: "maria@exemplo.com.br",
    documento: "123.456.789-00",
    microchip: "985112345678901",
    endereco: "Rua das Flores, 42",
  };

  it("campo sensível empurrado junto NÃO chega ao e-mail", () => {
    // Um chamador descuidado espalhando o objeto do usuário inteiro. O tipo já
    // recusaria em compilação; aqui se prova que também não vaza em runtime.
    const contaminado = { ...CONTA, ...SENSIVEL } as EventoInterno;
    const { html, texto, assunto } = montarEmail(contaminado);

    for (const valor of Object.values(SENSIVEL)) {
      expect(html, `vazou no HTML: ${valor}`).not.toContain(valor);
      expect(texto, `vazou no texto: ${valor}`).not.toContain(valor);
      expect(assunto, `vazou no assunto: ${valor}`).not.toContain(valor);
    }
  });

  it("o que DEVE sair, sai", () => {
    const { html, texto } = montarEmail(CONTA);
    expect(html).toContain("Maria do Canil");
    expect(texto).toContain("Maria do Canil");
    expect(texto).toContain(CONTA.tipo === "conta-criada" ? CONTA.id : "");
  });

  it("o rodapé afirma ao leitor o que o e-mail não contém", () => {
    expect(montarEmail(CANIL).texto).toContain("nenhum dado de contato");
  });
});

describe("escapar", () => {
  /**
   * O nome vem do usuário. Sem escape, alguém se cadastrando com HTML entregaria
   * markup arbitrário na caixa de entrada da equipe — e cliente de e-mail é onde
   * ninguém espera código.
   */
  it("neutraliza HTML no nome", () => {
    const { html } = montarEmail({
      ...CONTA,
      nome: '<img src=x onerror="alert(1)">',
    });

    // Nenhuma TAG nasce: o `<` virou entidade, então aquilo é texto na tela.
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");

    // As letras "onerror=" continuam ali, e tudo bem — o que não pode é a aspa
    // que fecharia o atributo. Escapada, não há atributo nenhum para o cliente
    // de e-mail interpretar.
    expect(html).not.toContain('onerror="');
    expect(html).toContain("onerror=&quot;");
  });

  it("escapa os cinco que importam", () => {
    expect(escapar(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("texto puro passa intacto", () => {
    expect(escapar("Canil Ipê Amarelo")).toBe("Canil Ipê Amarelo");
  });
});

describe("template", () => {
  it("sai em HTML e em texto — cliente que bloqueia HTML ainda entende", () => {
    const { html, texto } = montarEmail(CANIL);
    expect(html).toContain("<!doctype html>");
    expect(texto).toContain("Canil Aurora");
    expect(texto).not.toContain("<");
  });

  it("usa tabela, não flex — Outlook renderiza com o motor do Word", () => {
    const { html } = montarEmail(CANIL);
    expect(html).toContain("<table");
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("display:grid");
  });

  it("estilo inline: e-mail não carrega folha externa", () => {
    expect(montarEmail(CANIL).html).not.toContain("<link");
  });

  it("a data sai no fuso de São Paulo, não em UTC", () => {
    // 2026-03-10T02:00:00Z é ainda dia 9 no Brasil. Sem fuso fixo, o e-mail
    // diria um dia diferente do que a equipe viveu.
    const { texto } = montarEmail(CANIL, new Date("2026-03-10T02:00:00Z"));
    expect(texto).toContain("09/03/2026");
  });
});

/**
 * ============================================================================
 * Corta-circuito
 * ============================================================================
 */
describe("teto de volume", () => {
  it("abaixo do teto, envia o individual", () => {
    expect(decidir(1, 20).acao).toBe("enviar");
    expect(decidir(20, 20).acao).toBe("enviar");
  });

  it("logo acima do teto, troca por UM aviso de volume alto", () => {
    const d = decidir(21, 20);
    expect(d.acao).toBe("avisar-volume");
    expect(d.acao === "avisar-volume" && d.quantidade).toBe(21);
  });

  /**
   * A faixa existe porque não há estado para coordenar: com igualdade exata,
   * duas gravações simultâneas veriam o mesmo número e mandariam dois avisos —
   * ou nenhuma veria e o aviso não sairia.
   */
  it("a faixa dá alguma folga, e depois silencia", () => {
    for (let n = 21; n <= 20 + LARGURA_DA_FAIXA; n += 1) {
      expect(decidir(n, 20).acao, `n=${n}`).toBe("avisar-volume");
    }
    expect(decidir(20 + LARGURA_DA_FAIXA + 1, 20).acao).toBe("silenciar");
    expect(decidir(500, 20).acao).toBe("silenciar");
  });

  it("na feira, o volume vira punhado de e-mails em vez de centenas", () => {
    // 150 cadastros numa hora: só os 20 primeiros saem individuais, mais uns
    // poucos avisos de volume. O resto é silêncio — e a cota diária sobrevive
    // para o evento importante da manhã seguinte.
    const decisoes = Array.from({ length: 150 }, (_, i) => decidir(i + 1, 20).acao);
    const enviados = decisoes.filter((a) => a === "enviar").length;
    const avisos = decisoes.filter((a) => a === "avisar-volume").length;

    expect(enviados).toBe(20);
    expect(avisos).toBeLessThanOrEqual(LARGURA_DA_FAIXA);
    expect(enviados + avisos).toBeLessThan(25);
  });
});

describe("teto configurável", () => {
  it("respeita NOTIFY_MAX_POR_HORA", () => {
    expect(tetoConfigurado("5")).toBe(5);
    expect(tetoConfigurado("100")).toBe(100);
  });

  it("ausente ou lixo cai no padrão", () => {
    expect(tetoConfigurado(undefined)).toBe(TETO_PADRAO);
    expect(tetoConfigurado("")).toBe(TETO_PADRAO);
    expect(tetoConfigurado("muitos")).toBe(TETO_PADRAO);
  });

  it("zero e negativo caem no padrão — desligar tem que ser explícito", () => {
    expect(tetoConfigurado("0")).toBe(TETO_PADRAO);
    expect(tetoConfigurado("-3")).toBe(TETO_PADRAO);
  });
});
