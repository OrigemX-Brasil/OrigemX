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

  /**
   * A árvore é localizada pelo `<h2>`, e não por `hasText`, em TODOS os
   * `arvore` deste arquivo — o motivo é o mesmo em todos.
   *
   * A faixa de selos do desktop (`TrustStrip`) tem uma célula "Pedigree",
   * então ela também é uma `<section>` que CONTÉM a palavra, e vem antes da
   * árvore no HTML: `.first()` passou a pegar a faixa e a comparar o nome do
   * avô com "Pedigree · 10 ancestrais".
   *
   * Filtrar por visibilidade resolveria nos testes de 390px, mas NÃO no
   * `describe` de geometria mais abaixo, que roda a 1440px de propósito — lá
   * as duas seções estão visíveis. O `<h2>` distingue as duas em qualquer
   * largura: na faixa, "Pedigree" é um `<span>`, não um cabeçalho.
   *
   * `exact` porque a variante de ninhada da mesma árvore se chama "Pedigree
   * dos progenitores".
   */
  const arvore = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Pedigree", exact: true }) })
    .first();
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

test("foto do ancestral fantasma aparece na árvore do descendente publicado", async ({
  page,
  criador,
  admin,
}) => {
  // Prova o bug relatado: um ancestral sem dono e sem canil é público por
  // regra do banco (`dog_is_public`) mesmo NUNCA passando por `published_at`
  // — só o filho (e o canil dele) publicam aqui, de propósito.
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  await page.goto("/painel/caes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill(`Filho da Foto ${token}`);
  await page.getByLabel("Sexo").selectOption("male");

  await page.getByRole("button", { name: /Buscar o pai/ }).click();
  await page.getByRole("button", { name: "Não encontrei — cadastrar como ancestral" }).click();

  const painelAncestral = page.getByRole("group", { name: "Cadastrar ancestral" });
  await painelAncestral.getByLabel("Nome").fill(`Fantasma Visível ${token}`);
  await painelAncestral.getByRole("button", { name: "Criar ancestral" }).click();

  await expect(page.getByText(`Fantasma Visível ${token}`)).toBeVisible();
  const campoFoto = page.getByLabel("Foto do ancestral");
  await campoFoto.setInputFiles({
    name: "fantasma.png",
    mimeType: MIME,
    buffer: await pngDeTeste("fantasma", 700),
  });
  await expect(page.getByText("Foto adicionada.")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Cadastrar cão" }).click();
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}/);

  const { data: filho } = await admin
    .from("dogs")
    .select("id, public_id, sire_id")
    .eq("name", `Filho da Foto ${token}`)
    .single();

  const { data: fantasma } = await admin
    .from("dogs")
    .select("id, owner_id, kennel_id, published_at")
    .eq("id", filho!.sire_id!)
    .single();
  // Confirma que é DE FATO um fantasma, e que ele segue sem `published_at`
  // depois de publicar só o filho — é o que isola a causa do bug (a exceção
  // do banco), e não um efeito colateral de publicar o fantasma também.
  expect(fantasma?.owner_id).toBeNull();
  expect(fantasma?.kennel_id).toBeNull();

  await publicar(admin, { kennelId: canil.id, dogIds: [filho!.id] });
  expect(fantasma?.published_at).toBeNull();

  await page.goto(`/d/${filho!.public_id}`);

  // A árvore existe em DUAS marcações simultâneas no DOM — lista mobile e
  // colunas desktop (`hidden sm:block`) — e só uma fica visível por vez via
  // CSS. Nos 390px do viewport padrão, sem `:visible` o locator bate nas
  // duas e o modo estrito do Playwright recusa a ambiguidade.
  const arvore = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Pedigree", exact: true }) })
    .first();
  const cardFantasma = arvore.locator("article:visible", { hasText: `Fantasma Visível ${token}` });
  await expect(cardFantasma).toBeVisible();

  // Sem o fix, `PublicImage` recebe `thumbUrl: undefined` (a foto ficou presa
  // no bucket privado) e desenha só o bloco com a inicial do nome — nenhum
  // `<img>` no DOM. A asserção do `src` prova que a URL veio do bucket
  // PÚBLICO, não só que "alguma" imagem apareceu.
  const foto = cardFantasma.locator("img");
  await expect(foto).toHaveCount(1);
  await expect(foto).toHaveAttribute("src", /kennel-media-public/);
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

  const arvore = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Pedigree", exact: true }) })
    .first();
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

  const arvore = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Pedigree", exact: true }) })
    .first();
  await expect(arvore).toContainText(`Só o pai ${token}`);
  await expect(arvore).toContainText("Não informado");
  await expect(arvore).toContainText("1 de 2 ancestrais");
});

