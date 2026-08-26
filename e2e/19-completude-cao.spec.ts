import { criarCanil, criarCao, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 19. Completude do cão — medidor no painel
 * ============================================================================
 *
 * `DOG_FIELDS` declarava peso por campo desde sempre, e `WEIGHT_VALUE` estava
 * no arquivo sem ninguém importar: a definição existia, o cálculo e a tela não.
 *
 * O QUE PONTUA NÃO É O QUE O FORMULÁRIO PEDE. Foto, pai, mãe e canil decidem se
 * a página pública se sustenta tanto quanto a raça, e nenhum deles é um
 * `<input>` desta tela — foto é upload, progenitor é busca, canil é caixa de
 * seleção resolvida no servidor. Por isso a lista pontuada é separada, no molde
 * de `logo_url` no canil.
 *
 * O piso é 40%: `name` e `sex` são os únicos obrigatórios e o formulário não
 * deixa gravar sem eles, então nenhum cão existente aparece abaixo disso.
 */

test("cão recém-criado mostra 40% e nomeia o que falta", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  // `criarCao` preenche raça por padrão — aqui o cão é o mais cru possível,
  // para o medidor mostrar o piso real.
  const { data: cao } = await admin
    .from("dogs")
    .insert({
      name: `Cru ${token}`,
      sex: "male",
      owner_id: criador.id,
      created_by: criador.id,
    })
    .select("id")
    .single();

  await page.goto(`/painel/caes/${cao!.id}`);

  const medidor = page.getByRole("progressbar", { name: "Completude do cadastro do cão" });
  await expect(medidor).toBeVisible();
  await expect(medidor).toHaveAttribute("aria-valuenow", "40");
  await expect(page.getByText("40%")).toBeVisible();

  // Percentual E o que falta — a barra é reforço, nunca o único canal.
  const faltando = page.getByText(/Para o perfil público render mais/);
  await expect(faltando).toContainText("Raça");
  await expect(faltando).toContainText("Foto");
  await expect(faltando).toContainText("Pai");
  await expect(faltando).toContainText("Mãe");
  await expect(faltando).toContainText("Canil");

  // "Falta o essencial" NÃO aparece: nome e sexo são NOT NULL, então cão que
  // existe nunca tem obrigatório em branco.
  await expect(page.getByText("Falta o essencial:")).toHaveCount(0);

  expect(canil.id).toBeTruthy();
});

test("preencher um campo sobe o número e tira o campo da lista", async ({
  page,
  criador,
  admin,
}) => {
  const token = Date.now().toString(36);
  const { data: cao } = await admin
    .from("dogs")
    .insert({
      name: `Progresso ${token}`,
      sex: "female",
      owner_id: criador.id,
      created_by: criador.id,
    })
    .select("id")
    .single();

  await page.goto(`/painel/caes/${cao!.id}`);
  await expect(
    page.getByRole("progressbar", { name: "Completude do cadastro do cão" }),
  ).toHaveAttribute("aria-valuenow", "40");

  // Raça pesa 1 de 10 → 40% vira 50%.
  await admin.from("dogs").update({ breed: "Fila Brasileiro" }).eq("id", cao!.id);
  await page.reload();

  await expect(
    page.getByRole("progressbar", { name: "Completude do cadastro do cão" }),
  ).toHaveAttribute("aria-valuenow", "50");
  await expect(page.getByText(/Para o perfil público render mais/)).not.toContainText("Raça");
});

test("o canil vinculado conta na completude do cão", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  const { data: semCanil } = await admin
    .from("dogs")
    .insert({
      name: `Sem Canil ${token}`,
      sex: "male",
      owner_id: criador.id,
      created_by: criador.id,
    })
    .select("id")
    .single();

  await page.goto(`/painel/caes/${semCanil!.id}`);
  const antes = await page
    .getByRole("progressbar", { name: "Completude do cadastro do cão" })
    .getAttribute("aria-valuenow");

  await admin.from("dogs").update({ kennel_id: canil.id }).eq("id", semCanil!.id);
  await page.reload();

  const depois = await page
    .getByRole("progressbar", { name: "Completude do cadastro do cão" })
    .getAttribute("aria-valuenow");

  expect(Number(depois)).toBeGreaterThan(Number(antes));
});

test("ancestral fantasma NÃO mostra medidor — é registro mínimo por definição", async ({
  page,
  criador,
  admin,
}) => {
  const token = Date.now().toString(36);

  // Fantasma: sem dono E sem canil. `created_by` é o que o liga a quem o
  // cadastrou pelo `ParentPicker`, e é o que dá acesso à tela.
  const { data: fantasma, error } = await admin
    .from("dogs")
    .insert({
      name: `Fantasma ${token}`,
      sex: "male",
      owner_id: null,
      kennel_id: null,
      created_by: criador.id,
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  await page.goto(`/painel/caes/${fantasma!.id}`);

  // A tela abre e se identifica como ancestral...
  await expect(page.getByText("Este registro é um ancestral.")).toBeVisible();
  // ...mas sem medidor: cobrar foto, canil e progenitores de um fantasma seria
  // cobrar dado que não deveria existir. Mesma exclusão que o motor de alertas
  // já faz ao montar os sujeitos.
  await expect(
    page.getByRole("progressbar", { name: "Completude do cadastro do cão" }),
  ).toHaveCount(0);
});

test("o rótulo do medidor não depende do nome do cão — nome de cão não colide com campo", async ({
  page,
  criador,
  admin,
}) => {
  /**
   * REGRESSÃO REAL, pega pela suíte completa.
   *
   * A primeira versão usava `aria-label={`Completude do cadastro de ${nome}`}`.
   * Um cão chamado "Nome Que Vai Mudar" — que existe em `07-qr` — fez o rótulo
   * do medidor conter a palavra "Nome", e `getByLabel("Nome")` passou a casar
   * com DOIS elementos: o medidor e o campo do formulário.
   *
   * Não foi o teste que estava frouxo: nome acessível não deve variar com dado
   * do usuário. Um cão chamado "Sexo" ou "Raça" quebraria outras buscas, e o
   * mesmo vale para quem navega por leitor de tela procurando um campo.
   */
  const nomeArmadilha = `Nome ${Date.now().toString(36)}`;
  const cao = await criarCao(admin, criador.id, { name: nomeArmadilha });

  await page.goto(`/painel/caes/${cao.id}`);

  // O campo do formulário continua acessível por rótulo, sem ambiguidade.
  await expect(page.getByLabel("Nome", { exact: false }).first()).toHaveValue(nomeArmadilha);
  await page.getByLabel("Nome", { exact: false }).first().fill(`${nomeArmadilha} editado`);

  // E o medidor tem rótulo próprio, estável, que não contém o nome do cão.
  const medidor = page.getByRole("progressbar", { name: "Completude do cadastro do cão" });
  await expect(medidor).toBeVisible();
  await expect(medidor).not.toHaveAttribute("aria-label", new RegExp(nomeArmadilha));
});

test("o medidor do canil continua funcionando depois de o componente virar compartilhado", async ({
  page,
  criador,
  admin,
}) => {
  // O componente saiu de `modules/kennels/components/` para `src/components/` e
  // ganhou prop de rótulo. Este cenário existe para a mudança de casa não
  // quebrar em silêncio o medidor que já estava no ar.
  const canil = await criarCanil(admin, criador.id);

  await page.goto(`/painel/canis/${canil.id}`);

  await expect(
    page.getByRole("progressbar", { name: "Completude do cadastro do canil" }),
  ).toBeVisible();
});
