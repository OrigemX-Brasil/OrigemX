/**
 * OrigemX — confere o volume semeado e exporta as fixtures do teste de carga.
 *
 *     npm run loadtest:prepare
 *
 * Roda DEPOIS de `npm run seed:load`. Faz três coisas, nesta ordem, e a
 * primeira é uma trava:
 *
 *   1. LOGIN DE VERDADE com um usuário semeado. Escrever direto em `auth.users`
 *      é rápido e é frágil: o GoTrue tem exigências que o schema não declara —
 *      quatro colunas de token que aceitam NULL no banco e derrubam o servidor
 *      de auth quando estão nulas. Se o login falhar aqui, o teste inteiro
 *      mediria 401 e chamaria de resultado.
 *   2. CONTAGEM do volume, incluindo as linhas de ancestral percorríveis — o
 *      número que o contrato chama de "registros relacionais de pedigree".
 *   3. FIXTURES para o k6 ler no `init`: credenciais, ids públicos e um cão por
 *      usuário para o fluxo de atualização.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL_ || !PUBLISHABLE || !SECRET) {
  console.error("Faltam variáveis do Supabase em .env.local.");
  process.exit(1);
}

const SENHA = "Senha-De-Carga-123";
const DOMINIO = "@origemx-carga.com";
/** VUs máximos + folga: cada VU pega um usuário distinto. */
const USUARIOS_NO_TESTE = 60;

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
const anon = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });

