import { alerta, criarCanil, criarCao, expect, publicar, test } from "./support/fixtures";
import { MIME, pngDeTeste } from "./support/imagem";

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
  // Não há mais seletor de canil: o criador tem no máximo um, e o vínculo vem
  // marcado por padrão. O `criarCanil` acima é o que faz existir um para
  // vincular — sem ele o campo de endereço público nem apareceria.

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
    .select("id, public_id, sire_id, dam_id, kennel_id")
    .eq("name", `Xavante ${token}`)
    .single();

  expect(salvo?.sire_id).toBe(pai.id);
  expect(salvo?.dam_id).toBe(mae.id);
  // O canil foi resolvido pelo SERVIDOR, sem o formulário mandar id nenhum.
  // Sem esta asserção o vínculo implícito ficaria só suposto.
  expect(salvo?.kennel_id).toBe(canil.id);

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

test("cadastra o pai como ancestral direto na tela do filho, com foto", async ({
  page,
  criador,
  admin,
}) => {
  await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  await page.goto("/painel/caes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill(`Filho com Ancestral ${token}`);
  await page.getByLabel("Sexo").selectOption("male");

  // "Não encontrei" — cadastra o pai ali mesmo, sem sair da tela do filho.
  await page.getByRole("button", { name: /Buscar o pai/ }).click();
  await page.getByRole("button", { name: "Não encontrei — cadastrar como ancestral" }).click();

  // Escopado ao `<fieldset>` do ancestral: a esta altura a tela tem DOIS
  // campos "Nome" visíveis — o do filho (já preenchido acima) e o do
  // fantasma — e `getByLabel("Nome")` sem escopo bateria nos dois. Sem
  // `exact`: o `<label>` engloba "Nome (obrigatório)" inteiro (rótulo +
  // marcador), então o nome acessível não é "Nome" sozinho.
  const painelAncestral = page.getByRole("group", { name: "Cadastrar ancestral" });
  await painelAncestral.getByLabel("Nome").fill(`Ancestral Foto ${token}`);
  await painelAncestral.getByRole("button", { name: "Criar ancestral" }).click();

  // O fantasma vira o pai selecionado, e — é o que este teste prova — a
  // foto já aparece pronta para subir, sem precisar de um clique extra em
  // "Adicionar foto": `photoOpen` abre sozinho ao criar.
  await expect(page.getByText(`Ancestral Foto ${token}`)).toBeVisible();
  const campoFoto = page.getByLabel("Foto do ancestral");
  await expect(campoFoto).toBeVisible();

  await campoFoto.setInputFiles({
    name: "ancestral.png",
    mimeType: MIME,
    buffer: await pngDeTeste("ancestral", 700),
  });

  await expect(page.getByText("Foto adicionada.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Editar ficha do ancestral" })).toBeVisible();

  await page.getByRole("button", { name: "Cadastrar cão" }).click();
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}/);

  const { data: filho } = await admin
    .from("dogs")
    .select("sire_id")
    .eq("name", `Filho com Ancestral ${token}`)
    .single();
  expect(filho?.sire_id, "o filho referencia o fantasma criado inline").toBeTruthy();

  const { data: fantasma } = await admin
    .from("dogs")
    .select("id, owner_id, kennel_id")
    .eq("id", filho!.sire_id!)
    .single();
  // Confirma que é DE FATO um fantasma — sem dono, sem canil — e não um
  // cão gerenciável qualquer que por acaso bateu o nome.
  expect(fantasma?.owner_id).toBeNull();
  expect(fantasma?.kennel_id).toBeNull();

  const { data: foto } = await admin
    .from("media")
    .select("id, role")
    .eq("dog_id", fantasma!.id)
    .is("deleted_at", null)
    .single();
  expect(foto?.role, "a foto foi gravada como galeria do fantasma").toBe("dog_gallery");
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
  //
  // `filter({ visible: true })` porque o pedigree tem DUAS apresentações no
  // DOM — lista por geração abaixo de `sm`, colunas a partir dele — e o CSS
  // escolhe qual aparece (o servidor não sabe a largura da tela; ler
  // `headers()` mataria o ISR da rota). Sem o filtro, o selo do layout
  // escondido também contaria, porque `getByTitle` casa por atributo e não
  // olha visibilidade. A asserção por `role` acima não precisa disso: locator
  // de role já ignora o que está fora da árvore de acessibilidade.
  await expect(arvore.getByTitle(/ocupa 2 posições/).filter({ visible: true })).toHaveCount(2);
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

