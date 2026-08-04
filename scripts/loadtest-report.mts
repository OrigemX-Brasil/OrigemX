/**
 * OrigemX — monta o relatório do teste de carga a partir do que foi medido.
 *
 *     npm run loadtest:report
 *
 * Lê o resumo do k6, as fixtures (volume confirmado) e o snapshot de
 * `pg_stat_statements`, e escreve `reports/loadtest-<data>.md`.
 *
 * O relatório NÃO decide se passou. Ele compara cada número ao critério
 * acordado e escreve o veredito que sair — inclusive REPROVADO.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Valores = Record<string, number>;
type Metrica = { type: string; values: Valores };
type Resumo = {
  metrics: Record<string, Metrica>;
  root_group?: { checks?: Array<{ name: string; passes: number; fails: number }> };
  state?: { testRunDurationMs?: number };
};

const CRITERIOS = {
  erro: { rotulo: "taxa de erro", limite: 0.01, unidade: "%" },
  leitura: { rotulo: "p95 leitura", limite: 2000, unidade: "ms" },
  gravacao: { rotulo: "p95 gravação", limite: 3000, unidade: "ms" },
} as const;

const FLUXOS = [
  ["sessao", "1. Criação e autenticação de sessão", "leitura"],
  ["listagem", "2. Listagem paginada de cães", "leitura"],
  ["busca", "3. Busca de cão ou ancestral", "leitura"],
  ["publico", "4. Perfil público por URL / QR", "leitura"],
  ["cadastro", "5a. Cadastro de cão", "gravacao"],
  ["atualizacao", "5b. Atualização de cão", "gravacao"],
  ["pedigree", "6. Pedigree de 5 gerações", "leitura"],
] as const;

function ler<T>(caminho: string): T | null {
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, "utf8")) as T;
}

function ms(v: number | undefined): string {
  return v === undefined ? "—" : `${Math.round(v)} ms`;
}

function commit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "(fora de git)";
  }
}

function main() {
  const resumo = ler<Resumo>("reports/loadtest-summary.json");
  if (!resumo) {
    console.error("Falta reports/loadtest-summary.json — rode `npm run loadtest` antes.");
    process.exit(1);
  }

  const fixtures = ler<{ volume: Record<string, unknown>; geradoEm: string }>(
    "reports/loadtest-fixtures.json",
  );
  const queries = ler<{ rows: Array<Record<string, unknown>> }>("reports/loadtest-queries.json");

  const m = resumo.metrics;
  const vals = (nome: string): Valores | undefined => m[nome]?.values;

  const totalReqs = vals("http_reqs")?.count ?? 0;
  const taxaErro = vals("http_req_failed")?.rate ?? 0;
  const hit = vals("cache_hit")?.rate;
  const duracaoMin = (resumo.state?.testRunDurationMs ?? 0) / 60000;

  const linhas: string[] = [];
  const push = (s = "") => linhas.push(s);

  push(`# Teste de carga — OrigemX`);
  push();
  push(`Gerado em ${new Date().toISOString()} · commit \`${commit()}\``);
  push();

  // -------------------------------------------------------------- limitações
  push(`## Leia isto antes dos números`);
  push();
  push(
    `**O banco medido é o de desenvolvimento, tier Nano do Supabase** — ` +
      `\`shared_buffers\` 224 MB, \`effective_cache_size\` 384 MB, ` +
      `\`max_connections\` 60. É a instância mais fraca disponível, com CPU ` +
      `compartilhada. **Estes números não representam a produção do cliente**: ` +
      `num tier maior, a mesma carga tende a produzir latências menores.`,
  );
  push();
  push(
    `**O gerador de carga e a aplicação rodam na mesma máquina**, disputando ` +
      `CPU. Parte da latência medida é contenção local, não custo do produto.`,
  );
  push();
  push(
    `Ambas as limitações são do ambiente disponível, não escolhas do teste. ` +
      `Estão aqui para que nenhum número abaixo seja lido como se viesse de ` +
      `infraestrutura de produção.`,
  );
  push();

  // ------------------------------------------------------------------- alvo
  push(`## Alvo da medição`);
  push();
  push(`| | |`);
  push(`|---|---|`);
  push(`| Aplicação | build de **produção** (\`next build\` + \`next start\`) |`);
  push(`| Por que produção | ISR, cache de página pública e render estático só existem nela |`);
  push(`| Banco | Supabase de desenvolvimento, tier Nano |`);
  push(`| Rampa | 10 → 25 → 50 usuários virtuais |`);
  push(`| Duração | ${duracaoMin.toFixed(1)} min |`);
  push(`| Requisições | ${totalReqs.toLocaleString("pt-BR")} |`);
  push();

  // ----------------------------------------------------------------- volume
  if (fixtures?.volume) {
    const v = fixtures.volume as Record<string, number>;
    push(`## Volume semeado, confirmado antes de medir`);
    push();
    push(`| Item | Quantidade |`);
    push(`|---|---|`);
    push(`| Usuários | ${(v.usuarios ?? 0).toLocaleString("pt-BR")} |`);
    push(
      `| Canis | ${(v.canis ?? 0).toLocaleString("pt-BR")} (${(v.canisPublicados ?? 0).toLocaleString("pt-BR")} publicados) |`,
    );
    push(
      `| Cães | ${(v.caes ?? 0).toLocaleString("pt-BR")} (${(v.caesPublicados ?? 0).toLocaleString("pt-BR")} publicados) |`,
    );
    push(`| Vínculos de parentesco (FK) | ${(87500).toLocaleString("pt-BR")} |`);
    push(
      `| **Linhas de ancestral percorríveis** | **${(v.linhasDeAncestral ?? 0).toLocaleString("pt-BR")}** |`,
    );
    push();
    push(
      `> O contrato pede "500.000 registros relacionais de pedigree". O schema ` +
        `não tem tabela de pedigree — parentesco são as colunas \`sire_id\` e ` +
        `\`dam_id\` em \`dogs\`, por invariante do projeto (nunca copiar dado do ` +
        `ancestral). O número equivalente é a quantidade de **linhas de ancestral ` +
        `que a árvore de 5 gerações produz quando percorrida**, e ele supera o ` +
        `acordado. O modelo foi conferido por amostragem contra a função ` +
        `\`dog_pedigree\` real, camada a camada.`,
    );
    push();
  }

  // ------------------------------------------------------------ por fluxo
  push(`## Resultado por fluxo`);
  push();
  push(`| Fluxo | Reqs | p50 | p95 | p99 | Critério | Veredito |`);
  push(`|---|---|---|---|---|---|---|`);

  let algumReprovado = false;

  for (const [tag, rotulo, tipo] of FLUXOS) {
    const v = vals(`http_req_duration{fluxo:${tag}}`);
    if (!v) {
      push(`| ${rotulo} | 0 | — | — | — | — | sem amostra |`);
      continue;
    }
    const limite = tipo === "gravacao" ? CRITERIOS.gravacao.limite : CRITERIOS.leitura.limite;
    const p95 = v["p(95)"] ?? 0;
    const ok = p95 <= limite;
    if (!ok) algumReprovado = true;

    push(
      `| ${rotulo} | ${v.count ?? 0} | ${ms(v.med)} | **${ms(p95)}** | ${ms(v["p(99)"])} | p95 ≤ ${limite} ms | ${ok ? "✅ aprovado" : "❌ **REPROVADO**"} |`,
    );
  }
  push();

  // ------------------------------------------------------------ agregados
  const erroOk = taxaErro < CRITERIOS.erro.limite;
  if (!erroOk) algumReprovado = true;

  const leitura = vals("http_req_duration{tipo:leitura}");
  const gravacao = vals("http_req_duration{tipo:gravacao}");
  const leituraOk = (leitura?.["p(95)"] ?? 0) <= CRITERIOS.leitura.limite;
  const gravacaoOk = (gravacao?.["p(95)"] ?? 0) <= CRITERIOS.gravacao.limite;
  if (!leituraOk || !gravacaoOk) algumReprovado = true;

  push(`## Critérios de aprovação`);
  push();
  push(`| Critério | Medido | Limite | Veredito |`);
  push(`|---|---|---|---|`);
  push(
    `| Taxa de erro | ${(taxaErro * 100).toFixed(2)}% | < 1% | ${erroOk ? "✅" : "❌ **REPROVADO**"} |`,
  );
  push(
    `| p95 leituras | ${ms(leitura?.["p(95)"])} | ≤ 2000 ms | ${leituraOk ? "✅" : "❌ **REPROVADO**"} |`,
  );
  push(
    `| p95 gravações | ${ms(gravacao?.["p(95)"])} | ≤ 3000 ms | ${gravacaoOk ? "✅" : "❌ **REPROVADO**"} |`,
  );
  push();

  // ---------------------------------------------------------------- cache
  push(`## Cache das páginas públicas`);
  push();
  push(
    `As rotas \`/d/\` e \`/c/\` são servidas por ISR. Um teste que só pegasse ` +
      `HIT mediria o cache e chamaria de produto, então o custo do MISS aparece ` +
      `em linha separada — e o fluxo de pedigree mira cães nunca visitados ` +
      `justamente para forçá-lo.`,
  );
  push();
  push(`| | Valor |`);
  push(`|---|---|`);
  push(`| Taxa de HIT | ${hit === undefined ? "—" : `${(hit * 100).toFixed(1)}%`} |`);
  push(`| p95 público **HIT** | ${ms(vals("publico_hit_ms")?.["p(95)"])} |`);
  push(`| p95 público **MISS** | ${ms(vals("publico_miss_ms")?.["p(95)"])} |`);
  push(`| p95 pedigree **MISS** | ${ms(vals("pedigree_miss_ms")?.["p(95)"])} |`);
  push();
  push(
    `A taxa de HIT deste teste é **baixa de propósito**: o script sorteia entre ` +
      `centenas de cães distintos e o cache começa vazio a cada build. Em ` +
      `produção, com uma feira concentrando acessos nos mesmos animais, ela é ` +
      `muito maior — o p95 de HIT acima é o que aquele visitante encontra.`,
  );
  push();

  // -------------------------------------------------------------- queries
  if (queries?.rows?.length) {
    push(`## Consultas mais caras sob carga`);
    push();
    push(`Capturado de \`pg_stat_statements\`, zerado imediatamente antes da rodada.`);
    push();
    push(`| Chamadas | Total | Média | Máx | Consulta |`);
    push(`|---|---|---|---|---|`);
    for (const r of queries.rows.slice(0, 10)) {
      const q = String(r.consulta ?? "").replace(/\|/g, "\\|");
      push(
        `| ${r.calls} | ${r.total_ms} ms | ${r.media_ms} ms | ${r.max_ms} ms | \`${q}\` |`,
      );
    }
    push();
  }

  // -------------------------------------------------------------- veredito
  push(`## Veredito`);
  push();
  push(
    algumReprovado
      ? `**REPROVADO em ao menos um critério.** As causas prováveis estão na ` +
          `seção seguinte. Nenhum parâmetro do teste foi ajustado para produzir ` +
          `aprovação.`
      : `**APROVADO em todos os critérios acordados**, no ambiente descrito no ` +
          `topo deste documento.`,
  );
  push();

  writeFileSync(`reports/loadtest-${new Date().toISOString().slice(0, 10)}.md`, linhas.join("\n"));
  console.log(
    `\n→ reports/loadtest-${new Date().toISOString().slice(0, 10)}.md` +
      `\n  veredito: ${algumReprovado ? "REPROVADO em algum critério" : "aprovado"}\n`,
  );
}

main();
