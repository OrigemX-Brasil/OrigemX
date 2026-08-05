/**
 * Diagnóstico da reprovação do teste de carga.
 *
 * O k6 registrou 483 falhas em 897 tentativas de login (54%), e TODAS na
 * verificação `"login 200"` — as outras nove verificações passaram 100%. Como
 * `autenticar()` devolve `null` e aborta o fluxo quando o login falha, essas
 * requisições nunca chegaram ao Next: o que falhou foi o endpoint de token do
 * Supabase, não a aplicação.
 *
 * Este script mede a causa em vez de supor. Dispara logins em sequência contra
 * o MESMO endpoint que o k6 usa, guardando status, corpo e cabeçalhos de cada
 * um, para responder três coisas:
 *
 *   1. Qual o status da falha? (429 = limite de taxa; 400 = credencial;
 *      5xx = capacidade)
 *   2. A partir de qual requisição começa?
 *   3. Recupera sozinho depois de uma pausa?
 *
 * NÃO altera o teste nem o produto. É medição.
 *
 *   node --env-file-if-exists=.env.local scripts/loadtest-diagnose-login.mts
 */

import { readFileSync, writeFileSync } from "node:fs";

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!URL_SUPABASE || !CHAVE) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

type Usuario = { email: string; senha: string };
const fixtures = JSON.parse(readFileSync("reports/loadtest-fixtures.json", "utf8")) as {
  usuarios: Usuario[];
};

/** Quantos logins disparar na rajada, e a pausa antes da segunda rodada. */
const RAJADA = Number(process.env.RAJADA ?? 40);
const PAUSA_S = Number(process.env.PAUSA_S ?? 65);

type Tentativa = {
  n: number;
  status: number;
  ms: number;
  erro?: string;
  /** Cabeçalhos que o Supabase usa para sinalizar limite de taxa. */
  retryAfter?: string;
  ratelimit?: string;
};

async function login(usuario: Usuario, n: number): Promise<Tentativa> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CHAVE! },
      body: JSON.stringify({
        email: usuario.email,
        password: usuario.senha,
      }),
    });
    const ms = Math.round(performance.now() - t0);
    const texto = await res.text();

    let erro: string | undefined;
    if (!res.ok) {
      try {
        const j = JSON.parse(texto);
        erro = j.error_description || j.msg || j.error || j.message || texto;
      } catch {
        erro = texto.slice(0, 200);
      }
    }

    return {
      n,
      status: res.status,
      ms,
      erro,
      retryAfter: res.headers.get("retry-after") ?? undefined,
      ratelimit: res.headers.get("x-ratelimit-remaining") ?? undefined,
    };
  } catch (e) {
    return {
      n,
      status: 0,
      ms: Math.round(performance.now() - t0),
      erro: `rede: ${(e as Error).message}`,
    };
  }
}

function resumir(rodada: string, t: Tentativa[]) {
  const porStatus = new Map<number, number>();
  for (const x of t) porStatus.set(x.status, (porStatus.get(x.status) ?? 0) + 1);

  const ok = t.filter((x) => x.status === 200).length;
  console.log(`\n  ── ${rodada} ──`);
  console.log(`  ${ok}/${t.length} com 200 (${((ok / t.length) * 100).toFixed(1)}%)`);
  for (const [s, n] of [...porStatus].sort((a, b) => a[0] - b[0])) {
    console.log(`    status ${s}: ${n}`);
  }

  const primeiraFalha = t.find((x) => x.status !== 200);
  if (primeiraFalha) {
    console.log(`    primeira falha na tentativa #${primeiraFalha.n}`);
    console.log(`    mensagem: ${primeiraFalha.erro}`);
    if (primeiraFalha.retryAfter) console.log(`    retry-after: ${primeiraFalha.retryAfter}`);
  }
  return { ok, total: t.length, porStatus: Object.fromEntries(porStatus) };
}

console.log(`\n  Endpoint: ${URL_SUPABASE}/auth/v1/token`);
console.log(`  Usuários disponíveis nas fixtures: ${fixtures.usuarios.length}`);
console.log(`  Rajada: ${RAJADA} logins em sequência\n`);

// Rodada 1 — usuários DIFERENTES a cada tentativa. Se o limite for por conta,
// isto passa; se for por IP, falha do mesmo jeito. É o que separa as hipóteses.
const r1: Tentativa[] = [];
for (let i = 0; i < RAJADA; i++) {
  const u = fixtures.usuarios[i % fixtures.usuarios.length];
  const t = await login(u, i + 1);
  r1.push(t);
  process.stdout.write(t.status === 200 ? "." : "x");
}
const res1 = resumir("rodada 1 — usuários distintos, sem pausa", r1);

// Rodada 2 — depois da pausa. Responde se o bloqueio é temporal (limite de
// taxa, que recupera) ou permanente (credencial, configuração).
console.log(`\n  Pausa de ${PAUSA_S}s antes da rodada 2...`);
await new Promise((r) => setTimeout(r, PAUSA_S * 1000));

const r2: Tentativa[] = [];
for (let i = 0; i < Math.min(10, RAJADA); i++) {
  const u = fixtures.usuarios[i % fixtures.usuarios.length];
  const t = await login(u, i + 1);
  r2.push(t);
  process.stdout.write(t.status === 200 ? "." : "x");
}
const res2 = resumir(`rodada 2 — após ${PAUSA_S}s de pausa`, r2);

writeFileSync(
  "reports/loadtest-diagnose-login.json",
  JSON.stringify(
    { quando: new Date().toISOString(), RAJADA, PAUSA_S, r1, r2, res1, res2 },
    null,
    2,
  ),
);
console.log("\n  reports/loadtest-diagnose-login.json\n");
