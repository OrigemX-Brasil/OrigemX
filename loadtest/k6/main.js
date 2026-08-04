import { check, sleep } from "k6";
import http from "k6/http";
import { Rate, Trend, Counter } from "k6/metrics";
import encoding from "k6/encoding";

/**
 * ============================================================================
 * OrigemX — teste de carga
 * ============================================================================
 *
 * Roda contra a BUILD DE PRODUÇÃO (`next build` + `next start`), nunca contra o
 * `next dev`: ISR, cache das páginas públicas e renderização estática só
 * existem ali, e é o que o usuário real encontra.
 *
 *   npm run loadtest
 *
 * As fixtures — credenciais, ids públicos e um cão por usuário — saem de
 * `npm run loadtest:prepare`, e os ids das Server Actions de
 * `npm run loadtest:action`, que só grava o arquivo depois de PROVAR que as
 * ações escrevem no banco.
 */

const BASE = __ENV.BASE_URL || "http://localhost:3400";
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_KEY = __ENV.SUPABASE_KEY;
const REF = SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];

const fixtures = JSON.parse(open("../../reports/loadtest-fixtures.json"));
const actions = JSON.parse(open("../../reports/loadtest-actions.json"));

// ---------------------------------------------------------------------------
// Métricas próprias
// ---------------------------------------------------------------------------

/**
 * HIT/MISS das páginas públicas.
 *
 * Sem isto o teste mediria o CDN e chamaria de produto. A taxa de acerto é
 * RESULTADO a reportar, não desculpa para um p95 bonito — por isso o fluxo de
 * pedigree mira cães nunca visitados, forçando o MISS.
 */
const cacheHit = new Rate("cache_hit");
const publicoHit = new Trend("publico_hit_ms", true);
const publicoMiss = new Trend("publico_miss_ms", true);
const pedigreeMiss = new Trend("pedigree_miss_ms", true);
const gravacoesOk = new Counter("gravacoes_confirmadas");

// ---------------------------------------------------------------------------
// Perfil de carga — o acordado: 10 → 25 → 50, 15 minutos
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    rampa: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 10 },
        { duration: "4m", target: 10 },
        { duration: "1m", target: 25 },
        { duration: "3m", target: 25 },
        { duration: "1m", target: 50 },
        { duration: "4m", target: 50 },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },

  // Os critérios de aprovação, como acordados. Não mexer para passar.
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{tipo:leitura}": ["p(95)<2000"],
    "http_req_duration{tipo:gravacao}": ["p(95)<3000"],
    // Por fluxo, para localizar quem estourou em vez de só saber que estourou.
    "http_req_duration{fluxo:sessao}": ["p(95)<2000"],
    "http_req_duration{fluxo:listagem}": ["p(95)<2000"],
    "http_req_duration{fluxo:busca}": ["p(95)<2000"],
    "http_req_duration{fluxo:publico}": ["p(95)<2000"],
    "http_req_duration{fluxo:pedigree}": ["p(95)<2000"],
    "http_req_duration{fluxo:cadastro}": ["p(95)<3000"],
    "http_req_duration{fluxo:atualizacao}": ["p(95)<3000"],
  },

  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  noConnectionReuse: false,
  discardResponseBodies: false,
};

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

/** Escopo de módulo = por VU no k6. Cada VU carrega a própria sessão. */
let sessao = null;

function meuUsuario() {
  return fixtures.usuarios[(__VU - 1) % fixtures.usuarios.length];
}

/**
 * Autentica no Supabase e monta o cookie que o `@supabase/ssr` lê.
 *
 * `fresca: true` no fluxo 1, que MEDE o login. Nos outros a sessão é
 * reaproveitada, como num navegador de verdade — reautenticar a cada página
 * inflaria o teste com trabalho que o usuário não faz.
 */
function autenticar(usuario, fresca) {
  if (!fresca && sessao) return sessao;

  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: usuario.email, password: usuario.senha }),
    {
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      tags: { fluxo: "sessao", tipo: "leitura" },
    },
  );

  check(res, { "login 200": (r) => r.status === 200 });
  if (res.status !== 200) return null;

  const corpo = res.json();
  const cookie = `sb-${REF}-auth-token=base64-${encoding.b64encode(
    JSON.stringify(corpo),
    "rawurl",
  )}`;

  if (!fresca) sessao = cookie;
  return cookie;
}

function comCookie(cookie, fluxo, tipo) {
  return { headers: { cookie }, tags: { fluxo, tipo: tipo || "leitura" } };
}

function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// ---------------------------------------------------------------------------
// Os seis fluxos
// ---------------------------------------------------------------------------

