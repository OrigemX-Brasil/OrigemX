/**
 * OrigemX — backfill do selo "Criador Fundador" para canis pré-existentes.
 *
 *     npm run founder:backfill            # relatório, sem alterar nada
 *     npm run founder:backfill -- --apply # gera o SQL de aplicação (não roda)
 *
 * PARA QUE SERVE: canis que já cumprem a elegibilidade (nome, cidade, estado,
 * logo, ao menos 1 cão) mas nunca passaram pelas triggers que atribuem o
 * `founder_number` — o caso típico é elegibilidade completada antes de a
 * trigger existir. `20260803034530_founder_badge.sql` já fez este mesmo
 * backfill uma vez, no momento em que foi aplicada; isto é o mesmo processo,
 * sob demanda, para quem ficou de fora desde então.
 *
 * POR QUE ISTO NÃO CHAMA `.rpc("try_assign_founder_number")`: a função foi
 * revogada de public/anon/authenticated (`20260803034530_founder_badge.sql:177`)
 * e NUNCA teve grant para `service_role` — só é alcançável de dentro das três
 * triggers de disparo. Não há chamada client-side possível, nem com a chave
 * secreta. O modo `--apply` deste script por isso não muta o banco: ele
 * GERA um arquivo `.sql` com um bloco `do $$ ... $$` que chama
 * `try_assign_founder_number` para cada canil revisado, no mesmo padrão do
 * backfill original — e você roda esse arquivo com
 * `npx supabase db query --linked --file <arquivo>`, o mesmo mecanismo que
 * `npm run db:founder-reset` já usa neste projeto. A função em si decide
 * tudo (elegibilidade, imutabilidade, sequence); este script só decide QUEM
 * entra na lista e em que ORDEM.
 *
 * SEM TETO: a sequence `kennel_founder_seq` não tem mais `maxvalue`
 * (`20260806234150_founder_number_sem_teto.sql`) — o script não bloqueia em
 * 100, só informa quantos números já existem e quantos seriam emitidos.
 *
 * Usa a chave secreta de propósito: precisa enxergar mídia e cães de
 * qualquer dono para replicar a elegibilidade, não só a de uma sessão.
 */

import { mkdir, writeFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL || !SECRET) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.");
  process.exit(2);
}

const apply = process.argv.includes("--apply");

const admin = createClient(URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Candidato = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  hidden_at: string | null;
  created_at: string;
  owner: { full_name: string | null } | { full_name: string | null }[] | null;
};

function nomeDoDono(owner: Candidato["owner"]): string {
  const row = Array.isArray(owner) ? owner[0] : owner;
  return row?.full_name ?? "(sem nome no perfil)";
}

function preenchido(v: string | null): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function comentario(texto: string): string {
  // Nome de canil não deveria ter quebra de linha, mas um comentário SQL
  // quebrado no meio vazaria o resto da linha para fora do `--`.
  return texto.replace(/[\r\n]+/g, " ");
}

