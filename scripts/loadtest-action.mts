/**
 * OrigemX — descobre os ids das Server Actions de cão e PROVA que gravam.
 *
 *     npm run loadtest:action -- --base http://localhost:3400
 *
 * POR QUE ISTO EXISTE: o fluxo 5 do teste de carga (cadastro e atualização) não
 * passa por rota HTTP nossa — passa por Server Action do Next, que é um POST
 * para a própria URL com o header `Next-Action: <id>`. O id é gerado no build e
 * não está documentado em lugar nenhum.
 *
 * A DESCOBERTA É EMPÍRICA, e de propósito. Em vez de tentar adivinhar qual id
 * corresponde a qual função lendo o bundle — que dependeria do formato interno
 * do Next e quebraria calado na próxima versão —, o script COLETA todos os
 * candidatos e testa um por um até um deles criar um cão de verdade no banco.
 *
 * Se nenhum gravar, ele FALHA com código != 0. Sem isso o k6 mediria um POST
 * que devolve 200 sem fazer nada, e o relatório entregaria ao cliente uma
 * latência de gravação que não gravou coisa nenhuma.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;

const args = process.argv.slice(2);
const BASE = args[args.indexOf("--base") + 1] ?? "http://localhost:3400";
const REF = new URL(URL_).hostname.split(".")[0]!;

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
const anon = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });

type Fixtures = {
  usuarios: Array<{ email: string; senha: string; kennelId: string; dogId: string }>;
};

function falhar(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function cookieDeSessao(email: string, senha: string): Promise<string> {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) falhar(`login falhou para ${email}: ${error?.message}`);
  const valor = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  return `sb-${REF}-auth-token=${valor}`;
}

/** Todos os ids de Server Action alcançáveis a partir da página. */
async function candidatos(cookie: string, caminho: string): Promise<string[]> {
  const html = await (await fetch(`${BASE}${caminho}`, { headers: { cookie } })).text();

  const chunks = [...html.matchAll(/<script src="([^"]+\.js)"/g)].map((m) => m[1]!);
  const ids = new Set<string>();

  for (const chunk of chunks) {
    const js = await (await fetch(`${BASE}${chunk}`)).text();
    for (const m of js.matchAll(/"([0-9a-f]{40,44})"/g)) ids.add(m[1]!);
  }

  return [...ids];
}

/**
 * Um POST de Server Action, exatamente como o navegador manda.
 *
 * O FORMATO FOI CAPTURADO DE UM SUBMIT REAL, com o Playwright interceptando a
 * requisição — não deduzido da documentação. Um `useActionState` não envia só
 * os campos do formulário: envia também o descritor da ação e o ESTADO
 * ANTERIOR, porque a assinatura no servidor é `(prevState, formData)`.
 *
 *   _1_$ACTION_REF_2   vazio
 *   _1_$ACTION_2:0     {"id":"<id>","bound":"$@1"}   ← aponta para a linha abaixo
 *   _1_$ACTION_2:1     [{}]                          ← o prevState, aqui vazio
 *   _1_$ACTION_KEY     k<hex>
 *   _1_<campo>         valor                         ← os campos, com prefixo
 *   0                  [{},"$K1"]                    ← a LISTA DE ARGUMENTOS
 *
 * O ÚLTIMO CAMPO É O QUE FECHA O STREAM, e foi o que faltou na primeira
 * tentativa: `0` é a linha raiz do protocolo Flight — `{}` é o `prevState` e
 * `$K1` referencia o FormData de prefixo `1`. Sem ele o React fica esperando
 * uma linha que nunca chega e a action morre com "Connection closed", que no
 * cliente aparece como um 500 sem explicação nenhuma.
 */
function corpoDeAcao(actionId: string, campos: Record<string, string>): FormData {
  const form = new FormData();

  form.append("_1_$ACTION_REF_2", "");
  form.append("_1_$ACTION_2:0", JSON.stringify({ id: actionId, bound: "$@1" }));
  form.append("_1_$ACTION_2:1", "[{}]");
  form.append("_1_$ACTION_KEY", `k${Math.random().toString(16).slice(2).padEnd(32, "0")}`);

  for (const [k, v] of Object.entries(campos)) form.append(`_1_${k}`, v);

  // Por último, como o navegador manda.
  form.append("0", '[{},"$K1"]');
  return form;
}