/**
 * ============================================================================
 * A GEOMETRIA da árvore em colunas — medida no navegador, não deduzida.
 * ============================================================================
 *
 * `layout.test.ts` prova a régua HORIZONTAL (largura de card, cotovelo, faixa)
 * porque ela é aritmética. A vertical não é: quem decide a altura de cada
 * faixa é o algoritmo de grid do navegador, e o defeito que este bloco tranca
 * não aparece em nenhum número do código — só no retângulo renderizado.
 *
 * Por isso a asserção é sobre `getBoundingClientRect`, e a árvore é de
 * propósito ASSIMÉTRICA (ramo paterno até a 3ª geração, materno parando na
 * 2ª): na árvore cheia o layout antigo já acertava sozinho, e um teste com ela
 * passaria sem provar nada.
 */
test.describe("geometria da árvore em colunas", () => {
  // A árvore em colunas é `hidden sm:block`. Nos 390px do projeto padrão ela
  // não entra no layout, e a medição pegaria a lista por geração do mobile.
  test.use({ viewport: { width: 1440, height: 900 } });

  test("card no centro entre os dois pais, e a geração formando escada regular", async ({
    page,
    criador,
    admin,
  }) => {
    const canil = await criarCanil(admin, criador.id);
    const token = Date.now().toString(36);

    // O nome CARREGA a posição de Ahnentafel do nó, então a asserção pode ser
    // escrita na mesma linguagem da árvore: o card de `pos` contra os cards de
    // `2·pos` e `2·pos+1`.
    const nome = (pos: number) => `P${pos} ${token}`;
    const ids = new Map<number, string>();

    const criar = async (pos: number, pais?: [number, number]) => {
      const cao = await criarCao(admin, criador.id, {
        name: nome(pos),
        sex: pos % 2 === 0 ? "male" : "female",
        kennel_id: canil.id,
        sire_id: pais ? ids.get(pais[0])! : null,
        dam_id: pais ? ids.get(pais[1])! : null,
      });
      ids.set(pos, cao.id);
      return cao;
    };

    // De trás para frente: o pai precisa existir antes do filho o referenciar.
    for (const pos of [8, 9, 10, 11]) await criar(pos);
    await criar(4, [8, 9]);
    await criar(5, [10, 11]);
    // 6 e 7 são folhas — é a assimetria de que este teste vive.
    for (const pos of [6, 7]) await criar(pos);
    await criar(2, [4, 5]);
    await criar(3, [6, 7]);
    const sujeito = await criar(1, [2, 3]);

    await publicar(admin, { kennelId: canil.id, dogIds: [...ids.values()] });
    await page.goto(`/d/${sujeito.public_id}`);

    const arvore = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Pedigree", exact: true }) })
      .first();
    await expect(arvore).toContainText(nome(11));

    const centros = new Map<number, number>();
    for (const pos of ids.keys()) {
      // `visible: true` porque o pedigree tem DUAS apresentações no DOM e o
      // CSS escolhe qual aparece — sem o filtro o card escondido do mobile
      // entraria na conta com caixa zerada.
      const card = arvore
        .locator("article")
        .filter({ hasText: nome(pos) })
        .filter({ visible: true });
      const box = await card.boundingBox();
      if (!box) throw new Error(`sem caixa para o card da posição ${pos}`);
      centros.set(pos, box.y + box.height / 2);
    }

    // 1. O COLCHETE ENCONTRA NO CENTRO DO CARD DO FILHO. Já valia antes desta
    //    correção — está aqui como trava, porque é a propriedade que qualquer
    //    mexida na altura da faixa quebra primeiro.
    for (const pos of [1, 2, 3, 4, 5]) {
      const meioDosPais = (centros.get(pos * 2)! + centros.get(pos * 2 + 1)!) / 2;
      expect(
        Math.abs(centros.get(pos)! - meioDosPais),
        `o card da posição ${pos} não está no meio dos dois pais`,
      ).toBeLessThanOrEqual(1);
    }

    // 2. ESCADA REGULAR — é esta que pega o defeito relatado. As quatro faixas
    //    da 2ª geração têm de ter a MESMA altura, então os centros ficam
    //    igualmente espaçados. Com a subárvore materna encolhida ao tamanho
    //    natural, os avós maternos ficavam mais juntos que os paternos.
    const gen2 = [4, 5, 6, 7].map((pos) => centros.get(pos)!);
    const passos = [gen2[1]! - gen2[0]!, gen2[2]! - gen2[1]!, gen2[3]! - gen2[2]!];
    for (const passo of passos) {
      expect(
        Math.abs(passo - passos[0]!),
        `a 2ª geração não está em escada regular: ${passos.map(Math.round).join(", ")}`,
      ).toBeLessThanOrEqual(1);
    }
  });
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