/**
 * ============================================================================
 * Data de nascimento digitável — dd/mm/aaaa, teclado numérico, sem obrigar o
 * seletor mês a mês.
 * ============================================================================
 *
 * A REGRA DE NEGÓCIO (data futura, anterior a 1900) não muda — continua em
 * `validateBirthDate`. O que estes testes provam é que o valor DIGITADO chega
 * até ela intacto, em yyyy-mm-dd, e que o formato malformado não trava o
 * cadastro de um campo que é recomendado, não obrigatório.
 */

test("data de nascimento digitada em dd/mm/aaaa chega ao banco em yyyy-mm-dd", async ({
  page,
  criador,
  admin,
}) => {
  // O id não é mais usado — o formulário não escolhe canil. A chamada fica
  // porque o cão precisa de um para se vincular.
  await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  await page.goto("/painel/caes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill(`Data Digitada ${token}`);
  await page.getByLabel("Sexo").selectOption("male");

  // Digitação corrida, sem barra — a máscara insere sozinha. É o caminho
  // rápido que este ajuste existe para viabilizar no teclado numérico do
  // celular.
  await page.getByLabel("Data de nascimento").pressSequentially("15062020");
  await expect(page.getByLabel("Data de nascimento")).toHaveValue("15/06/2020");

  await page.getByRole("button", { name: "Cadastrar cão" }).click();
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}/);

  const { data: salvo } = await admin
    .from("dogs")
    .select("born_on")
    .eq("name", `Data Digitada ${token}`)
    .single();

  expect(salvo?.born_on).toBe("2020-06-15");
});

test("data digitada no futuro é recusada pela MESMA regra de sempre, não uma nova", async ({
  page,
  criador,
  admin,
}) => {
  // O id não é mais usado — o formulário não escolhe canil. A chamada fica
  // porque o cão precisa de um para se vincular.
  await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);
  const futuro = new Date();
  futuro.setFullYear(futuro.getFullYear() + 1);
  const digitado =
    String(futuro.getDate()).padStart(2, "0") +
    String(futuro.getMonth() + 1).padStart(2, "0") +
    String(futuro.getFullYear());

  await page.goto("/painel/caes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill(`Data Futura ${token}`);
  await page.getByLabel("Sexo").selectOption("male");
  await page.getByLabel("Data de nascimento").pressSequentially(digitado);

  await page.getByRole("button", { name: "Cadastrar cão" }).click();

  // A REGRA continua em validateBirthDate — é ela, não este componente, quem
  // recusa. A prova é o formulário NÃO navegar e mostrar a mensagem exata que
  // já existia antes deste ajuste.
  //
  // `alerta(page)`, não `getByRole("alert", {name})`: role="alert" não deriva
  // o nome acessível do próprio texto, então o filtro `name` nunca bateria —
  // é por isso que o helper já existe, e confere o texto à parte.
  await expect(alerta(page)).toContainText("não pode estar no futuro");
  expect(page.url()).toContain("/painel/caes/novo");
});

test("data impossível (31/02) mostra aviso de formato e NÃO trava o cadastro", async ({
  page,
  criador,
  admin,
}) => {
  // O id não é mais usado — o formulário não escolhe canil. A chamada fica
  // porque o cão precisa de um para se vincular.
  await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  await page.goto("/painel/caes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill(`Data Impossível ${token}`);
  await page.getByLabel("Sexo").selectOption("male");

  await page.getByLabel("Data de nascimento").pressSequentially("31022020");

  await expect(alerta(page)).toContainText("Data inválida");

  // born_on é RECOMENDADO, não obrigatório: o cadastro segue, só sem a data —
  // é a decisão registrada no plano, não um travamento silencioso de bug.
  await page.getByRole("button", { name: "Cadastrar cão" }).click();
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}/);

  const { data: salvo } = await admin
    .from("dogs")
    .select("born_on")
    .eq("name", `Data Impossível ${token}`)
    .single();

  expect(salvo?.born_on).toBeNull();
});
