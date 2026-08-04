import { alerta, expect, test } from "./support/fixtures";

/**
 * O formulário SUGERE o endereço público a partir do nome, e para de sugerir
 * assim que o dono mexe no campo. Um `fill()` seco disputa com essa sugestão e
 * sai concatenado ("canil-ipe-x" + "ipe-x"), porque o input é controlado pelo
 * React. Limpar primeiro, em passo separado, deixa o estado assentar.
 */
async function definirSlug(page: import("@playwright/test").Page, slug: string) {
  const campo = page.getByLabel("Endereço público");
  await campo.clear();
  await campo.fill(slug);
  await expect(campo).toHaveValue(slug);
}

/**
 * ============================================================================
 * 2. Criar canil → aparece com a completude correta
 * ============================================================================
 *
 * O número da completude é ponderado: obrigatório pesa 2, recomendado pesa 1,
 * opcional não entra. Com os campos de hoje (nome 2, endereço 2, sobre 1,
 * cidade 1, estado 1, logo 1) o total é 8.
 *
 * Os percentuais abaixo são calculados à mão de propósito. Se eu lesse a regra
 * do mesmo módulo que a implementa, o teste concordaria com qualquer erro que
 * ela tivesse.
 */

test("cria o canil e mostra a completude, com o que falta por nome", async ({ page, criador }) => {
  const nome = `Canil Aurora ${Date.now().toString(36)}`;
  const slug = `aurora-${Date.now().toString(36)}`;

  await page.goto("/painel/canis/novo");
  await page.getByLabel("Nome do canil").fill(nome);
  await definirSlug(page, slug);
  await page.getByRole("button", { name: "Criar canil" }).click();

  await page.waitForURL(/\/painel\/canis\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: nome })).toBeVisible();

  // Só os dois obrigatórios preenchidos: (2+2) de 8 = 50%.
  const medidor = page.getByRole("progressbar", { name: /completude/i });
  await expect(medidor).toHaveAttribute("aria-valuenow", "50");
  await expect(page.getByText("50%")).toBeVisible();

  // O que falta vem por NOME, não só como número — o criador precisa saber
  // onde mexer.
  const secao = page.locator("section", { hasText: "Completude do cadastro" });
  await expect(secao).toContainText("Sobre o canil");
  await expect(secao).toContainText("Cidade");
  await expect(secao).toContainText("Estado");
  await expect(secao).toContainText("Logo");

  // Nenhum obrigatório em falta.
  await expect(secao).not.toContainText("Falta o essencial");

  expect(criador.id).toBeTruthy();
});

test("preencher os recomendados sobe a completude", async ({ page, criador, admin }) => {
  const token = Date.now().toString(36);

  await page.goto("/painel/canis/novo");
  await page.getByLabel("Nome do canil").fill(`Canil Ipê ${token}`);
  await definirSlug(page, `ipe-${token}`);
  await page.getByLabel("Sobre o canil").fill("Criação de Fila Brasileiro desde 1998.");
  await page.getByLabel("Cidade").fill("Bauru");
  await page.getByLabel("Estado").fill("SP");
  await page.getByRole("button", { name: "Criar canil" }).click();

  await page.waitForURL(/\/painel\/canis\/[0-9a-f-]{36}/);

  // Falta só o logo: (8-1) de 8 = 87,5% → arredonda para 88%.
  await expect(page.getByRole("progressbar", { name: /completude/i })).toHaveAttribute(
    "aria-valuenow",
    "88",
  );

  // E o canil aparece na listagem do dono.
  await page.goto("/painel/canis");
  await expect(page.getByText(`Canil Ipê ${token}`)).toBeVisible();

  const { data } = await admin.from("kennels").select("slug").eq("owner_id", criador.id);
  expect(data?.map((k) => k.slug)).toContain(`ipe-${token}`);
});

test("endereço público duplicado dá mensagem legível, não 500", async ({
  page,
  criador,
  admin,
}) => {
  const slug = `duplicado-${Date.now().toString(36)}`;
  await admin.from("kennels").insert({
    name: "Canil Que Já Existe",
    slug,
    owner_id: criador.id,
    created_by: criador.id,
  });

  const respostas: number[] = [];
  page.on("response", (r) => respostas.push(r.status()));

  await page.goto("/painel/canis/novo");
  await page.getByLabel("Nome do canil").fill("Outro Canil");
  await definirSlug(page, slug);
  await page.getByRole("button", { name: "Criar canil" }).click();

  await expect(alerta(page).first()).toBeVisible();
  expect(
    respostas.every((s) => s < 500),
    `houve 5xx: ${respostas.filter((s) => s >= 500)}`,
  ).toBe(true);
});
