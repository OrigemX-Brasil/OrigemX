/**
 * ============================================================================
 * Medição da página de captura — lógica pura.
 * ============================================================================
 *
 * Anexo I.11: "medição básica de acessos e conversões na página de captura".
 *
 * O DESENHO INTEIRO PARTE DE UMA RESTRIÇÃO: não guardar nada que identifique
 * uma pessoa. Sem cookie, sem IP, sem user agent persistido, sem id de sessão.
 * Um evento diz "houve um acesso desta origem, neste caminho, nesta hora" — e
 * mais nada.
 *
 * Isso custa uma coisa e economiza duas. Custa a atribuição individual: não dá
 * para dizer que *aquele* visitante virou *aquele* cadastro. Economiza o banner
 * de consentimento — que atrasaria justamente a página que precisa abrir rápido
 * em 4G congestionado — e economiza a responsabilidade de guardar dado pessoal
 * de milhares de pessoas que só escanearam um QR numa feira.
 *
 * A conversão sai em AGREGADO: acessos de uma origem contra cadastros da mesma
 * origem. É o que o contrato pede.
 *
 * Nada aqui fala com banco nem lê `process.env`.
 */

/** Origem de quem chegou sem nenhuma marcação na URL. */
export const DEFAULT_SOURCE = "direto";

/** Acesso ao pixel vindo de fora do nosso domínio. */
export const EXTERNAL_SOURCE = "externo";

/**
 * O parâmetro que carrega a origem. Curto de propósito: ele entra na URL
 * impressa dentro do QR, e cada caractere a mais aumenta a densidade do código.
 * `?de=feira` contra `?utm_source=feira` são 8 caracteres de diferença.
 */
export const SOURCE_PARAM = "de";

/** Espelham os CHECKs de `landing_events`. Cortar aqui evita erro de INSERT. */
export const MAX_SOURCE_LENGTH = 40;
export const MAX_PATH_LENGTH = 200;

export type EventKind = "view" | "signup";

/**
 * Normaliza a origem vinda da URL.
 *
 * O valor nasce de dado externo — qualquer pessoa pode abrir
 * `/?de=<o-que-quiser>`. Reduzir a um alfabeto pequeno é o que impede a tabela
 * de virar depósito de texto arbitrário, e é o que faz `?de=Feira`, `?de=FEIRA`
 * e `?de=feira ` contarem como a mesma origem em vez de três linhas no
 * relatório.
 */
export function normalizeSource(raw: string | null | undefined): string {
  if (typeof raw !== "string") return DEFAULT_SOURCE;

  const clean = raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SOURCE_LENGTH)
    .replace(/-+$/g, "");

  return clean.length > 0 ? clean : DEFAULT_SOURCE;
}

/** Corta o caminho no teto da coluna e recusa o que não for caminho. */
export function normalizePath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  return raw.slice(0, MAX_PATH_LENGTH);
}

/**
 * O caminho da página de captura. Só acesso a ELA vira `view`.
 *
 * Ver `isCapturePath`.
 */
export const CAPTURE_PATH = "/";

/**
 * O acesso veio mesmo da página de captura?
 *
 * ISTO EXISTE POR CAUSA DE UM BUG REAL, achado na auditoria de performance. O
 * convite ao cadastro no rodapé de `/d/` e `/c/` aponta para a captura; com o
 * prefetch do Next ligado, o payload dela era baixado ali, o React processava o
 * `<img src="/api/e">` que vem dentro e o pixel disparava. Um acesso ao perfil
 * de um cão era contado como acesso à landing.
 *
 * O prefetch foi desligado nesses links, mas essa correção depende de ninguém
 * reativá-lo por engano seis meses depois. Esta checagem torna a métrica correta
 * por CONSTRUÇÃO: não importa quem chame o pixel, só conta quem estava na
 * página de captura.
 */
export function isCapturePath(path: string): boolean {
  return path === CAPTURE_PATH;
}

export type RefererInfo = { path: string; source: string };

/**
 * De onde o pixel foi carregado.
 *
 * O `Referer` é o único jeito de o pixel saber a origem sem JavaScript e sem a
 * página deixar de ser estática: o HTML servido pelo CDN é idêntico para todo
 * mundo, então a URL do pixel não pode carregar o `?de=`. O navegador manda a
 * URL completa em requisição de mesma origem, e é de lá que ela sai.
 *
 * COMPARA SÓ O HOSTNAME, não a origem inteira: em desenvolvimento a porta muda
 * o tempo todo, e exigir porta igual reprovaria acesso legítimo. Domínio
 * diferente vira `externo` — sem isso, alguém embutindo nosso pixel em outro
 * site escreveria o caminho DELE na nossa tabela.
 */
export function readReferer(referer: string | null | undefined, siteHost?: string): RefererInfo {
  if (!referer) return { path: "/", source: DEFAULT_SOURCE };

  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return { path: "/", source: DEFAULT_SOURCE };
  }

  if (siteHost && url.hostname.toLowerCase() !== siteHost.toLowerCase()) {
    return { path: "/", source: EXTERNAL_SOURCE };
  }

  return {
    path: normalizePath(url.pathname),
    source: normalizeSource(url.searchParams.get(SOURCE_PARAM)),
  };
}

/**
 * Robô conhecido.
 *
 * O user agent é LIDO e DESCARTADO — decide se a linha existe e nunca é
 * gravado. Sem esta peneira, o número entregue ao cliente seria a soma de
 * visitantes reais com o Googlebot e com o pré-carregador de link do WhatsApp,
 * que dispara toda vez que alguém cola a URL numa conversa.
 *
 * A lista não é exaustiva e não precisa ser: pega o volume, e "medição básica"
 * não promete exatidão de auditoria.
 */
