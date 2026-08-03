/**
 * OrigemX — evidência de que a policy de leitura pública não mudou de
 * comportamento.
 *
 *     npm run evidence:baseline   # captura o estado ANTES
 *     npm run evidence:compare    # captura o DEPOIS e compara, caso a caso
 *
 * POR QUE EXISTE: "passou de novo" não prova que nada mudou — prova que passa.
 * Um caso que saísse de "0 linhas" para "erro de permissão" continuaria PASS e
 * teria mudado comportamento. Esta comparação olha o campo `obtido` de CADA
 * caso, não o placar.
 *
 * Roda a bateria SQL aqui dentro e lê o relatório que o `test:rls` produziu,
 * para que o "antes" e o "depois" sejam gerados exatamente do mesmo jeito.
 *
 * DETERMINISMO: os scripts npm rodam `db:founder-reset` antes da captura. Sem
 * isso, a numeração do selo Criador Fundador avança a cada execução — `nextval`
 * não é transacional — e seis casos apareceriam como "MUDOU" sem que nada
 * tivesse mudado. Descoberto rodando a comparação contra um sistema intocado,
 * que é a única forma de saber se um comparador serve para alguma coisa.
 */

import { exec } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";

// `exec` com string única em vez de `execFile` com args e `shell: true`: no
// Windows o `npx` precisa de shell, e passar args separados nesse modo dispara
// DEP0190 porque eles não são escapados. Aqui o comando é constante, sem
// entrada externa.
const run = promisify(exec);

type Case = {
  suite: "bateria" | "test:rls";
  key: string;
  nome: string;
  esperado: string;
  obtido: string;
  status: string;
};

type Snapshot = {
  when: string;
  label: string;
  cases: Case[];
};

const args = process.argv.slice(2);
const outPath = argValue("--out") ?? "reports/baseline.md";
const jsonPath = outPath.replace(/\.md$/, ".json");
const comparePath = argValue("--compare");
const label = argValue("--label") ?? (comparePath ? "depois" : "antes");

function argValue(flag: string): string | null {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1]! : null;
}

/**
 * Neutraliza o que muda entre execuções sem que o comportamento tenha mudado:
 * uuid gerado, token da execução do test:rls, e o timestamp que aparece em
 * caminho de arquivo. Sem isto a comparação acusaria diferença em tudo.
 */
function normalize(text: string, runToken: string | null): string {
  let out = text.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "<uuid>",
  );
  if (runToken) out = out.split(runToken).join("<run>");
  return out.trim();
}

async function runBattery(): Promise<Case[]> {
  const { stdout } = await run("npx supabase db query --linked --file supabase/tests/battery.sql", {
    maxBuffer: 20 * 1024 * 1024,
  });

  const start = stdout.indexOf("{");
  if (start === -1) throw new Error("Bateria não devolveu JSON.");
  const parsed = JSON.parse(stdout.slice(start)) as {
    rows: Array<{ n: number; caso: string; esperado: string; obtido: string; status: string }>;
  };

  return parsed.rows.map((r) => ({
    suite: "bateria" as const,
    key: `bateria#${String(r.n).padStart(2, "0")}`,
    nome: r.caso,
    esperado: r.esperado,
    obtido: r.obtido,
    status: r.status,
  }));
}

function readRlsReport(): { cases: Case[]; runToken: string | null } {
  const raw = JSON.parse(readFileSync("reports/rls-report.json", "utf8")) as {
    run?: string;
    checks: Array<{
      cenario: string;
      verificacao: string;
      esperado: string;
      obtido: string;
      status: string;
    }>;
  };

  return {
    runToken: raw.run ?? null,
    cases: raw.checks.map((c) => ({
      suite: "test:rls" as const,
      key: `rls#${c.cenario} — ${c.verificacao}`,
      nome: `${c.cenario} — ${c.verificacao}`,
      esperado: c.esperado,
      obtido: c.obtido,
      status: c.status,
    })),
  };
}

