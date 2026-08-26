import { criarCanil, criarCao, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 18. Boas-vindas do primeiro acesso
 * ============================================================================
 *
 * O QUE ESTA TELA SUBSTITUI: quem criava conta caía no painel e descobria o
 * próximo passo pelo alerta `conta-sem-canil` — um cartão entre outros na lista
 * de Pendências, com o mesmo peso de um aviso sobre logo faltando. Informava e
 * não dirigia.
 *
 * A CONDIÇÃO É O DADO, não um sinalizador guardado: `countMyDogs === 0`. Não há
 * coluna de onboarding nem "marcar como visto", então o primeiro cão apaga esta
 * tela para sempre — e é isso que o teste do fim confere.
 *
 * O CANIL VEM JUNTO no fluxo combinado, embora cadastrar cão não o exija
 * (`dogs.kennel_id` é nullable). O motivo é que um cão sem canil faria o alerta
 * `conta-sem-canil` reaparecer logo depois, devolvendo o criador ao modo passivo
 * que esta tela existe para remover.
 */

test("conta nova cai nas boas-vindas, não no painel", async ({ page, criador }) => {
  expect(criador.id).toBeTruthy();

  await page.goto("/painel");

  await expect(page.getByRole("heading", { name: /Vamos começar/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cadastrar meu primeiro cão" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explorar o painel" })).toBeVisible();

  // O painel normal NÃO está por baixo: as boas-vindas ocupam o lugar dele.
  await expect(page.getByRole("heading", { name: "Pendências" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Meu canil" })).toHaveCount(0);

  // ANEXO I.2 — "o painel identifica quem está logado". Trocar o painel pelas
  // boas-vindas tirou da tela o `<dl>` com o e-mail, e três cenários de
  // `01-auth`/`09-admin` caíram por isso. O requisito não admite exceção para
  // quem acabou de se cadastrar: é justamente quem mais precisa saber em que
  // conta entrou.
  await expect(page.getByText(criador.email)).toBeVisible();
});

test("'Explorar o painel' revela o painel normal, sem cadastrar nada", async ({
  page,
  criador,
  admin,
}) => {
  await page.goto("/painel");
  await page.getByRole("link", { name: "Explorar o painel" }).click();

  await expect(page.getByRole("link", { name: "Meu canil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Vamos começar/ })).toHaveCount(0);

  // Nada foi criado só por espiar o painel.
  const { count } = await admin
    .from("dogs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", criador.id);
  expect(count ?? 0).toBe(0);
});

test("o fluxo combinado cria canil E cão num envio só, e cai na tela de sucesso", async ({
  page,
  criador,
  admin,
}) => {
  const token = Date.now().toString(36);

  await page.goto("/painel");
  await page.getByRole("link", { name: "Cadastrar meu primeiro cão" }).click();
  await page.waitForURL(/\/painel\/comecar$/);

  await page.getByLabel("Nome do seu canil").fill(`Canil Aurora ${token}`);
  await page.getByLabel("Nome do cão").fill(`Rex Primeiro ${token}`);
  await page.getByLabel("Sexo").selectOption("male");
  await page.getByRole("button", { name: "Criar e continuar" }).click();

  // Termina na MESMA tela de sucesso do cadastro comum — não há um "pronto"
  // paralelo só para o primeiro cão.
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}\/pronto$/);
  await expect(
    page.getByRole("heading", { name: `Rex Primeiro ${token} foi cadastrado` }),
  ).toBeVisible();

  // A prova real é no banco: as DUAS linhas nasceram, e o cão está vinculado
  // ao canil. Só a tela não distinguiria isso de um cão solto.
  const { data: dog } = await admin
    .from("dogs")
    .select("id, kennel_id")
    .eq("owner_id", criador.id)
    .single();
  const { data: kennel } = await admin
    .from("kennels")
    .select("id, name, slug")
    .eq("owner_id", criador.id)
    .single();

  expect(kennel).toBeTruthy();
  expect(dog!.kennel_id).toBe(kennel!.id);
  expect(kennel!.name).toBe(`Canil Aurora ${token}`);
  // O endereço saiu do NOME, sem o criador ter digitado slug nenhum.
  expect(kennel!.slug).toBe(`canil-aurora-${token}`);
});

test("nome de canil já tomado ganha sufixo em vez de erro na cara do usuário", async ({
  page,
  criador,
  outroCriador,
  admin,
}) => {
  const token = Date.now().toString(36);
  const nome = `Canil Repetido ${token}`;

  // O slug que o nome produziria já é de OUTRA pessoa. `kennels_slug_key` é
  // único global, então o insert do fluxo vai colidir — e tem de se recuperar
  // sozinho, sem devolver erro para quem só quis cadastrar o primeiro cão.
  await criarCanil(admin, outroCriador.id, { name: nome, slug: `canil-repetido-${token}` });

  await page.goto("/painel/comecar");
  await page.getByLabel("Nome do seu canil").fill(nome);
  await page.getByLabel("Nome do cão").fill(`Cão Sufixo ${token}`);
  await page.getByLabel("Sexo").selectOption("female");
  await page.getByRole("button", { name: "Criar e continuar" }).click();

  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}\/pronto$/);

  const { data: kennel } = await admin
    .from("kennels")
    .select("slug")
    .eq("owner_id", criador.id)
    .single();

  expect(kennel!.slug).toBe(`canil-repetido-${token}-2`);
});

test("quem já tem canil vai direto ao formulário de cão, sem pedir canil de novo", async ({
  page,
  criador,
  admin,
}) => {
  await criarCanil(admin, criador.id);

  await page.goto("/painel");
  await page.getByRole("link", { name: "Cadastrar meu primeiro cão" }).click();

  // O destino muda conforme o que já existe — pedir o nome do canil a quem já
  // cadastrou um seria absurdo.
  await page.waitForURL(/\/painel\/caes\/novo$/);
  await expect(page.getByRole("heading", { name: "Novo cão" })).toBeVisible();

  // E a rota do fluxo combinado, se alcançada direto, também desvia.
  await page.goto("/painel/comecar");
  await page.waitForURL(/\/painel\/caes\/novo$/);
});

test("com um cão cadastrado, as boas-vindas somem para sempre", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await criarCao(admin, criador.id, { kennel_id: canil.id });

  await page.goto("/painel");

  await expect(page.getByRole("heading", { name: /Vamos começar/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Meu canil" })).toBeVisible();
});

test("filhote de ninhada conta como cão — quem tem ninhada passou do primeiro acesso", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const { data: litter } = await admin
    .from("kennel_litters")
    .insert({ kennel_id: canil.id, created_by: criador.id, description: "Ninhada" })
    .select("id")
    .single();

  // `countMyDogs` NÃO filtra `litter_id`, ao contrário de `listMyDogs`: lá a
  // lista é o plantel, aqui a pergunta é "esta conta já tem algum cão?".
  //
  // `litter_status` é OBRIGATÓRIO junto com `litter_id`: o CHECK
  // `dogs_litter_status_requires_litter` é bicondicional
  // (`(litter_id is null) = (litter_status is null)`). Sem ele o insert falha,
  // e falharia em silêncio — daí o erro ser conferido logo abaixo.
  const { error } = await admin.from("dogs").insert({
    name: `Filhote ${Date.now().toString(36)}`,
    sex: "male",
    kennel_id: canil.id,
    litter_id: litter!.id,
    litter_status: "available",
    owner_id: criador.id,
    created_by: criador.id,
  });
  expect(error, "o filhote precisa entrar para o teste medir o que promete").toBeNull();

  await page.goto("/painel");
  await expect(page.getByRole("heading", { name: /Vamos começar/ })).toHaveCount(0);
});
