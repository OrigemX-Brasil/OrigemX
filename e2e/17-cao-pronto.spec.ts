import { criarCanil, criarCao, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 17. Tela de sucesso do cadastro de cão — /painel/caes/[id]/pronto
 * ============================================================================
 *
 * O QUE ESTES TESTES PRENDEM, e por que cada um existe:
 *
 * Antes, `createDog` devolvia o criador para a página de EDIÇÃO — o mesmo
 * formulário que ele acabou de preencher. Como o cão nasce em RASCUNHO, não
 * havia link público na tela naquele instante: ele salvava e não via nada
 * pronto. Os dois fatos juntos eram a maior fricção do cadastro.
 *
 * A correção NÃO foi publicar automaticamente. Publicar move os arquivos para o
 * bucket público antes de gravar `published_at` e tem janela de CDN de até uma
 * hora para desfazer — e o cão recém-criado tem só nome e sexo, então publicar
 * sozinho produziria um perfil público vazio. O que a tela remove é a NAVEGAÇÃO
 * até o botão, não o consentimento.
 *
 * Por isso o teste de publicação abaixo confere as DUAS pontas: que a tela mudou
 * de estado E que o cão ficou mesmo visível sem sessão. Só a primeira passaria
 * com um booleano de fachada.
 */

test("cadastrar um cão leva à tela de sucesso, em rascunho e sem link público ativo", async ({
  page,
  criador,
  admin,
}) => {
  await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);
  const nome = `Pronto Rascunho ${token}`;

  await page.goto("/painel/caes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill(nome);
  await page.getByLabel("Sexo").selectOption("male");
  await page.getByLabel("Raça").fill("Fila Brasileiro");
  await page.getByRole("button", { name: "Cadastrar cão" }).click();

  // O destino é a tela de sucesso, NÃO o formulário de edição. `/pronto` no
  // fim é o que separa uma coisa da outra — o resto da URL é idêntico.
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}\/pronto$/);

  await expect(page.getByRole("heading", { name: `${nome} foi cadastrado` })).toBeVisible();

  // A prévia responde "o que eu acabei de criar?" sem precisar abrir o
  // formulário de novo.
  await expect(page.getByText("Fila Brasileiro")).toBeVisible();
  await expect(page.getByText("Macho")).toBeVisible();

  // O estado dito por TEXTO, não só por cor.
  await expect(page.getByText("Rascunho — só você vê")).toBeVisible();

  // Ação primária é publicar — compartilhar ainda não existe como botão.
  await expect(page.getByRole("button", { name: "Publicar e compartilhar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compartilhar link" })).toHaveCount(0);

  // "Ver perfil" APARECE (o criador precisa saber que existe) mas não é link:
  // o destino daria 404 enquanto o cão for rascunho.
  await expect(page.getByText("Ver perfil", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver perfil" })).toHaveCount(0);
  await expect(page.getByText("disponíveis depois de publicar")).toBeVisible();

  // Cão recém-criado nunca tem foto — a tela diz isso em vez de exibir um
  // quadrado vazio sem explicação.
  await expect(page.getByText("Este cão ainda não tem foto.")).toBeVisible();

  // O QR já está lá, e é de propósito: ele codifica o `public_id`, imutável,
  // então o papel impresso hoje continua valendo depois de publicar.
  await expect(page.getByRole("link", { name: "Baixar PNG" })).toBeVisible();
});

test("o título concorda em gênero com o cão — fêmea é 'cadastrada', não 'cadastrado'", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cadela = await criarCao(admin, criador.id, {
    name: `Aurora Pronto ${Date.now().toString(36)}`,
    sex: "female",
    kennel_id: canil.id,
  });

  await page.goto(`/painel/caes/${cadela.id}/pronto`);

  // Metade dos registros é fêmea. "Aurora foi cadastrado" é o tipo de erro que
  // faz o produto parecer traduzido por máquina — e passou despercebido até a
  // conferência visual desta tela.
  await expect(page.getByRole("heading", { name: `${cadela.name} foi cadastrada` })).toBeVisible();
});

test("'Publicar e compartilhar' publica de verdade — a tela muda E o perfil abre sem sessão", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);
  const cao = await criarCao(admin, criador.id, {
    name: `Pronto Publica ${token}`,
    kennel_id: canil.id,
  });

  await page.goto(`/painel/caes/${cao.id}/pronto`);
  await expect(page.getByText("Rascunho — só você vê")).toBeVisible();

  await page.getByRole("button", { name: "Publicar e compartilhar" }).click();

  // Ponta 1: a tela trocou de estado e liberou as duas ações.
  await expect(page.getByText("Publicado — qualquer pessoa pode abrir")).toBeVisible();
  await expect(page.getByRole("button", { name: "Compartilhar link" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver perfil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: `${cao.name} está no ar` })).toBeVisible();

  // Ponta 2: o cão ficou mesmo público. Contexto limpo, sem cookie nenhum —
  // herdar a sessão faria a página passar por estar autenticada e esconderia
  // exatamente o que se quer provar.
  const visitante = await page.context().browser()!.newContext();
  const aba = await visitante.newPage();
  const resp = await aba.goto(`/d/${cao.public_id}`);
  expect(resp?.status()).toBe(200);
  await expect(aba.getByRole("heading", { name: cao.name })).toBeVisible();
  await visitante.close();
});

test("o endereço público mostrado é o mesmo que o QR aponta, e é absoluto", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);
  const cao = await criarCao(admin, criador.id, {
    name: `Pronto URL ${token}`,
    kennel_id: canil.id,
  });

  await page.goto(`/painel/caes/${cao.id}/pronto`);

  // Uma só definição da URL pública: o campo e o QR leem de `qrTargetUrl`. Duas
  // formas de montar o endereço divergiriam no primeiro ajuste — e o QR
  // impresso é o artefato que não dá para corrigir depois.
  const campo = page.getByLabel("Endereço público do cão");
  const url = await campo.inputValue();

  expect(url).toMatch(/^https?:\/\//);
  expect(url).toContain(`/d/${cao.public_id}`);

  // O QR declara o mesmo alvo no rótulo acessível do SVG.
  await expect(page.getByRole("img", { name: `QR Code que aponta para ${url}` })).toBeVisible();
});

test("a tela de sucesso de um cão de terceiro dá 404", async ({
  page,
  // `criador` é pedido para AUTENTICAR a `page` — sem ele a sessão não existe,
  // o middleware manda para o login e a resposta vira 200, escondendo a guarda
  // que este teste existe para provar. Mesmo par de fixtures de
  // `08-isolamento`: a página é de um usuário, o cão é do outro.
  criador,
  outroCriador,
  admin,
}) => {
  const canil = await criarCanil(admin, outroCriador.id);
  const alheio = await criarCao(admin, outroCriador.id, {
    name: `Pronto Alheio ${Date.now().toString(36)}`,
    kennel_id: canil.id,
    published: true,
  });

  expect(criador.id).not.toBe(outroCriador.id);

  // Publicado de propósito: `dogs_select` devolve cão publicado de TERCEIRO
  // para qualquer um, então é justamente o caso em que uma guarda frouxa
  // vazaria a tela. Quem decide aqui é `getManageableDogById`, não a policy de
  // leitura.
  const resp = await page.goto(`/painel/caes/${alheio.id}/pronto`);
  expect(resp?.status()).toBe(404);
});
