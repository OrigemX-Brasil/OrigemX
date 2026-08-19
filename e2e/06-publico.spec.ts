import { test as base } from "@playwright/test";

import { adminClient, criarUsuario, limparUsuario } from "./support/admin";
import { criarCanil, criarCao, expect, publicar, test } from "./support/fixtures";

/**
 * ============================================================================
 * 6. Perfil público acessível sem sessão
 * ============================================================================
 *
 * É a página que milhares de pessoas vão abrir escaneando um QR numa feira.
 * Sem sessão, sem cookie, sem login. Se ela exigir qualquer coisa, o produto
 * não existe.
 *
 * Os testes usam contexto de navegador LIMPO de propósito: herdar a sessão das
 * outras fixtures faria a página passar por estar autenticada, escondendo
 * justamente o que se quer provar.
 */

/** Contexto sem cookie nenhum — o visitante da feira. */
const semSessao = base.extend({
  context: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    await use(ctx);
    await ctx.close();
  },
});

test("cão e canil publicados abrem sem sessão, com os dados e o pedigree", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id, { city: "Londrina", state: "PR" });
  const token = Date.now().toString(36);

  const pai = await criarCao(admin, criador.id, {
    name: `Pai Público ${token}`,
    sex: "male",
    kennel_id: canil.id,
  });
  const cao = await criarCao(admin, criador.id, {
    name: `Rex Público ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: pai.id,
  });

  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id, pai.id] });

  // Contexto limpo: nada de cookie herdado.
  const visitante = await page.context().browser()!.newContext();
  const aba = await visitante.newPage();

  const resp = await aba.goto(`/d/${cao.public_id}`);
  expect(resp?.status()).toBe(200);

  await expect(aba.getByRole("heading", { name: `Rex Público ${token}` })).toBeVisible();
  await expect(aba.getByText(cao.public_id)).toBeVisible();
  await expect(aba.locator("section", { hasText: "Pedigree" }).first()).toContainText(
    `Pai Público ${token}`,
  );

  // E o canil também.
  const respCanil = await aba.goto(`/c/${canil.slug}`);
  expect(respCanil?.status()).toBe(200);
  await expect(aba.getByRole("heading", { name: canil.name })).toBeVisible();
  await expect(aba.getByRole("link", { name: `Rex Público ${token}` })).toBeVisible();

  await visitante.close();
});

test("rascunho NÃO abre para quem não é dono", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id });
  // De propósito: nada publicado.

  const visitante = await page.context().browser()!.newContext();
  const aba = await visitante.newPage();

  const resp = await aba.goto(`/d/${cao.public_id}`);
  expect(resp?.status(), "cão não publicado tem que dar 404 para o público").toBe(404);

  const respCanil = await aba.goto(`/c/${canil.slug}`);
  expect(respCanil?.status()).toBe(404);

  await visitante.close();
});

test("a página pública não vaza campo sensível", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id });

  await admin.from("dog_identifiers").insert({
    dog_id: cao.id,
    kind: "microchip",
    value: `985112345678${Math.floor(Math.random() * 900 + 100)}`,
    created_by: criador.id,
  });
  await admin.from("profiles").update({ phone: "+5541999998888" }).eq("id", criador.id);
  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id] });

  const visitante = await page.context().browser()!.newContext();
  const aba = await visitante.newPage();
  await aba.goto(`/d/${cao.public_id}`);

  const html = await aba.content();
  expect(html).not.toContain("985112345678");
  expect(html).not.toContain("+5541999998888");
  expect(html).not.toContain(criador.email);
  // O uuid interno também não: o identificador público é o `public_id`.
  expect(html).not.toContain(cao.id);

  await visitante.close();
});

semSessao("a landing de captura abre e chama para o cadastro", async ({ page }) => {
  const resp = await page.goto("/");
  expect(resp?.status()).toBe(200);

  await expect(page.getByRole("link", { name: /Criar meu perfil/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

semSessao("o perfil público leva de volta para a captura", async ({ page }) => {
  const admin = adminClient();
  const dono = await criarUsuario("convite");
  const canil = await criarCanil(admin, dono.id);
  const cao = await criarCao(admin, dono.id, { kennel_id: canil.id });
  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id] });

  await page.goto(`/d/${cao.public_id}`);
  // Sem esse link, quem escaneia o QR vê o cão e não tem como virar usuário.
  await expect(page.getByRole("link", { name: "Conhecer o OrigemX" })).toHaveAttribute(
    "href",
    "/?de=perfil-cao",
  );

  await limparUsuario(dono.id);
});
