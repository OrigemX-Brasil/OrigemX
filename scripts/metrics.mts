/**
 * OrigemX — acessos e conversões da página de captura (Anexo I.11).
 *
 *     npm run metrics                # últimos 30 dias
 *     npm run metrics -- --dias 7
 *     npm run metrics -- --json
 *
 * POR QUE UM SCRIPT E NÃO UMA TELA: o painel administrativo é item separado do
 * contrato (Anexo I.10/I.11) e ainda não existe. Estes números precisam ser
 * legíveis antes disso — o cliente vai querer saber quanto a feira rendeu na
 * segunda-feira, não depois do painel ficar pronto. Quando o painel existir, ele
 * lê a mesma tabela e este script continua valendo para conferência.
 *
 * Usa a chave secreta porque `landing_events` só é legível por admin, por
 * policy. Roda na máquina de quem opera, nunca no navegador.
 */

import { createClient } from "@supabase/supabase-js";

import {
  formatRate,
  rollupBySource,
  totals,
  type CaptureEvent,
  type EventKind,
} from "../src/modules/capture/events.ts";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL_ || !SECRET) {
  console.error(
    "Faltam variáveis. Preencha NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");

function argNumber(flag: string, fallback: number): number {
  const i = args.indexOf(flag);
  const raw = i >= 0 ? args[i + 1] : null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const dias = argNumber("--dias", 30);
const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

/** Teto de linhas por página. Nenhuma leitura sem limite, nem em script. */
const PAGE = 1000;

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });

type Row = { kind: EventKind; source: string; created_at: string };

/**
 * Lê em páginas por keyset sobre `id`.
 *
 * Um `select` sem limite nesta tabela é o único do sistema que poderia devolver
 * centenas de milhares de linhas — é a que mais cresce. A paginação aqui é a
 * mesma invariante que vale para a aplicação.
 */
async function carregar(): Promise<Row[]> {
  const linhas: Row[] = [];
  let cursor = 0;

  for (;;) {
    const { data, error } = await admin
      .from("landing_events")
      .select("id, kind, source, created_at")
      .gte("created_at", desde)
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(PAGE);

    if (error) throw new Error(error.message);
    const lote = data ?? [];
    if (lote.length === 0) break;

    for (const r of lote) {
      linhas.push({ kind: r.kind as EventKind, source: r.source, created_at: r.created_at });
    }

    cursor = Number(lote.at(-1)!.id);
    if (lote.length < PAGE) break;
  }

  return linhas;
}

function porDia(linhas: readonly Row[]) {
  const mapa = new Map<string, { views: number; signups: number }>();

  for (const linha of linhas) {
    const dia = linha.created_at.slice(0, 10);
    const entry = mapa.get(dia) ?? { views: 0, signups: 0 };
    if (linha.kind === "view") entry.views += 1;
    else entry.signups += 1;
    mapa.set(dia, entry);
  }

  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dia, v]) => ({ dia, ...v, rate: v.views > 0 ? v.signups / v.views : null }));
}

function tabela(linhas: readonly string[][]): string {
  const larguras = linhas[0]!.map((_, col) =>
    Math.max(...linhas.map((l) => (l[col] ?? "").length)),
  );

  return linhas
    .map((linha, i) => {
      const texto = linha
        .map((celula, col) =>
          col === 0 ? celula.padEnd(larguras[col]!) : celula.padStart(larguras[col]!),
        )
        .join("   ");
      // Régua abaixo do cabeçalho.
      return i === 0 ? `${texto}\n${larguras.map((w) => "-".repeat(w)).join("   ")}` : texto;
    })
    .join("\n");
}

async function main() {
  const linhas = await carregar();
  const eventos: CaptureEvent[] = linhas.map((l) => ({ kind: l.kind, source: l.source }));
  const porOrigem = rollupBySource(eventos);
  const geral = totals(porOrigem);
  const diario = porDia(linhas);

  if (asJson) {
    console.log(JSON.stringify({ desde, dias, total: geral, porOrigem, porDia: diario }, null, 2));
    return;
  }

  console.log(`\nOrigemX — página de captura, últimos ${dias} dias`);
  console.log(`desde ${desde}\n`);

  if (linhas.length === 0) {
    console.log("Nenhum evento no período.\n");
    console.log("Se a página está no ar e isto está vazio, verifique:");
    console.log("  - o pixel /api/e responde 200 e devolve image/gif;");
    console.log("  - o proxy não está redirecionando /api/e para o login;");
    console.log("  - a migration landing_events foi aplicada.\n");
    return;
  }

  console.log("POR ORIGEM");
  console.log(
    tabela([
      ["origem", "acessos", "cadastros", "conversão"],
      ...porOrigem.map((r) => [r.source, String(r.views), String(r.signups), formatRate(r.rate)]),
      ["TOTAL", String(geral.views), String(geral.signups), formatRate(geral.rate)],
    ]),
  );

  console.log("\nPOR DIA");
  console.log(
    tabela([
      ["dia", "acessos", "cadastros", "conversão"],
      ...diario.map((d) => [d.dia, String(d.views), String(d.signups), formatRate(d.rate)]),
    ]),
  );

  console.log(
    "\nAcesso é carregamento do pixel na página de captura, com robô conhecido já\n" +
      "descartado. Cadastro é conta criada — por e-mail ou por Google.\n" +
      "Conversão é agregada por origem: não há vínculo entre um acesso e um cadastro,\n" +
      "porque nada pessoal é gravado.\n",
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