async function main() {
  console.log(`\nOrigemX — backfill do selo Criador Fundador`);
  console.log(`Projeto: ${URL}`);
  console.log(apply ? "Modo: GERAR SQL de aplicação\n" : "Modo: relatório (use --apply para gerar o SQL)\n");

  // Mesmo critério de "publicado/ativo" usado no admin: não deletado e já
  // publicado. A migration original não filtrava por publicação — ela
  // decidia tudo dentro de `kennel_is_founder_eligible`, que também não
  // filtra — mas para REVISÃO HUMANA um canil ainda rascunho é ruído: se ele
  // for elegível, a própria trigger de `kennels`/`media`/`dogs` já teria
  // atribuído o número na primeira ação que o tornou elegível.
  const { data: candidatos, error: candidatosError } = await admin
    .from("kennels")
    .select(
      "id, name, slug, city, state, hidden_at, created_at, owner:profiles!kennels_owner_id_fkey(full_name)",
    )
    .is("founder_number", null)
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (candidatosError) {
    console.error("Não foi possível ler kennels:", candidatosError.message);
    process.exitCode = 1;
    return;
  }

  const linhas = (candidatos ?? []) as Candidato[];

  if (linhas.length === 0) {
    console.log("Nenhum canil publicado e ativo está sem founder_number. Nada a fazer.");
    process.exitCode = 0;
    return;
  }

  const ids = linhas.map((k) => k.id);

  // Duas consultas em lote, não uma por canil — mesma réplica de
  // `kennel_is_founder_eligible` (20260803034530_founder_badge.sql:82-109),
  // nunca um critério novo.
  const [{ data: logos }, { data: caes }] = await Promise.all([
    admin
      .from("media")
      .select("kennel_id")
      .in("kennel_id", ids)
      .eq("role", "kennel_logo")
      .is("deleted_at", null),
    admin.from("dogs").select("kennel_id").in("kennel_id", ids).is("deleted_at", null),
  ]);

  const temLogo = new Set((logos ?? []).map((m) => m.kennel_id).filter((id): id is string => Boolean(id)));
  const temCao = new Set((caes ?? []).map((d) => d.kennel_id).filter((id): id is string => Boolean(id)));

  const elegiveis: Candidato[] = [];
  const excluidos: { canil: Candidato; faltando: string[] }[] = [];

  for (const k of linhas) {
    const faltando: string[] = [];
    if (!preenchido(k.city)) faltando.push("cidade");
    if (!preenchido(k.state)) faltando.push("estado");
    if (!temLogo.has(k.id)) faltando.push("logo");
    if (!temCao.has(k.id)) faltando.push("cão");

    if (faltando.length === 0) elegiveis.push(k);
    else excluidos.push({ canil: k, faltando });
  }

  const { count: jaNumerados } = await admin
    .from("kennels")
    .select("id", { count: "exact", head: true })
    .not("founder_number", "is", null);

  const { data: maiorNumero } = await admin
    .from("kennels")
    .select("founder_number")
    .not("founder_number", "is", null)
    .order("founder_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log(`ELEGÍVEIS — receberiam número nesta ordem (created_at, mais antigo primeiro):\n`);
  if (elegiveis.length === 0) {
    console.log("  nenhum\n");
  } else {
    elegiveis.forEach((k, i) => {
      const oculto = k.hidden_at ? "  [OCULTO por moderação — reveja se é isso que você quer]" : "";
      console.log(
        `  ${i + 1}. ${k.name}  (${k.slug})\n` +
          `     ${k.city ?? "?"}/${k.state ?? "?"} · dono: ${nomeDoDono(k.owner)} · cadastrado em ${k.created_at.slice(0, 10)}${oculto}`,
      );
    });
    console.log("");
  }

  console.log(`FORA DA LISTA — não elegíveis hoje, e por quê:\n`);
  if (excluidos.length === 0) {
    console.log("  nenhum\n");
  } else {
    for (const { canil, faltando } of excluidos) {
      console.log(`  ${canil.name}  (${canil.slug})  — falta: ${faltando.join(", ")}`);
    }
    console.log("");
  }

  console.log(
    `Resumo: ${jaNumerados ?? 0} canis já numerados hoje (maior número emitido: ${maiorNumero?.founder_number ?? "nenhum"}). ` +
      `${elegiveis.length} ganhariam número agora, ficando ${(jaNumerados ?? 0) + elegiveis.length} no total. ` +
      `Sem teto no banco desde 20260806234150 — nada aqui é bloqueado por causa disso, só informado.`,
  );

  if (!apply) {
    console.log(`\nRode com --apply para gerar o SQL de aplicação (não é executado por este script).`);
    process.exitCode = 0;
    return;
  }

  if (elegiveis.length === 0) {
    console.log("\nNada elegível — nenhum arquivo de aplicação gerado.");
    process.exitCode = 0;
    return;
  }

  const arrayLiteral = elegiveis
    .map((k, i) => {
      const virgula = i === elegiveis.length - 1 ? "" : ",";
      return `    '${k.id}'${virgula} -- ${comentario(k.name)} (${k.created_at.slice(0, 10)})`;
    })
    .join("\n");

  const idsParaConferencia = elegiveis.map((k) => `'${k.id}'`).join(", ");

  const sql = `-- =============================================================================
-- OrigemX — backfill do selo Criador Fundador
--
-- Gerado por scripts/founder-backfill.mts em ${new Date().toISOString()}
-- Projeto de origem: ${URL}
--
-- ANTES DE RODAR: confirme que \`npx supabase projects list\` (ou
-- \`migration list --linked\`) aponta para O MESMO projeto acima. Este
-- projeto já teve a CLI ligada à conta errada antes.
--
-- Só chama a função de atribuição já existente — nunca escreve
-- founder_number direto. Idempotente: try_assign_founder_number reavalia
-- elegibilidade e trava a linha por dentro, então rodar de novo não
-- duplica nem força número em quem deixou de ser elegível nesse intervalo.
--
--     npx supabase db query --linked --file <este arquivo>
-- =============================================================================

do $$
declare
  v_ordem uuid[] := array[
${arrayLiteral}
  ]::uuid[];
  v_id uuid;
begin
  foreach v_id in array v_ordem loop
    perform public.try_assign_founder_number(v_id);
  end loop;
end $$;

-- Conferência pós-execução — todo canil da lista deveria sair com número.
select id, name, founder_number
  from public.kennels
 where id in (${idsParaConferencia})
 order by created_at;
`;

  await mkdir("reports", { recursive: true });
  const arquivo = `reports/founder-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
  await writeFile(arquivo, sql, "utf8");

  console.log(`\nSQL gerado em ${arquivo} — revise antes de rodar.`);
  console.log(`Comando: npx supabase db query --linked --file ${arquivo}`);
  process.exitCode = 0;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
