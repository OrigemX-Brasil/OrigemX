import { criarCanil, criarCao, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 20. Compartilhar — a ação principal do perfil do cão no painel
 * ============================================================================
 *
 * Antes, a página não tinha ação de compartilhar nenhuma: a URL aparecia como
 * texto sob o título, dentro do `QrCard` e no link "Ver a página pública", e em
 * nenhum dos três havia um botão — o criador copiava da barra de endereço.
 *
 * O BLOCO SÓ EXISTE COM O CÃO PUBLICADO. Em rascunho `/d/{public_id}` dá 404
 * para quem abrir, então um botão ali entregaria link quebrado; e para um
 * rascunho a ação principal realmente é publicar. Os dois primeiros cenários
 * prendem exatamente essa fronteira.
 *
 * SOBRE A CASCATA DE COMPARTILHAMENTO: no Chromium headless `navigator.share`
 * não existe, então o caminho exercitado aqui é o de DESKTOP — área de
 * transferência com confirmação. O nativo do celular é o primeiro degrau da
 * mesma função (`src/components/share-button.tsx`) e não tem como ser
 * disparado por automação.
 */

test("cão publicado: compartilhar abre a coluna, com a mensagem de valor", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, {
    name: `Compartilhavel ${Date.now().toString(36)}`,
    kennel_id: canil.id,
    published: true,
  });

  await page.goto(`/painel/caes/${cao.id}`);

  await expect(page.getByRole("heading", { name: "Compartilhar", exact: true })).toBeVisible();
  await expect(page.getByText(/Em vez de responder as mesmas perguntas/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Compartilhar link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver QR Code" })).toBeVisible();

  // O endereço absoluto fica visível — terceiro degrau da cascata, para quando
  // nem o nativo nem a área de transferência funcionam.
  const campo = page.getByLabel(`Endereço público de ${cao.name}`);
  const url = await campo.inputValue();
  expect(url).toMatch(/^https?:\/\//);
  expect(url).toContain(`/d/${cao.public_id}`);
});

test("cão em rascunho NÃO mostra compartilhar — publicar continua sendo o topo", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, {
    name: `Rascunho ${Date.now().toString(36)}`,
    kennel_id: canil.id,
  });

  await page.goto(`/painel/caes/${cao.id}`);

  await expect(page.getByRole("heading", { name: "Compartilhar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Compartilhar link" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ver QR Code" })).toHaveCount(0);

  // O que ocupa o lugar é o controle de publicação, que é a ação certa aqui.
  await expect(page.getByRole("heading", { name: "Não publicado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar" })).toBeVisible();
});

test("compartilhar copia o link e confirma", async ({ page, context, criador, admin }) => {
  // Sem esta permissão o `writeText` rejeita no headless e o teste mediria o
  // caminho de erro, não o de sucesso.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, {
    name: `Copiar ${Date.now().toString(36)}`,
    kennel_id: canil.id,
    published: true,
  });

  await page.goto(`/painel/caes/${cao.id}`);
  await page.getByRole("button", { name: "Compartilhar link" }).click();

  // A confirmação é visível E anunciável — `role="status"` com `aria-live`.
  await expect(page.getByText("Link copiado.")).toBeVisible();

  // E o que foi para a área de transferência é o endereço público de verdade,
  // não o da página do painel.
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiado).toContain(`/d/${cao.public_id}`);
});

test("o QR abre num clique e traz os downloads; Escape fecha", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, {
    name: `QR Um Clique ${Date.now().toString(36)}`,
    kennel_id: canil.id,
    published: true,
  });

  await page.goto(`/painel/caes/${cao.id}`);

  const dialogo = page.getByRole("dialog", { name: `QR Code de ${cao.name}` });
  await expect(dialogo).toBeHidden();

  await page.getByRole("button", { name: "Ver QR Code" }).click();
  await expect(dialogo).toBeVisible();

  // O conteúdo é o `QrCard` inteiro, renderizado no SERVIDOR e passado como
  // filho — daí os downloads virem junto sem nada ser reimplementado.
  await expect(dialogo.getByRole("link", { name: "Baixar PNG" })).toBeVisible();
  await expect(dialogo.getByRole("link", { name: "Baixar SVG" })).toBeVisible();

  // Escape vem de graça do `<dialog>` nativo — é metade do motivo de usá-lo.
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();
});

test("o QR do trilho continua na página — os dois convivem", async ({ page, criador, admin }) => {
  // Decisão registrada: o trilho é a referência FIXA enquanto se edita o
  // formulário; o diálogo é o acesso rápido. Este cenário existe para o
  // diálogo não ser confundido com substituição do trilho.
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, {
    name: `Dois QR ${Date.now().toString(36)}`,
    kennel_id: canil.id,
    published: true,
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/painel/caes/${cao.id}`);

  // Fora do diálogo, o QR do trilho segue renderizado na página.
  const foraDoDialogo = page.locator("main").getByRole("heading", { name: "QR Code" });
  await expect(foraDoDialogo.first()).toBeVisible();
});
