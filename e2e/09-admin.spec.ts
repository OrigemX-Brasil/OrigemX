import { criarCanil, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 9. Proteção de /admin — sessão, role e não-suspensão, no servidor
 * ============================================================================
 *
 * Prova a ROTA, não a API: `scripts/test-rls.mts` (cenário 14) já prova que
 * as quatro RPCs `admin_set_*` recusam usuário comum "manipulando a request
 * diretamente" — chamada de RPC pela chave publishable, sem passar pela UI.
 * Aqui o alvo é o `requireAdmin()` que protege o LAYOUT: o que a pessoa vê ao
 * navegar de verdade para `/admin`.
 *
 * Roda contra a BUILD DE PRODUÇÃO (`npm run test:e2e`), como o resto da
 * suíte — é o que exercita o matcher real do proxy, não o modo de dev.
 */

test("anônimo em /admin cai no login, como /painel", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/admin");

  await page.waitForURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");
});

test("usuário comum não vê o placeholder — acaba em /painel", async ({ page, criador }) => {
  await page.goto("/admin");

  // O redirect acontece ANTES de qualquer render do layout de /admin — não é
  // uma tela que carrega e falha graciosamente, é ausência total de markup.
  await page.waitForURL("**/painel");
  await expect(page.getByRole("heading", { name: "Visão geral" })).not.toBeVisible();
  // E é DE FATO o criador comum que aterrissou lá, não uma sessão qualquer.
  await expect(page.getByText(criador.email)).toBeVisible();
});

test("admin de verdade vê o placeholder — o portão não bloqueia falso-positivo", async ({
  page,
  adminUser,
  autenticar,
}) => {
  await autenticar(page, adminUser);
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
});

test("admin SUSPENSO não entra — a checagem relê o banco, não confia só na sessão", async ({
  page,
  admin,
  adminUser,
  autenticar,
}) => {
  // `suspended_at` gravado direto pela chave secreta, mesmo padrão que
  // `criarCanil`/`publicar` já usam para montar estado sem passar pela tela —
  // o caminho pela RPC (`admin_set_profile_suspended`) já está provado em
  // `scripts/test-rls.mts`; aqui o alvo é a reação do APP a este estado.
  const { error } = await admin
    .from("profiles")
    .update({ suspended_at: new Date().toISOString() })
    .eq("id", adminUser.id);
  expect(error, `falha ao suspender fixture: ${error?.message}`).toBeNull();

  await autenticar(page, adminUser);
  await page.goto("/admin");

  await page.waitForURL("**/painel");
  await expect(page.getByRole("heading", { name: "Visão geral" })).not.toBeVisible();
});

// ============================================================================
// Cadastrar e corrigir canil pelo /admin
//
// As duas telas SEMPRE existiram — `/admin/usuarios/[id]/canis/novo` para
// criar, `/admin/assistir/[profileId]/...` para corrigir. O que faltava era
// CAMINHO: a criação só era alcançável pelo perfil do dono, e só para quem
// ainda não tinha canil; a correção, só pelo perfil do dono também. Quem
// atende vários criadores não tinha por onde começar nem como saber quem
// faltava.
//
// Por isso estes testes olham NAVEGAÇÃO, não regra de escrita: quem prova que
// o admin só escreve por porta auditada é `scripts/test-rls.mts` (cenários 22 e
// 23) e a bateria (Grupos 11 e 12). Aqui a pergunta é se dá para CHEGAR lá.
// ============================================================================

test("de /admin/canis o admin cadastra canil para quem ainda não tem", async ({
  page,
  admin,
  adminUser,
  outroCriador,
  autenticar,
}) => {
  // `criarUsuario` não preenche `full_name` — a trigger lê
  // `raw_user_meta_data`, que a API de admin não recebe. Sem nome não há como
  // achar a pessoa pela busca, que é justamente o caminho sob teste.
  const nome = `E2E Sem Canil ${Date.now().toString(36)}`;
  const { error } = await admin
    .from("profiles")
    .update({ full_name: nome })
    .eq("id", outroCriador.id);
  expect(error, `falha ao nomear fixture: ${error?.message}`).toBeNull();

  await autenticar(page, adminUser);
  await page.goto("/admin/canis");

  // O ponto de entrada que não existia.
  await page.getByRole("link", { name: "Cadastrar canil" }).click();
  await page.waitForURL("**/admin/canis/novo");

  await page.getByLabel("Buscar por nome").fill(nome);
  await page.getByRole("button", { name: "Filtrar" }).click();
  await page.getByRole("link", { name: "Cadastrar canil" }).click();

  await page.waitForURL(`**/admin/usuarios/${outroCriador.id}/canis/novo`);
  await expect(page.getByRole("heading", { name: "Cadastrar canil" })).toBeVisible();

  const canil = `Canil Assistido ${Date.now().toString(36)}`;
  await page.getByLabel("Nome do canil").fill(canil);
  // O motivo vem ANTES de abrir o diálogo: `validateReason` roda no submit que
  // o abre, então um motivo em branco nem chega à tela de revisão.
  await page.getByLabel("Motivo").fill("Cadastro feito junto com o criador por telefone.");
  await page.getByRole("button", { name: "Revisar e cadastrar" }).click();
  await page.getByRole("button", { name: "Confirmar e cadastrar" }).click();

  await page.waitForURL(/\/admin\/canis\/[0-9a-f-]{36}/);

  // O que importa não é a tela: é de quem o canil ficou. `owner_id` é o
  // criador, `created_by` é o admin — quem digitou não vira dono.
  const { data } = await admin
    .from("kennels")
    .select("owner_id, created_by, published_at")
    .eq("name", canil)
    .single();

  expect(data?.owner_id).toBe(outroCriador.id);
  expect(data?.created_by).toBe(adminUser.id);
  // Criar e publicar são duas ações, sempre. Nenhuma RPC de criação aceita
  // `published_at`.
  expect(data?.published_at).toBeNull();
});