function fluxoSessao() {
  const u = meuUsuario();
  const cookie = autenticar(u, true);
  if (!cookie) return;

  const res = http.get(`${BASE}/painel`, comCookie(cookie, "sessao"));
  check(res, { "painel abre autenticado": (r) => r.status === 200 });
}

function fluxoListagem() {
  const cookie = autenticar(meuUsuario(), false);
  if (!cookie) return;

  const res = http.get(`${BASE}/painel/caes`, comCookie(cookie, "listagem"));
  check(res, { "listagem 200": (r) => r.status === 200 });
}

function fluxoBusca() {
  const cookie = autenticar(meuUsuario(), false);
  if (!cookie) return;

  // Termos que existem no volume semeado. Buscar por algo inexistente mediria
  // o caminho vazio, que é o mais barato e o menos representativo.
  const termo = sortear(["Carga L7", "Carga L6", "Carga L5", "Carga"]);
  const res = http.get(
    `${BASE}/painel/caes?q=${encodeURIComponent(termo)}`,
    comCookie(cookie, "busca"),
  );
  check(res, { "busca 200": (r) => r.status === 200 });
}

/** Perfil público por URL de QR. Sem sessão, como o visitante da feira. */
function fluxoPublico() {
  const alvoCao = Math.random() < 0.7;
  const url = alvoCao
    ? `${BASE}/d/${sortear(fixtures.caesPublicos)}`
    : `${BASE}/c/${sortear(fixtures.canisPublicos)}`;

  const res = http.get(url, { tags: { fluxo: "publico", tipo: "leitura" } });
  check(res, { "publico 200": (r) => r.status === 200 });

  const estado = (res.headers["X-Nextjs-Cache"] || "").toUpperCase();
  const acertou = estado === "HIT";
  cacheHit.add(acertou, { fluxo: "publico" });
  (acertou ? publicoHit : publicoMiss).add(res.timings.duration);
}

/**
 * Pedigree de 5 gerações, medindo o MISS.
 *
 * Mira cães da camada mais profunda, que têm árvore cheia (62 ancestrais), e
 * usa uma faixa grande para reduzir a chance de bater no que já foi gerado.
 * Um teste que só pegasse HIT reportaria o custo do cache, não o do pedigree.
 */
function fluxoPedigree() {
  const res = http.get(`${BASE}/d/${sortear(fixtures.caesProfundos)}`, {
    tags: { fluxo: "pedigree", tipo: "leitura" },
  });
  check(res, { "pedigree 200": (r) => r.status === 200 });

  const estado = (res.headers["X-Nextjs-Cache"] || "").toUpperCase();
  cacheHit.add(estado === "HIT", { fluxo: "pedigree" });
  if (estado !== "HIT") pedigreeMiss.add(res.timings.duration);
}

/**
 * Cadastro e atualização, pela Server Action DE VERDADE.
 *
 * O corpo replica o protocolo Flight do React — inclusive a linha `0`, que é a
 * lista de argumentos e sem a qual o Next responde erro sem executar nada. Ver
 * `scripts/loadtest-action.mts`, que descobriu e provou o formato.
 */
const BOUNDARY = "----OrigemXCargaBoundary7MA4YWxkTrZu0gW";

/**
 * MULTIPART À MÃO, e não pelo atalho do k6.
 *
 * `http.post(url, objeto)` no k6 codifica em `x-www-form-urlencoded`, e nesse
 * formato o Next responde **404** e não executa a ação — medido lado a lado.
 * Multipart devolve 303 e grava. Como não há arquivo no formulário, o k6 não
 * escolhe multipart sozinho, então o corpo é montado aqui.
 */
function corpoDeAcao(actionId, campos) {
  const partes = [
    ["_1_$ACTION_REF_2", ""],
    ["_1_$ACTION_2:0", JSON.stringify({ id: actionId, bound: "$@1" })],
    ["_1_$ACTION_2:1", "[{}]"],
    // Chave única por requisição. Repetir a mesma em todas as iterações seria
    // pedir para o Next tratar como reenvio do mesmo formulário.
    ["_1_$ACTION_KEY", `k${__VU}-${__ITER}-${Date.now()}`],
  ];

  for (const k of Object.keys(campos)) partes.push([`_1_${k}`, campos[k]]);
  partes.push(["0", '[{},"$K1"]']);

  let corpo = "";
  for (const [nome, valor] of partes) {
    corpo += `--${BOUNDARY}\r\n`;
    corpo += `Content-Disposition: form-data; name="${nome}"\r\n\r\n`;
    corpo += `${valor}\r\n`;
  }
  corpo += `--${BOUNDARY}--\r\n`;
  return corpo;
}

