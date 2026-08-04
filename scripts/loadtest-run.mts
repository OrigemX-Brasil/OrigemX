/**
 * OrigemX — executa o teste de carga e captura as queries sob pressão.
 *
 *     npm run loadtest                 # a rodada acordada: 10→25→50, 15 min
 *     npm run loadtest -- --smoke      # 30s com 3 VUs, para conferir o script
 *
 * Faz três coisas que o k6 sozinho não faria:
 *
 *   1. zera `pg_stat_statements` ANTES, para o snapshot depois refletir só a
 *      carga e não o histórico do banco;
 *   2. roda o k6 com as variáveis que o script espera;
 *   3. captura as consultas mais caras DEPOIS, enquanto o estado ainda é o da
 *      medição — qualquer `reset` fora de hora apagaria a evidência.
 *
 * O k6 é BINÁRIO, baixado à parte. Não é dependência npm e não entra no
 * `package-lock`; o caminho vem de `K6_BIN`.
 */

import { exec } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(exec);

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const args = process.argv.slice(2);
const iBase = args.indexOf("--base");
const BASE = iBase >= 0 && args[iBase + 1] ? args[iBase + 1]! : "http://localhost:3400";
const SMOKE = args.includes("--smoke");

const K6 = process.env.K6_BIN;

async function consultar(sql: string, saida: string): Promise<void> {
  mkdirSync("reports/tmp", { recursive: true });
  const arquivo = `reports/tmp/${saida}.sql`;
  writeFileSync(arquivo, sql, "utf8");

  const { stdout } = await run(`npx supabase db query --linked --file ${arquivo}`, {
    maxBuffer: 20 * 1024 * 1024,
  });

  const inicio = stdout.indexOf("{");
  if (inicio === -1) return;
  writeFileSync(`reports/${saida}.json`, stdout.slice(inicio), "utf8");
}

const TOP_QUERIES = `
select
  calls,
  round(total_exec_time::numeric, 1)  as total_ms,
  round(mean_exec_time::numeric, 2)   as media_ms,
  round((max_exec_time)::numeric, 1)  as max_ms,
  rows,
  left(regexp_replace(query, '\\s+', ' ', 'g'), 160) as consulta
from pg_stat_statements
where query not ilike '%pg_stat_statements%'
  and query not ilike '%pg_catalog%'
  and calls > 5
order by total_exec_time desc
limit 15;
`;

async function main() {
  for (const [arquivo, dica] of [
    ["reports/loadtest-fixtures.json", "npm run loadtest:prepare"],
    ["reports/loadtest-actions.json", "npm run loadtest:action"],
  ] as const) {
    if (!existsSync(arquivo)) {
      console.error(`Falta ${arquivo} — rode \`${dica}\` antes.`);
      process.exit(1);
    }
  }

  if (!K6 || !existsSync(K6)) {
    console.error(
      `k6 não encontrado.\n  Defina K6_BIN apontando para o k6.exe.\n  Recebido: ${K6 ?? "(vazio)"}`,
    );
    process.exit(1);
  }

  console.log(`\nOrigemX — teste de carga${SMOKE ? " (smoke)" : ""}`);
  console.log(`  alvo: ${BASE}\n`);

  if (!SMOKE) {
    console.log("  zerando pg_stat_statements…");
    await consultar("select pg_stat_statements_reset() is not null as ok;", "loadtest-reset");
  }

  const k6args = ["run", "loadtest/k6/main.js"];
  if (SMOKE) k6args.push("--vus", "3", "--duration", "30s", "--no-thresholds");

  const codigo = await new Promise<number>((resolve) => {
    const filho = spawn(K6, k6args, {
      stdio: "inherit",
      env: { ...process.env, BASE_URL: BASE, SUPABASE_URL: URL_, SUPABASE_KEY: PUBLISHABLE },
    });
    filho.on("exit", (c) => resolve(c ?? 1));
  });

  if (!SMOKE) {
    console.log("\n  capturando as consultas mais caras sob carga…");
    await consultar(TOP_QUERIES, "loadtest-queries");
    console.log("  → reports/loadtest-queries.json");
  }

  console.log(
    `\nk6 saiu com código ${codigo}${codigo === 99 ? " — THRESHOLD REPROVADO" : ""}\n`,
  );

  // Threshold reprovado NÃO derruba este script: o relatório ainda precisa ser
  // gerado, e a falha é o resultado a reportar, não um acidente a esconder.
  process.exitCode = 0;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