function renderSnapshot(snap: Snapshot): string {
  const linhas = snap.cases.map(
    (c) =>
      `| \`${c.key}\` | ${c.esperado.replace(/\|/g, "\\|")} | ${c.obtido.replace(/\|/g, "\\|")} | ${c.status} |`,
  );

  return [
    `# Baseline — ${snap.label}`,
    ``,
    `Capturado em ${snap.when}. ${snap.cases.length} casos.`,
    ``,
    `Valores voláteis (uuid gerado, token da execução) aparecem normalizados`,
    `como \`<uuid>\` e \`<run>\` — o que muda entre execuções sem que o`,
    `comportamento tenha mudado não pode poluir a comparação.`,
    ``,
    `| caso | esperado | obtido | status |`,
    `|---|---|---|---|`,
    ...linhas,
    ``,
  ].join("\n");
}

function renderComparison(before: Snapshot, after: Snapshot): { md: string; diffs: number } {
  const beforeMap = new Map(before.cases.map((c) => [c.key, c]));
  const afterMap = new Map(after.cases.map((c) => [c.key, c]));
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();

  const rows: string[] = [];
  let diffs = 0;

  for (const key of keys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);

    let veredito: string;
    if (!b) veredito = "**NOVO**";
    else if (!a) veredito = "**SUMIU**";
    else if (b.obtido !== a.obtido || b.status !== a.status) veredito = "**MUDOU**";
    else veredito = "igual";

    if (veredito !== "igual") diffs += 1;

    rows.push(
      `| \`${key}\` | ${(b?.obtido ?? "—").replace(/\|/g, "\\|")} | ` +
        `${(a?.obtido ?? "—").replace(/\|/g, "\\|")} | ${veredito} |`,
    );
  }

  const md = [
    `# Comparativo de comportamento — antes e depois da reescrita de \`dogs_select\``,
    ``,
    `| | |`,
    `|---|---|`,
    `| Antes | ${before.when} (${before.cases.length} casos) |`,
    `| Depois | ${after.when} (${after.cases.length} casos) |`,
    `| Divergências | **${diffs}** |`,
    ``,
    diffs === 0
      ? `Nenhum caso mudou de comportamento. Não é só que as suítes passaram —` +
        `\no texto do \`obtido\` de cada caso é idêntico ao de antes.`
      : `**${diffs} caso(s) divergiram.** Cada linha marcada abaixo precisa de` +
        `\njustificativa antes do commit.`,
    ``,
    `Casos que cobrem diretamente a policy reescrita: \`bateria#13\`,`,
    `\`bateria#14\`, \`bateria#18\`, \`bateria#19\`, e os cenários 2, 4 e 9 do`,
    `\`test:rls\`.`,
    ``,
    `| caso | obtido ANTES | obtido DEPOIS | |`,
    `|---|---|---|---|`,
    ...rows,
    ``,
  ].join("\n");

  return { md, diffs };
}

async function main() {
  console.log(`\nOrigemX — captura de comportamento (${label})\n`);

  console.log("  bateria SQL…");
  const battery = await runBattery();

  console.log("  lendo reports/rls-report.json…");
  const { cases: rlsCases, runToken } = readRlsReport();

  const cases = [...battery, ...rlsCases].map((c) => ({
    ...c,
    esperado: normalize(c.esperado, runToken),
    obtido: normalize(c.obtido, runToken),
  }));

  const snapshot: Snapshot = { when: new Date().toISOString(), label, cases };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), "utf8");

  if (!comparePath) {
    writeFileSync(outPath, renderSnapshot(snapshot), "utf8");
    console.log(`\n${cases.length} casos capturados em ${outPath}\n`);
    return;
  }

  const before = JSON.parse(
    readFileSync(comparePath.replace(/\.md$/, ".json"), "utf8"),
  ) as Snapshot;
  const { md, diffs } = renderComparison(before, snapshot);
  writeFileSync(outPath, md, "utf8");

  console.log(`\n${cases.length} casos. Divergências: ${diffs}`);
  console.log(`Comparativo em ${outPath}\n`);

  // Divergência não derruba o processo: pode ser mudança legítima e esperada.
  // Quem decide é quem lê o comparativo — mas o código de saída sinaliza.
  process.exitCode = diffs > 0 ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