function cabecalhosDeAcao(cookie, actionId) {
  return {
    cookie,
    "Next-Action": actionId,
    accept: "text/x-component",
    "Content-Type": `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

function fluxoCadastro() {
  const u = meuUsuario();
  const cookie = autenticar(u, false);
  if (!cookie) return;

  const nome = `Carga LT ${__VU}-${__ITER}-${Date.now()}`;
  const res = http.post(
    `${BASE}/painel/caes/novo`,
    corpoDeAcao(actions.criar, {
      name: nome,
      sex: "male",
      breed: "Fila Brasileiro",
      kennel_id: u.kennelId,
      born_on: "",
      color: "",
      coat: "",
      slug: "",
      sire_id: "",
      dam_id: "",
    }),
    {
      headers: cabecalhosDeAcao(cookie, actions.criar),
      tags: { fluxo: "cadastro", tipo: "gravacao" },
      // Sem seguir o redirect: o 303 já É o sucesso, e seguir mediria a
      // renderização da página seguinte junto com a gravação.
      redirects: 0,
    },
  );

  const ok = check(res, {
    // 303 é o sucesso — a action redireciona depois de gravar.
    "cadastro gravou (303)": (r) => r.status === 303,
    "cadastro nao devolveu excecao": (r) => r.body.indexOf('"digest"') === -1,
  });
  if (ok) gravacoesOk.add(1);
}

function fluxoAtualizacao() {
  const u = meuUsuario();
  const cookie = autenticar(u, false);
  if (!cookie) return;

  const res = http.post(
    `${BASE}/painel/caes/${u.dogId}`,
    corpoDeAcao(actions.atualizar, {
      id: u.dogId,
      name: `Carga Editado ${__VU}-${__ITER}`,
      sex: "male",
      breed: "Fila Brasileiro",
      kennel_id: u.kennelId,
      born_on: "",
      color: "",
      coat: "",
      slug: "",
      sire_id: "",
      dam_id: "",
    }),
    {
      headers: cabecalhosDeAcao(cookie, actions.atualizar),
      tags: { fluxo: "atualizacao", tipo: "gravacao" },
      redirects: 0,
    },
  );

  const ok = check(res, {
    // `updateDog` não redireciona: revalida e devolve 200 com o estado novo.
    "atualizacao respondeu 200": (r) => r.status === 200,
    "atualizacao nao devolveu excecao": (r) => r.body.indexOf('"digest"') === -1,
  });
  if (ok) gravacoesOk.add(1);
}

// ---------------------------------------------------------------------------
// Mistura
//
// Leitura pública domina porque é o tráfego real do produto: gente escaneando
// QR numa feira. Gravação fica com 10%, que é pouco em proporção e muito em
// volume absoluto — suficiente para o p95 de escrita significar alguma coisa.
// ---------------------------------------------------------------------------

export default function () {
  const d = Math.random();

  if (d < 0.4) fluxoPublico();
  else if (d < 0.55) fluxoPedigree();
  else if (d < 0.7) fluxoListagem();
  else if (d < 0.8) fluxoBusca();
  else if (d < 0.85) fluxoSessao();
  else if (d < 0.93) fluxoCadastro();
  else fluxoAtualizacao();

  // Pausa de leitura. Sem ela o teste vira martelo e mede saturação, não uso.
  sleep(Math.random() * 2 + 0.5);
}

export function handleSummary(data) {
  return {
    "reports/loadtest-summary.json": JSON.stringify(data, null, 2),
    stdout: resumoLegivel(data),
  };
}

function resumoLegivel(data) {
  const m = data.metrics;
  const linha = (rotulo, metrica) => {
    const v = m[metrica];
    if (!v || !v.values) return "";
    const p = v.values;
    return `  ${rotulo.padEnd(28)} p95 ${String(Math.round(p["p(95)"] || 0)).padStart(6)}ms   p99 ${String(Math.round(p["p(99)"] || 0)).padStart(6)}ms   med ${String(Math.round(p.med || 0)).padStart(5)}ms\n`;
  };

  let out = "\n─── OrigemX · teste de carga ───\n\n";
  out += `  requisições ..... ${m.http_reqs ? m.http_reqs.values.count : 0}\n`;
  out += `  falhas .......... ${m.http_req_failed ? (m.http_req_failed.values.rate * 100).toFixed(2) : "?"}%\n`;
  out += `  cache HIT ....... ${m.cache_hit ? (m.cache_hit.values.rate * 100).toFixed(1) : "?"}%\n\n`;
  out += linha("todas", "http_req_duration");
  out += linha("público HIT", "publico_hit_ms");
  out += linha("público MISS", "publico_miss_ms");
  out += linha("pedigree MISS", "pedigree_miss_ms");
  return out;
}