const BOT_PATTERN = new RegExp(
  [
    // Buscadores e rastreadores
    "bot|crawl|spider|slurp|bingpreview|lighthouse|pingdom|monitor|uptime",
    // Pré-visualização de link: dispara toda vez que alguém cola a URL num chat
    "facebookexternalhit|whatsapp|telegram|discord|slack|preview|embed",
    // Ferramentas de linha de comando
    "curl|wget|httpie|postman|insomnia",
    /**
     * Runtimes de linguagem. Entrou depois de o teste ponta a ponta flagrar
     * que o `fetch` do Node manda `user-agent: node` e passava como visitante —
     * qualquer script simples inflaria o número entregue ao cliente.
     */
    "^node$|node-fetch|undici|axios|okhttp|go-http-client|java/|libwww|httpclient",
    "python|ruby|perl|php|dart:io",
    // Navegador dirigido por automação
    "headless|phantomjs|puppeteer|playwright|selenium|scrap",
  ].join("|"),
  "i",
);

export function isBot(userAgent: string | null | undefined): boolean {
  if (typeof userAgent !== "string" || userAgent.trim().length === 0) {
    // Sem user agent é quase sempre script. Um navegador de verdade sempre
    // manda o dele.
    return true;
  }
  return BOT_PATTERN.test(userAgent);
}

/**
 * A origem de um cadastro.
 *
 * A regra de precedência resolve o problema que a página estática cria: `/` é
 * servida do CDN e não pode saber se foi aberta como `/` ou como `/?de=feira`,
 * então o link para o cadastro não pode cravar a origem. Ela é recuperada no
 * `/cadastro`, que é dinâmico e enxerga o `Referer` — em navegação de mesma
 * origem o navegador manda a URL completa, com a query string.
 *
 * O parâmetro EXPLÍCITO vence o referer: é como as páginas públicas de cão e
 * canil marcam a origem `perfil`, e é o que permite ao cliente montar um link
 * direto para o cadastro sem depender de referer nenhum.
 *
 * Referer é dado que o navegador PODE não mandar — extensão de privacidade,
 * política mais restrita, app que abre link sem referer. Nesse caso o cadastro
 * conta como `direto`, e o acesso continua contado na origem certa. O efeito é
 * subestimar a conversão de uma campanha, nunca inventar conversão para outra.
 */
export function resolveSignupSource(
  explicit: string | null | undefined,
  referer: string | null | undefined,
  siteHost?: string,
): string {
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return normalizeSource(explicit);
  }
  return readReferer(referer, siteHost).source;
}

/**
 * Janela para considerar que a conta acabou de nascer.
 *
 * No retorno do OAuth não existe sinal explícito de "cadastro" contra "login":
 * o Google devolve o mesmo `code` nos dois casos, e o Supabase cria a conta
 * silenciosamente quando ela não existe. O que sobra é a idade da conta.
 *
 * Dois minutos é folgado para o ida e volta do consentimento e curto demais
 * para pegar quem já era usuário — a conta de um visitante recorrente tem dias
 * ou meses. O falso positivo possível é alguém que criou a conta agora, saiu e
 * entrou de novo pelo Google dentro da janela; conta duas vezes, e é raro o
 * bastante para "medição básica".
 */
export const NEW_ACCOUNT_WINDOW_MS = 2 * 60 * 1000;

export function isNewAccount(
  createdAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (typeof createdAt !== "string") return false;

  const ts = Date.parse(createdAt);
  if (Number.isNaN(ts)) return false;

  const idade = now - ts;
  // Relógio adiantado no servidor de auth daria idade negativa; ainda é conta
  // nova, e descartar por causa disso perderia conversão de verdade.
  return idade <= NEW_ACCOUNT_WINDOW_MS && idade >= -NEW_ACCOUNT_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

export type CaptureEvent = { kind: EventKind; source: string };

export type SourceRollup = {
  source: string;
  views: number;
  signups: number;
  /**
   * Cadastros por acesso, de 0 a 1. `null` quando não houve acesso: conversão
   * de zero acessos é indefinida, não zero por cento. Escrever 0% ali seria
   * afirmar um fracasso que não foi medido.
   */
  rate: number | null;
};

/**
 * Agrega por origem, da mais acessada para a menos.
 *
 * Uma origem que só tem cadastro e nenhum acesso aparece mesmo assim — some-la
 * esconderia um furo de medição (pixel bloqueado, por exemplo) justamente onde
 * ele importa.
 */
export function rollupBySource(events: readonly CaptureEvent[]): SourceRollup[] {
  const bySource = new Map<string, { views: number; signups: number }>();

  for (const event of events) {
    const entry = bySource.get(event.source) ?? { views: 0, signups: 0 };
    if (event.kind === "view") entry.views += 1;
    else if (event.kind === "signup") entry.signups += 1;
    bySource.set(event.source, entry);
  }

  return [...bySource.entries()]
    .map(([source, { views, signups }]) => ({
      source,
      views,
      signups,
      rate: views > 0 ? signups / views : null,
    }))
    .sort((a, b) => b.views - a.views || b.signups - a.signups || a.source.localeCompare(b.source));
}

export type CaptureTotals = { views: number; signups: number; rate: number | null };

export function totals(rows: readonly SourceRollup[]): CaptureTotals {
  const views = rows.reduce((acc, r) => acc + r.views, 0);
  const signups = rows.reduce((acc, r) => acc + r.signups, 0);
  return { views, signups, rate: views > 0 ? signups / views : null };
}

/** Percentual legível. Uma casa decimal — a segunda não muda decisão nenhuma. */
export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}