function falhar(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. A trava
// ---------------------------------------------------------------------------

async function conferirLogin(): Promise<void> {
  const { data, error } = await anon.auth.signInWithPassword({
    email: `carga-1${DOMINIO}`,
    password: SENHA,
  });

  if (error || !data.session?.access_token) {
    falhar(
      `Os usuários semeados NÃO conseguem entrar (${error?.status} ${error?.message}).\n` +
        `  Provável causa: colunas de token nulas em auth.users — o GoTrue as lê como\n` +
        `  string e quebra em NULL. Ver o cabeçalho de supabase/tests/seed-load.sql.\n` +
        `  Sem isto o teste de carga mediria 401 e chamaria de resultado.`,
    );
  }

  console.log("  ✓ login de usuário semeado funciona");
}

// ---------------------------------------------------------------------------
// 2. Volume
// ---------------------------------------------------------------------------

/**
 * Ancestrais de um cão por camada, com o teto de 5 gerações.
 *
 * A camada k tem 2^(k+1)-2 ancestrais até saturar em 62, que é a árvore cheia
 * de 5 gerações (2..63). Conferido por amostragem contra `dog_pedigree`.
 */
const ANCESTRAIS_POR_CAMADA = [0, 2, 6, 14, 30, 62, 62, 62];

async function contarVolume() {
  const { count: caes } = await admin
    .from("dogs")
    .select("id", { count: "exact", head: true })
    .like("name", "Carga L%");

  const { count: caesPublicados } = await admin
    .from("dogs")
    .select("id", { count: "exact", head: true })
    .like("name", "Carga L%")
    .not("published_at", "is", null);

  const { count: canis } = await admin
    .from("kennels")
    .select("id", { count: "exact", head: true })
    .like("slug", "carga-canil-%");

  const { count: canisPublicados } = await admin
    .from("kennels")
    .select("id", { count: "exact", head: true })
    .like("slug", "carga-canil-%")
    .not("published_at", "is", null);

  // Camada a camada, para calcular as linhas de ancestral sem percorrer 50 mil
  // árvores — e para conferir o modelo por amostra logo abaixo.
  const porCamada: number[] = [];
  for (let k = 0; k < ANCESTRAIS_POR_CAMADA.length; k += 1) {
    const { count } = await admin
      .from("dogs")
      .select("id", { count: "exact", head: true })
      .like("name", `Carga L${k} %`);
    porCamada.push(count ?? 0);
  }

  const linhasDeAncestral = porCamada.reduce(
    (acc, n, k) => acc + n * (ANCESTRAIS_POR_CAMADA[k] ?? 62),
    0,
  );

  const { count: usuarios } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  return { caes, caesPublicados, canis, canisPublicados, porCamada, linhasDeAncestral, usuarios };
}

/**
 * Confere o modelo analítico contra a função de verdade.
 *
 * Sem isto, "1,5 milhão de linhas de ancestral" seria aritmética minha em cima
 * de uma suposição sobre a forma da árvore. A amostra torna o número medido.
 */
async function conferirModelo(): Promise<void> {
  for (const camada of [1, 3, 5, 7]) {
    const { data: cao } = await admin
      .from("dogs")
      .select("id")
      .like("name", `Carga L${camada} %`)
      .limit(1)
      .single();

    if (!cao) continue;

    const { data: ped } = await admin.rpc("dog_pedigree", { p_dog_id: cao.id, p_generations: 5 });
    // A função devolve o sujeito junto; os ancestrais são o resto.
    const ancestrais = (ped?.length ?? 0) - 1;
    const esperado = ANCESTRAIS_POR_CAMADA[camada]!;

    if (ancestrais !== esperado) {
      falhar(
        `Camada ${camada}: a árvore real tem ${ancestrais} ancestrais, o modelo previa ${esperado}.\n` +
          `  A contagem de "registros relacionais de pedigree" do relatório sairia errada.`,
      );
    }
    console.log(`  ✓ camada ${camada}: ${ancestrais} ancestrais, como previsto`);
  }
}

// ---------------------------------------------------------------------------
// 3. Fixtures
// ---------------------------------------------------------------------------

async function montarFixtures() {
  const usuarios: Array<{ email: string; senha: string; kennelId: string; dogId: string }> = [];

  for (let i = 1; i <= USUARIOS_NO_TESTE; i += 1) {
    const email = `carga-${i}${DOMINIO}`;

    const { data: perfil } = await admin
      .from("kennels")
      .select("id, owner_id")
      .eq("slug", `carga-canil-${i}`)
      .single();

    if (!perfil) continue;

    // Um cão QUE ESTE USUÁRIO GERENCIA, para o fluxo de atualização. Sem isso o
    // POST voltaria 404 e o teste mediria a rota de erro.
    const { data: cao } = await admin
      .from("dogs")
      .select("id, public_id")
      .eq("kennel_id", perfil.id)
      .limit(1)
      .maybeSingle();

    if (!cao) continue;

    usuarios.push({ email, senha: SENHA, kennelId: perfil.id, dogId: cao.id });
  }

  if (usuarios.length < 50) {
    falhar(`Só ${usuarios.length} usuários utilizáveis; o teste sobe a 50 VUs.`);
  }

  // Cães rasos e profundos separados: o fluxo de pedigree precisa dos que têm
  // árvore cheia de 5 gerações, senão mediria uma consulta de 2 linhas.
  const { data: publicos } = await admin
    .from("dogs")
    .select("public_id")
    .like("name", "Carga L6 %")
    .not("published_at", "is", null)
    .limit(300);

  const { data: profundos } = await admin
    .from("dogs")
    .select("public_id")
    .like("name", "Carga L7 %")
    .not("published_at", "is", null)
    .limit(300);

  const { data: canis } = await admin
    .from("kennels")
    .select("slug")
    .like("slug", "carga-canil-%")
    .not("published_at", "is", null)
    .limit(300);

  return {
    usuarios,
    caesPublicos: (publicos ?? []).map((d) => d.public_id),
    caesProfundos: (profundos ?? []).map((d) => d.public_id),
    canisPublicos: (canis ?? []).map((k) => k.slug),
  };
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("\nOrigemX — preparo do teste de carga\n");

  await conferirLogin();
  await conferirModelo();

  const volume = await contarVolume();
  const fixtures = await montarFixtures();

  console.log("\nVOLUME CONFIRMADO");
  console.log(`  usuários ......................... ${volume.usuarios}`);
  console.log(`  canis ............................ ${volume.canis} (${volume.canisPublicados} publicados)`);
  console.log(`  cães ............................. ${volume.caes} (${volume.caesPublicados} publicados)`);
  console.log(`  vínculos de parentesco (FK) ...... ${volume.porCamada.slice(1).reduce((a, n) => a + n * 2, 0)}`);
  console.log(`  linhas de ancestral percorríveis .. ${volume.linhasDeAncestral.toLocaleString("pt-BR")}`);
  console.log(`  cães por camada .................. ${volume.porCamada.join(", ")}`);

  console.log("\nFIXTURES");
  console.log(`  usuários utilizáveis ............. ${fixtures.usuarios.length}`);
  console.log(`  cães públicos (camada 6) ......... ${fixtures.caesPublicos.length}`);
  console.log(`  cães profundos (camada 7) ........ ${fixtures.caesProfundos.length}`);
  console.log(`  canis públicos ................... ${fixtures.canisPublicos.length}`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/loadtest-fixtures.json",
    JSON.stringify({ geradoEm: new Date().toISOString(), volume, ...fixtures }, null, 2),
    "utf8",
  );

  console.log("\n  → reports/loadtest-fixtures.json\n");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