test("o picker distingue quem falta de quem já está atendido", async ({
  page,
  admin,
  adminUser,
  criador,
  outroCriador,
  autenticar,
}) => {
  const token = Date.now().toString(36);
  const comCanil = `E2E Com Canil ${token}`;
  const semCanil = `E2E Sem Canil ${token}`;

  await admin.from("profiles").update({ full_name: comCanil }).eq("id", criador.id);
  await admin.from("profiles").update({ full_name: semCanil }).eq("id", outroCriador.id);
  const canil = await criarCanil(admin, criador.id, { name: `Canil do Atendido ${token}` });

  await autenticar(page, adminUser);

  // Busca pelo TOKEN, único pedaço presente nos DOIS nomes — as duas linhas na
  // mesma tela são o contraste que impede o falso positivo. Um picker que
  // oferecesse "cadastrar" para todo mundo passaria num teste de uma linha só.
  await page.goto(`/admin/canis/novo?q=${token}`);
  await expect(page.getByText(semCanil)).toBeVisible();
  await expect(page.getByText(comCanil)).toBeVisible();

  // Por HREF, não por texto dentro de uma div: é o que a linha REALMENTE
  // oferece, e não depende de como o markup agrupa nome e ação.
  await expect(
    page.locator(`a[href="/admin/usuarios/${outroCriador.id}/canis/novo"]`),
  ).toBeVisible();
  await expect(page.locator(`a[href="/admin/canis/${canil.id}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/admin/usuarios/${criador.id}/canis/novo"]`)).toHaveCount(0);
});

test("a lista de usuários marca quem está sem canil", async ({
  page,
  admin,
  adminUser,
  criador,
  outroCriador,
  autenticar,
}) => {
  const token = Date.now().toString(36);
  await admin
    .from("profiles")
    .update({ full_name: `E2E Com ${token}` })
    .eq("id", criador.id);
  await admin
    .from("profiles")
    .update({ full_name: `E2E Sem ${token}` })
    .eq("id", outroCriador.id);
  await criarCanil(admin, criador.id, { name: `Canil Marcado ${token}` });

  await autenticar(page, adminUser);

  await page.goto(`/admin/usuarios?q=${encodeURIComponent(`E2E Sem ${token}`)}`);
  await expect(page.getByText("Sem canil")).toBeVisible();

  // O falso positivo é o que importa: quem TEM canil não pode exibir o selo.
  await page.goto(`/admin/usuarios?q=${encodeURIComponent(`E2E Com ${token}`)}`);
  await expect(page.getByText(`E2E Com ${token}`)).toBeVisible();
  await expect(page.getByText("Sem canil")).toHaveCount(0);
});

test("da tela do canil o admin abre o cadastro assistido daquele canil", async ({
  page,
  admin,
  adminUser,
  outroCriador,
  autenticar,
}) => {
  const canil = await criarCanil(admin, outroCriador.id, {
    name: `Canil A Corrigir ${Date.now().toString(36)}`,
  });

  await autenticar(page, adminUser);
  await page.goto(`/admin/canis/${canil.id}`);

  await page.getByRole("button", { name: "Iniciar cadastro assistido" }).click();

  // Escopado ao diálogo ABERTO: a tela do canil tem três `<dialog>` com campo
  // `name="reason"` — publicar, ocultar e assistir —, e "Motivo" sozinho casa
  // com os três. `dialog[open]` é o único que o navegador considera aberto.
  const dialogo = page.locator("dialog[open]");
  await dialogo.getByLabel("Motivo").fill("Criador pediu ajuda para corrigir cidade e WhatsApp.");
  await dialogo.getByRole("button", { name: "Começar" }).click();

  // Cai DIRETO no canil, não na raiz do painel assistido: é o que transforma
  // "corrigir o canil deste cliente" em um clique.
  await page.waitForURL(`**/admin/assistir/${outroCriador.id}/canis/${canil.id}`);

  // A sessão existe no banco, aberta e com o motivo declarado uma única vez.
  const { data } = await admin
    .from("admin_assist_sessions")
    .select("admin_id, target_profile_id, ended_at")
    .eq("admin_id", adminUser.id)
    .is("ended_at", null)
    .single();

  expect(data?.target_profile_id).toBe(outroCriador.id);
});
