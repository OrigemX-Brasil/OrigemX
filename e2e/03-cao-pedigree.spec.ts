import { criarCanil, criarCao, expect, publicar, test } from "./support/fixtures";

/**
 * ============================================================================
 * 3. Criar cão → vincular pai e mãe → pedigree renderiza
 * ============================================================================
 */

test("vincula pai e mãe pela BUSCA e o pedigree aparece no perfil público", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  // Avós, para a árvore ter mais de um nível e provar que renderiza fundo.
  const avoPaterno = await criarCao(admin, criador.id, {
    name: `Ouro Velho ${token}`,
    sex: "male",
    kennel_id: canil.id,
  });
  const avoPaterna = await criarCao(admin, criador.id, {
    name: `Jandaia ${token}`,
    sex: "female",
    kennel_id: canil.id,
  });

  const pai = await criarCao(admin, criador.id, {
    name: `Tupã ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: avoPaterno.id,
    dam_id: avoPaterna.id,
  });
  const mae = await criarCao(admin, criador.id, {
    name: `Aurora ${token}`,
    sex: "female",
    kennel_id: canil.id,
  });

  // --- o cão novo, criado PELA TELA ---
  await page.goto("/painel/caes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill(`Xavante ${token}`);
  await page.getByLabel("Sexo").selectOption("male");
  await page.getByLabel("Raça").fill("Fila Brasileiro");
  // Precisa do canil: o formulário sugere o endereço público a partir do nome,
  // e endereço público sem canil é inválido por CHECK no banco.
  await page.getByLabel("Canil").selectOption(canil.id);

  // Pai e mãe por BUSCA, nunca por digitação livre: é o que impede a base de
  // encher de homônimos desconectados.
  await page.getByRole("button", { name: /Buscar o pai/ }).click();
  await page.getByLabel("Nome, registro ou microchip").fill(`Tupã ${token}`);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`Tupã ${token}`) }).click();

  await page.getByRole("button", { name: /Buscar a mãe/ }).click();
  await page.getByLabel("Nome, registro ou microchip").fill(`Aurora ${token}`);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`Aurora ${token}`) }).click();

  await page.getByRole("button", { name: "Cadastrar cão" }).click();
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}/);

  // O vínculo chegou no banco, por REFERÊNCIA — nada copiado.
  const { data: salvo } = await admin
    .from("dogs")
    .select("id, public_id, sire_id, dam_id")
    .eq("name", `Xavante ${token}`)
    .single();

  expect(salvo?.sire_id).toBe(pai.id);
  expect(salvo?.dam_id).toBe(mae.id);

  // --- o pedigree na página pública ---
  await publicar(admin, {
    kennelId: canil.id,
    dogIds: [salvo!.id, pai.id, mae.id, avoPaterno.id, avoPaterna.id],
  });

  await page.goto(`/d/${salvo!.public_id}`);

  const arvore = page.locator("section", { hasText: "Pedigree" }).first();
  await expect(arvore).toContainText(`Tupã ${token}`);
  await expect(arvore).toContainText(`Aurora ${token}`);
  // Segunda geração: a árvore desce além de pai e mãe.
  await expect(arvore).toContainText(`Ouro Velho ${token}`);
  await expect(arvore).toContainText(`Jandaia ${token}`);

  // 4 de 6 ancestrais possíveis em 2 gerações — o avô materno e a avó materna
  // não existem, e a contagem tem que dizer a verdade.
  await expect(arvore).toContainText("4 de 6 ancestrais");
});

test("linebreeding: o mesmo ancestral aparece nos dois caminhos", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  // Um único avô, usado dos dois lados. É legítimo e o pedigree tem de mostrar
  // as duas ocorrências — deduplicar apagaria a informação que o criador quer.
  const comum = await criarCao(admin, criador.id, {
    name: `Guará Comum ${token}`,
    sex: "male",
    kennel_id: canil.id,
  });

  const pai = await criarCao(admin, criador.id, {
    name: `Pai ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: comum.id,
  });
  const mae = await criarCao(admin, criador.id, {
    name: `Mãe ${token}`,
    sex: "female",
    kennel_id: canil.id,
    sire_id: comum.id,
  });
  const filho = await criarCao(admin, criador.id, {
    name: `Filho ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: pai.id,
    dam_id: mae.id,
  });

  await publicar(admin, {
    kennelId: canil.id,
    dogIds: [filho.id, pai.id, mae.id, comum.id],
  });

  await page.goto(`/d/${filho.public_id}`);

  const arvore = page.locator("section", { hasText: "Pedigree" }).first();
  const ocorrencias = arvore.getByRole("link", { name: `Guará Comum ${token}` });

  await expect(ocorrencias).toHaveCount(2);
  // E o selo diz quantas vezes, para o criador reconhecer o linebreeding.
  await expect(arvore.getByTitle(/ocupa 2 posições/)).toHaveCount(2);
});

test("ancestral não cadastrado vira lacuna, sem deslocar o resto", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  const pai = await criarCao(admin, criador.id, {
    name: `Só o pai ${token}`,
    sex: "male",
    kennel_id: canil.id,
  });
  const filho = await criarCao(admin, criador.id, {
    name: `Órfão de mãe ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: pai.id,
  });

  await publicar(admin, { kennelId: canil.id, dogIds: [filho.id, pai.id] });
  await page.goto(`/d/${filho.public_id}`);

  const arvore = page.locator("section", { hasText: "Pedigree" }).first();
  await expect(arvore).toContainText(`Só o pai ${token}`);
  await expect(arvore).toContainText("Não informado");
  await expect(arvore).toContainText("1 de 2 ancestrais");
});
