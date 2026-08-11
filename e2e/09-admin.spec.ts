import { expect, test } from "./support/fixtures";

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