async function postarAcao(
  cookie: string,
  caminho: string,
  actionId: string,
  campos: Record<string, string>,
): Promise<{ status: number; corpo: string }> {
  const res = await fetch(`${BASE}${caminho}`, {
    method: "POST",
    headers: { cookie, "Next-Action": actionId, accept: "text/x-component" },
    body: corpoDeAcao(actionId, campos),
    redirect: "manual",
  });

  return { status: res.status, corpo: (await res.text()).slice(0, 400) };
}

async function main() {
  const fixtures = JSON.parse(readFileSync("reports/loadtest-fixtures.json", "utf8")) as Fixtures;

  const user = fixtures.usuarios[0];
  if (!user) falhar("sem usuários nas fixtures — rode `npm run loadtest:prepare` antes.");

  const cookie = await cookieDeSessao(user.email, user.senha);
  console.log(`\nOrigemX — descoberta das Server Actions\n  base: ${BASE}\n`);

  // ------------------------------------------------------------------ criar
  const idsNovo = await candidatos(cookie, "/painel/caes/novo");
  console.log(`  candidatos em /painel/caes/novo: ${idsNovo.length}`);

  const marca = `Acao ${Date.now().toString(36)}`;
  let idCriar: string | null = null;

  for (const id of idsNovo) {
    const nome = `${marca} ${id.slice(0, 6)}`;
    const r = await postarAcao(cookie, "/painel/caes/novo", id, {
      name: nome,
      sex: "male",
      breed: "Fila Brasileiro",
      kennel_id: user.kennelId,
      born_on: "",
      color: "",
      coat: "",
      slug: "",
      sire_id: "",
      dam_id: "",
    });

    if (r.status >= 500) continue;

    // A PROVA: a linha existe no banco? Status 200 não basta — o Next devolve
    // 200 para action inexistente também.
    const { data } = await admin.from("dogs").select("id").eq("name", nome).maybeSingle();
    if (data) {
      idCriar = id;
      await admin.from("dogs").delete().eq("id", data.id);
      console.log(`  ✓ createDog = ${id}`);
      break;
    }
  }

  if (!idCriar) {
    falhar(
      "Nenhum candidato criou um cão.\n" +
        "  O formato da Server Action do Next mudou, ou o corpo esperado é outro.\n" +
        "  NÃO siga para o teste de carga: o fluxo de gravação mediria um POST\n" +
        "  que responde 200 sem gravar nada.",
    );
  }

  // -------------------------------------------------------------- atualizar
  const caminhoEdicao = `/painel/caes/${user.dogId}`;
  const idsEdicao = await candidatos(cookie, caminhoEdicao);
  console.log(`  candidatos em ${caminhoEdicao}: ${idsEdicao.length}`);

  const { data: antes } = await admin
    .from("dogs")
    .select("name, sex, breed, kennel_id")
    .eq("id", user.dogId)
    .single();

  const novoNome = `${marca} editado`;
  let idAtualizar: string | null = null;

  for (const id of idsEdicao) {
    if (id === idCriar) continue;

    const r = await postarAcao(cookie, caminhoEdicao, id, {
      id: user.dogId,
      name: novoNome,
      sex: antes!.sex,
      breed: antes!.breed ?? "Fila Brasileiro",
      kennel_id: antes!.kennel_id ?? "",
      born_on: "",
      color: "",
      coat: "",
      slug: "",
      sire_id: "",
      dam_id: "",
    });

    if (r.status >= 500) continue;

    const { data } = await admin.from("dogs").select("name").eq("id", user.dogId).single();
    if (data?.name === novoNome) {
      idAtualizar = id;
      // Devolve o nome original: o teste de carga vai reeditar, e um estado
      // sujo aqui viraria diferença silenciosa entre execuções.
      await admin.from("dogs").update({ name: antes!.name }).eq("id", user.dogId);
      console.log(`  ✓ updateDog = ${id}`);
      break;
    }
  }

  if (!idAtualizar) falhar("Nenhum candidato atualizou o cão.");

  writeFileSync(
    "reports/loadtest-actions.json",
    JSON.stringify(
      { geradoEm: new Date().toISOString(), base: BASE, criar: idCriar, atualizar: idAtualizar },
      null,
      2,
    ),
    "utf8",
  );

  console.log("\n  → reports/loadtest-actions.json");
  console.log("  As duas ações gravaram de verdade no banco.\n");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
