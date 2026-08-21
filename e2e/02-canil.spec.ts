import { alerta, expect, test } from "./support/fixtures";

/**
 * O formulário SUGERE o endereço público a partir do nome, e para de sugerir
 * assim que o dono mexe no campo. Um `fill()` seco disputa com essa sugestão e
 * sai concatenado ("canil-ipe-x" + "ipe-x"), porque o input é controlado pelo
 * React. Limpar primeiro, em passo separado, deixa o estado assentar.
 */
async function definirSlug(page: import("@playwright/test").Page, slug: string) {
  const campo = page.getByLabel("URL");
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
 * cidade 1, estado 1, Instagram 1, logo 1) o total é 9.
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

  // Só os dois obrigatórios preenchidos: (2+2) de 9 = 44,4% → 44%.
  const medidor = page.getByRole("progressbar", { name: /completude/i });
  await expect(medidor).toHaveAttribute("aria-valuenow", "44");
  await expect(page.getByText("44%")).toBeVisible();

  // O que falta vem por NOME, não só como número — o criador precisa saber
  // onde mexer.
  const secao = page.locator("section", { hasText: "Completude do cadastro" });
  await expect(secao).toContainText("Sobre o canil");
  await expect(secao).toContainText("Cidade");
  await expect(secao).toContainText("Estado");
  await expect(secao).toContainText("Instagram");
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
  await page.getByLabel("Instagram").fill("@canil.ipe");
  await page.getByRole("button", { name: "Criar canil" }).click();

  await page.waitForURL(/\/painel\/canis\/[0-9a-f-]{36}/);

  // Falta só o logo: (9-1) de 9 = 88,9% → arredonda para 89%.
  await expect(page.getByRole("progressbar", { name: /completude/i })).toHaveAttribute(
    "aria-valuenow",
    "89",
  );

  // `/painel/canis` não é mais lista: com canil cadastrado, ela desvia para ele.
  // Esperar a URL torna isso o que o teste afirma, em vez de tropeçar no fato de
  // que o nome do canil também é o `<h1>` da tela de edição.
  await page.goto("/painel/canis");
  await page.waitForURL(/\/painel\/canis\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: `Canil Ipê ${token}` })).toBeVisible();

  const { data } = await admin.from("kennels").select("slug").eq("owner_id", criador.id);
  expect(data?.map((k) => k.slug)).toContain(`ipe-${token}`);
});

/**
 * O canil semeado é de OUTRA pessoa, e agora é obrigatório que seja: com um
 * canil próprio, `/painel/canis/novo` desviaria e o formulário nem abriria.
 * Também é o cenário verdadeiro — "esse endereço já é de alguém".
 */
test("endereço público duplicado dá mensagem legível, não 500", async ({
  page,
  criador,
  outroCriador,
  admin,
}) => {
  // `criador` não aparece no corpo do teste, mas é quem precisa estar
  // autenticado na `page`: é ele quem vai tentar o slug já tomado pelo
  // `outroCriador`. Sem destructurar o fixture aqui, a `page` navega anônima
  // e o formulário nunca abre.
  expect(criador.id).toBeTruthy();

  const slug = `duplicado-${Date.now().toString(36)}`;
  await admin.from("kennels").insert({
    name: "Canil Que Já Existe",
    slug,
    owner_id: outroCriador.id,
    created_by: outroCriador.id,
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

test("quem já tem canil não vê o formulário de criação", async ({ page, criador, admin }) => {
  const { data } = await admin
    .from("kennels")
    .insert({
      name: "Canil Único",
      slug: `unico-${Date.now().toString(36)}`,
      owner_id: criador.id,
      created_by: criador.id,
    })
    .select("id")
    .single();

  await page.goto("/painel/canis/novo");
  await page.waitForURL(new RegExp(`/painel/canis/${data!.id}`));
  await expect(page.getByRole("button", { name: "Criar canil" })).toHaveCount(0);
});

/**
 * As duas metades da regra numa tela só. Testar apenas a primeira deixaria
 * passar uma implementação que liberasse o endereço junto com a vaga — e um QR
 * já impresso passaria a resolver para outro canil.
 */
test("excluir o canil libera a vaga, mas não o endereço", async ({ page, criador, admin }) => {
  const slug = `reciclado-${Date.now().toString(36)}`;
  const { data } = await admin
    .from("kennels")
    .insert({ name: "Canil A Fechar", slug, owner_id: criador.id, created_by: criador.id })
    .select("id")
    .single();

  await page.goto(`/painel/canis/${data!.id}`);
  await page.getByRole("button", { name: "Excluir canil" }).click();

  // A vaga voltou: o painel mostra o estado vazio e o formulário abre de novo.
  await page.waitForURL(/\/painel\/canis$/);
  await expect(page.getByText("Você ainda não cadastrou seu canil.")).toBeVisible();

  await page.goto("/painel/canis/novo");
  await page.getByLabel("Nome do canil").fill("Canil Novo");
  await definirSlug(page, slug);
  await page.getByRole("button", { name: "Criar canil" }).click();

  // O endereço não voltou.
  await expect(alerta(page).first()).toBeVisible();
  await expect(page.locator("body")).toContainText(/endereço/i);
});

/**
 * O slug do canil é o que o QR Code codifica (`/api/qr/kennel/[id]`), mas
 * não é travado por trigger como `dogs.public_id`/`kennel_litters.public_id`
 * — continua editável de propósito. O que precisa existir é o AVISO: trocar
 * o endereço de um canil JÁ SALVO invalida QR/link impresso, e salvar sem
 * confirmar isso não pode passar batido.
 *
 * SÓ em edição: criar o canil pela primeira vez escolhe o endereço, não
 * "troca" nada — não há QR impresso ainda para quebrar, e as demais
 * criações neste arquivo (`/painel/canis/novo`) já provam isso ao continuar
 * passando sem tocar em nenhum checkbox.
 */
test("editar o endereço de um canil já salvo exige confirmar antes de salvar", async ({
  page,
  criador,
  admin,
}) => {
  const token = Date.now().toString(36);
  const slugOriginal = `original-${token}`;
  const slugNovo = `novo-${token}`;

  const { data } = await admin
    .from("kennels")
    .insert({
      name: "Canil Para Editar",
      slug: slugOriginal,
      owner_id: criador.id,
      created_by: criador.id,
    })
    .select("id")
    .single();

  await page.goto(`/painel/canis/${data!.id}`);

  // Antes de mexer no endereço, nenhum aviso na tela.
  await expect(page.getByText(/Isso muda o link do seu canil/)).toHaveCount(0);

  await definirSlug(page, slugNovo);

  // O aviso aparece, e o botão de salvar fica bloqueado até confirmar.
  await expect(page.getByText(/Isso muda o link do seu canil/)).toBeVisible();
  const salvar = page.getByRole("button", { name: "Salvar alterações" });
  await expect(salvar).toBeDisabled();

  await page.getByRole("checkbox", { name: /Entendo que isso muda o link do canil/ }).check();
  await expect(salvar).toBeEnabled();
  await salvar.click();

  await expect(page.getByText("Alterações salvas.")).toBeVisible();

  const { data: atualizado } = await admin
    .from("kennels")
    .select("slug")
    .eq("id", data!.id)
    .single();
  expect(atualizado?.slug).toBe(slugNovo);
});
