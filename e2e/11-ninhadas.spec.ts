import { criarCanil, criarCao, expect, publicar, test } from "./support/fixtures";
import { MIME, pngDeTeste } from "./support/imagem";

/**
 * ============================================================================
 * 11. Ninhadas — cadastro, 4 fotos, e a REGRA DUPLA de publicação
 * ============================================================================
 *
 * O que precisa ficar provado, e não só "salvou":
 *
 *   - cadastrar é página própria, sem foto (litter_id não existe antes do
 *     INSERT), e SÓ a lista aparece na tela do canil;
 *   - o teto de 4 fotos é do BANCO, não só da UI — a 5ª some da tela porque o
 *     `remaining` chega a zero, não porque um contador de client inventou um
 *     limite;
 *   - a REGRA DUPLA: ninhada publicada com o canil em rascunho não aparece em
 *     `/c/[slug]`, e o aviso avisa disso na hora;
 *   - publicar o canil DEPOIS mostra a ninhada que já estava publicada —
 *     prova o cascade de `publishKennel` sobre mídia de ninhada;
 *   - o card do perfil do canil é `<Link>` para a página própria da ninhada
 *     (`/n/[public_id]`), não mais um gatilho de lightbox — a ninhada
 *     completa (progenitores, filhotes, saúde, pedigree) não cabe num modal.
 */

test("cadastra ninhada, sobe 4 fotos, e a 5ª não tem onde entrar", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);

  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("link", { name: "Cadastrar nova ninhada" }).click();
  await page.waitForURL(/\/painel\/canis\/[0-9a-f-]{36}\/ninhadas\/novo/);

  // Sem campo de foto nesta tela — `litter_id` só existe depois do INSERT.
  await expect(page.getByLabel("Adicionar fotos")).toHaveCount(0);

  await page.getByLabel("Descrição").fill("Quatro filhotes, machos e fêmeas, nascidos em outubro.");
  await page.getByRole("button", { name: "Cadastrar ninhada" }).click();
  await page.waitForURL(/\/painel\/canis\/[0-9a-f-]{36}\/ninhadas\/[0-9a-f-]{36}/);

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .select("id, kennel_id, description")
    .eq("kennel_id", canil.id)
    .single();
  expect(ninhada?.description).toContain("Quatro filhotes");

  // A tela do canil mostra SÓ a lista — card com o resumo, sem upload nem
  // toggle de publicação (esses ficam na página da própria ninhada).
  await page.goto(`/painel/canis/${canil.id}`);
  await expect(page.getByRole("heading", { name: "Ninhadas" })).toBeVisible();
  await expect(page.getByText("Quatro filhotes, machos")).toBeVisible();
  await expect(page.getByLabel("Adicionar fotos")).toHaveCount(0);

  // De volta à ninhada, as 4 fotos de uma vez — exercita a fila com
  // concorrência de verdade (GALLERY_UPLOAD_CONCURRENCY = 3), o caminho que
  // faz duas fotos colidirem no mesmo slot e a retentativa de
  // `registerLitterPhoto` precisar entrar em ação.
  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);

  const fotos = await Promise.all(
    [1, 2, 3, 4].map((n) => pngDeTeste(`ninhada foto ${n}`, 500)),
  );
  await page.getByLabel("Adicionar fotos").setInputFiles(
    fotos.map((buffer, i) => ({ name: `foto-${i + 1}.png`, mimeType: MIME, buffer })),
  );

  const grade = page.getByTestId("litter-photo-grid");
  await expect(grade.locator("img")).toHaveCount(4, { timeout: 30_000 });

  const { data: fotosGravadas } = await admin
    .from("media")
    .select("position")
    .eq("litter_id", ninhada!.id)
    .eq("role", "litter_gallery")
    .is("deleted_at", null)
    .order("position");
  // As QUATRO posições, sem repetição e sem buraco — é a prova de que o
  // cálculo do menor slot livre (e a retentativa em 23505) funcionaram sob
  // concorrência real, não só no teste sequencial de RLS.
  expect(fotosGravadas?.map((f) => f.position)).toEqual([1, 2, 3, 4]);

  // O teto é do BANCO: o campo de upload nem aparece mais — é o mesmo
  // comportamento que a galeria do cão já tem ao chegar no limite dela.
  await expect(page.getByLabel("Adicionar fotos")).toHaveCount(0);
  await expect(page.getByText("Limite de 4 imagens atingido")).toBeVisible();
});

test("a regra dupla: ninhada publicada só aparece quando o canil também publica", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({ kennel_id: canil.id, description: "Ninhada de teste — regra dupla.", created_by: criador.id })
    .select("id")
    .single();

  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);

  // O canil (fixture) nasce em RASCUNHO — publicar a ninhada aqui não pode
  // fingir que já está tudo certo.
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/só aparece no perfil quando o canil TAMBÉM/)).toBeVisible();

  const { data: aindaRascunho } = await admin
    .from("kennel_litters")
    .select("published_at")
    .eq("id", ninhada!.id)
    .single();
  expect(aindaRascunho?.published_at, "a ninhada grava a própria intenção mesmo assim").not.toBeNull();

  // O CANIL ainda é rascunho (a fixture nasce assim) — a página inteira nem
  // abre para o público, então a ninhada publicada não vaza por nenhum
  // caminho, nem o direto.
  const semSessao1 = await page.context().browser()!.newContext();
  const publica1 = await semSessao1.newPage();
  const resp1 = await publica1.goto(`/c/${canil.slug}`);
  expect(resp1?.status()).toBe(404);
  await semSessao1.close();

  // Publica o CANIL pelo BOTÃO — não pelo helper `publicar()` (grava direto
  // no banco, sem passar por `publishKennel`). É a `revalidatePath` de dentro
  // da Server Action que invalida o 404 já em cache de `/c/${slug}` — um
  // UPDATE por fora do fluxo deixaria a página pública presa no 404 antigo
  // até os 300s do ISR vencerem sozinhos, mesmo com o canil já publicado no
  // banco.
  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const semSessao2 = await page.context().browser()!.newContext();
  const publica2 = await semSessao2.newPage();
  await publica2.goto(`/c/${canil.slug}`);
  await expect(publica2.getByRole("heading", { name: "Ninhadas" })).toBeVisible();
  await expect(publica2.getByText("Ninhada de teste — regra dupla.")).toBeVisible();
  await semSessao2.close();

  // E despublicar o canil esconde de novo — sem mexer na ninhada.
  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("button", { name: "Despublicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Não publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const semSessao3 = await page.context().browser()!.newContext();
  const publica3 = await semSessao3.newPage();
  const resp = await publica3.goto(`/c/${canil.slug}`);
  expect(resp?.status()).toBe(404);
  await semSessao3.close();
});

test("o card da ninhada leva à página própria (/n/[public_id]), com a descrição e as fotos", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      description: "Ninhada com duas fotos, para testar a navegação da página própria.",
      created_by: criador.id,
    })
    .select("id")
    .single();

  // Sobe 2 fotos pela tela real — o pipeline de upload já foi provado no
  // primeiro teste deste arquivo; aqui é só o suficiente para a página pública
  // ter o que exibir.
  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);
  const fotos = await Promise.all([1, 2].map((n) => pngDeTeste(`pagina foto ${n}`, 400)));
  await page
    .getByLabel("Adicionar fotos")
    .setInputFiles(fotos.map((buffer, i) => ({ name: `pagina-${i + 1}.png`, mimeType: MIME, buffer })));
  await expect(page.getByTestId("litter-photo-grid").locator("img")).toHaveCount(2, {
    timeout: 30_000,
  });

  // Publica os dois pelos botões reais — mesmo motivo já registrado no teste
  // da regra dupla: `publicar()` grava direto no banco e não revalida o ISR.
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/c/${canil.slug}`);

  // O card inteiro é um `<Link>` (não mais um botão de lightbox) — clicar no
  // texto da descrição navega para a página própria da ninhada, mesmo
  // caminho que um visitante de verdade usaria.
  await publica.getByText("Ninhada com duas fotos, para testar a navegação da página própria.").click();
  await publica.waitForURL(/\/n\/[2-9a-hjkmnp-z]{12}$/);

  await expect(
    publica.getByText("Ninhada com duas fotos, para testar a navegação da página própria."),
  ).toBeVisible();
  // As duas fotos, sem lightbox nem contador — a página pública é a galeria
  // inteira, não uma janela sobre ela.
  //
  // Escopado em `main`: o cabeçalho da página tem o wordmark do OrigemX, que é
  // um `<img>` e entraria numa contagem feita na página toda.
  await expect(publica.locator("main img")).toHaveCount(2);

  await semSessao.close();
});

test("ninhada SEM foto mostra só a descrição — sem seção de fotos", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });
  await admin.from("kennel_litters").insert({
    kennel_id: canil.id,
    description: "Ninhada sem foto nenhuma, só texto.",
    created_by: criador.id,
    published_at: new Date().toISOString(),
  });

  await page.goto(`/c/${canil.slug}`);
  await page.getByText("Ninhada sem foto nenhuma, só texto.").click();
  await page.waitForURL(/\/n\/[2-9a-hjkmnp-z]{12}$/);

  await expect(page.getByText("Ninhada sem foto nenhuma, só texto.")).toBeVisible();
  // Sem foto, a `<section>` de "Fotos" nem renderiza — condicionada a
  // `litter.photos.length > 0` — em vez de aparecer vazia.
  await expect(page.getByRole("heading", { name: "Fotos", exact: true })).toHaveCount(0);
  // `main img` e não `img`: o wordmark do cabeçalho é uma imagem legítima que
  // existe em toda página pública.
  await expect(page.locator("main img")).toHaveCount(0);
});

/**
 * A REGRA DA HONESTIDADE do resumo de saúde.
 *
 * A referência visual do cliente mostra um checkmark único no nível da
 * ninhada, como se valesse para todos os filhotes. Mas o registro é por CÃO.
 * Numa ninhada de dois com só um vacinado, um check verde dizendo "Última
 * vacina em ..." é uma afirmação FALSA para quem está decidindo uma compra de
 * milhares de reais — e é o tipo de regressão que passa despercebida numa
 * refatoração, porque a tela continua "bonita e funcionando".
 *
 * Por isso este caso existe: cobertura parcial tem de aparecer com o número
 * real, e o vermífugo (que cobre os dois) tem de continuar afirmando.
 */
test("saúde da ninhada: cobertura parcial mostra a contagem, não um checkmark de todos", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);

  // O par da ninhada. `dogs_check_litter_parents` exige que o filhote nasça
  // com exatamente este par, então os progenitores vêm primeiro.
  const pai = await criarCao(admin, criador.id, { sex: "male", kennel_id: canil.id });
  const mae = await criarCao(admin, criador.id, { sex: "female", kennel_id: canil.id });

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      description: "Ninhada para conferir o resumo de saúde.",
      created_by: criador.id,
      sire_id: pai.id,
      dam_id: mae.id,
      published_at: new Date().toISOString(),
    })
    .select("id, public_id")
    .single();

  const filhotes = [];
  for (const sexo of ["male", "female"] as const) {
    const { data } = await admin
      .from("dogs")
      .insert({
        name: `Filhote ${sexo === "male" ? 1 : 2}`,
        sex: sexo,
        kennel_id: canil.id,
        litter_id: ninhada!.id,
        litter_status: "available",
        sire_id: pai.id,
        dam_id: mae.id,
        owner_id: criador.id,
        created_by: criador.id,
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    filhotes.push(data!.id);
  }

  // Vermífugo nos DOIS; vacina em apenas UM. É a assimetria que o teste mede.
  await admin.from("dog_health_records").insert([
    { dog_id: filhotes[0], kind: "deworming", applied_on: "2026-08-10", created_by: criador.id },
    { dog_id: filhotes[1], kind: "deworming", applied_on: "2026-08-10", created_by: criador.id },
    {
      dog_id: filhotes[0],
      kind: "vaccine",
      applied_on: "2026-08-12",
      product: "V10",
      created_by: criador.id,
    },
  ]);

  await publicar(admin, { kennelId: canil.id, dogIds: [pai.id, mae.id] });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/n/${ninhada!.public_id}`);

  const saude = publica.locator("section", { hasText: "Saúde e garantias" });
  await expect(saude).toBeVisible();

  // Vermífugo cobre os dois → afirma, com a data.
  await expect(saude.getByText("Vermífugo aplicado em 10/08/2026")).toBeVisible();

  // Vacina cobre 1 de 2 → mostra a contagem, e NÃO a frase de afirmação.
  await expect(saude.getByText("Vacina: 1 de 2 filhotes")).toBeVisible();
  await expect(saude.getByText(/Última vacina em/)).toHaveCount(0);

  // Os progenitores estão publicados de propósito: assim este caso também
  // cobre a seção "Progenitores" renderizando, que é o que o visitante vê
  // primeiro. Sem publicá-los, `getPublicLitterParents` (client anônimo)
  // devolveria vazio e a seção sumiria — comportamento correto, mas que
  // deixaria a abertura da página sem nenhum teste.
  await expect(publica.getByRole("heading", { name: "Progenitores", exact: true })).toBeVisible();

  await semSessao.close();
});

/**
 * O pedigree da ninhada tinha 3 gerações hardcoded (`getPedigree(ancora.id,
 * 3)`), enquanto a página do cão sempre mostrou 5. Não basta trocar o número:
 * `LITTER_GENERATIONS` precisa de uma entrada por geração, senão a 4ª e a 5ª
 * caem no fallback de largura/rótulo da 3ª. Este caso só precisa de UM
 * caminho até a 5ª geração — não da árvore inteira — para provar a
 * profundidade de verdade.
 */
test("pedigree da ninhada desce até a 5ª geração de progenitores", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  // Uma única linha paterna, funda até a 5ª geração — o resto da árvore fica
  // com lacunas de propósito, o que já é coberto pelo teste de "4 de 6
  // ancestrais" em 03-cao-pedigree.spec.ts.
  const tetravo = await criarCao(admin, criador.id, {
    name: `Tetravô ${token}`,
    sex: "male",
    kennel_id: canil.id,
  });
  const trisavo = await criarCao(admin, criador.id, {
    name: `Trisavô ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: tetravo.id,
  });
  const bisavo = await criarCao(admin, criador.id, {
    name: `Bisavô ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: trisavo.id,
  });
  const avo = await criarCao(admin, criador.id, {
    name: `Avô ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: bisavo.id,
  });
  const pai = await criarCao(admin, criador.id, {
    name: `Pai ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: avo.id,
  });
  const mae = await criarCao(admin, criador.id, {
    name: `Mãe ${token}`,
    sex: "female",
    kennel_id: canil.id,
  });

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      created_by: criador.id,
      sire_id: pai.id,
      dam_id: mae.id,
      published_at: new Date().toISOString(),
    })
    .select("id, public_id")
    .single();

  await admin.from("dogs").insert({
    name: `Filhote ${token}`,
    sex: "male",
    kennel_id: canil.id,
    litter_id: ninhada!.id,
    litter_status: "available",
    sire_id: pai.id,
    dam_id: mae.id,
    owner_id: criador.id,
    created_by: criador.id,
    published_at: new Date().toISOString(),
  });

  await publicar(admin, {
    kennelId: canil.id,
    dogIds: [pai.id, mae.id, avo.id, bisavo.id, trisavo.id, tetravo.id],
  });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/n/${ninhada!.public_id}`);

  const arvore = publica.locator("section", { hasText: "Pedigree" }).first();
  await expect(arvore).toBeVisible();
  await expect(arvore).toContainText(`Tetravô ${token}`);
  // 6 posições conhecidas (pai, mãe e a linha paterna até o tetravô) — a
  // árvore não vai além da 5ª geração porque foi até aí que este teste criou
  // cão.
  await expect(arvore).toContainText("6 de 62 ancestrais · 5 gerações");

  await semSessao.close();
});

/**
 * O atalho de saúde em lote: continua UMA linha por filhote em
 * `dog_health_records` (nenhuma tabela nova, nenhum `litter_id` na tabela) —
 * o formulário só evita repetir "Tipo/Data/Produto" um filhote de cada vez.
 * Todo filhote nasce marcado; desmarcar é a exceção.
 */
test("saúde em lote: registra em quem está marcado, não em quem foi desmarcado", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const pai = await criarCao(admin, criador.id, { sex: "male", kennel_id: canil.id });
  const mae = await criarCao(admin, criador.id, { sex: "female", kennel_id: canil.id });

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      created_by: criador.id,
      sire_id: pai.id,
      dam_id: mae.id,
    })
    .select("id")
    .single();

  const filhotes: string[] = [];
  for (const nome of ["Um", "Dois", "Três"]) {
    const { data } = await admin
      .from("dogs")
      .insert({
        name: `Filhote ${nome}`,
        sex: "male",
        kennel_id: canil.id,
        litter_id: ninhada!.id,
        litter_status: "available",
        sire_id: pai.id,
        dam_id: mae.id,
        owner_id: criador.id,
        created_by: criador.id,
      })
      .select("id")
      .single();
    filhotes.push(data!.id);
  }

  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);

  const saude = page.locator("section", { hasText: "Saúde dos filhotes" });
  await expect(saude).toBeVisible();

  // Todos nascem marcados — desmarca só "Filhote Três", a exceção.
  await saude.getByRole("checkbox", { name: /Filhote Três/ }).uncheck();

  await saude.getByLabel("Data").pressSequentially("15082026");
  await saude.getByLabel("Tipo da vacina").fill("V10");
  await saude.getByRole("button", { name: "Registrar para os filhotes selecionados" }).click();

  await expect(saude.getByText("Registrado para 2 filhotes.")).toBeVisible();

  const { data: registros } = await admin
    .from("dog_health_records")
    .select("dog_id")
    .in("dog_id", filhotes)
    .is("deleted_at", null);

  const cobertos = new Set((registros ?? []).map((r) => r.dog_id));
  expect(cobertos.has(filhotes[0])).toBe(true);
  expect(cobertos.has(filhotes[1])).toBe(true);
  // O desmarcado fica de fora — a essência do teste.
  expect(cobertos.has(filhotes[2])).toBe(false);

  // Cada linha continua independente: editável/removível uma a uma depois,
  // no mesmo lugar de sempre — sem vínculo entre elas além de terem nascido
  // do mesmo clique. Confere pela tela do próprio cão, não só pelo banco.
  await page.goto(`/painel/caes/${filhotes[0]}`);
  await expect(page.getByText("V10")).toBeVisible();
  await expect(page.getByText("15/08/2026")).toBeVisible();
});

/**
 * O FILTRO DE PLANTEL — filhote é `dogs`, mas não é plantel.
 *
 * `listMyDogs` e `listPublicDogsOfKennel` filtram `litter_id is null`. É
 * decisão de produto, não de segurança, e é justamente por isso que precisa de
 * teste: uma regressão aqui não quebra nada visivelmente — só soterra o plantel
 * do criador com filhotes, e ninguém percebe até a reclamação.
 *
 * O teste prova os DOIS lados. Se só provasse a ausência, uma policy que
 * escondesse o filhote de todo lugar passaria — e aí o filtro teria virado
 * regra de RLS, que é exatamente o que ele NÃO é.
 */
test("filhote fica fora do plantel e da lista pública do canil, mas tem página própria", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const pai = await criarCao(admin, criador.id, { sex: "male", kennel_id: canil.id });
  const mae = await criarCao(admin, criador.id, { sex: "female", kennel_id: canil.id });

  // Um cão de plantel, para o teste distinguir "a lista está vazia" de "a lista
  // filtrou o filhote". Sem ele, uma listagem quebrada passaria.
  const adulto = await criarCao(admin, criador.id, {
    name: `Adulto de Plantel ${Date.now().toString(36)}`,
    kennel_id: canil.id,
  });

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      description: "Ninhada do teste de plantel.",
      created_by: criador.id,
      sire_id: pai.id,
      dam_id: mae.id,
      published_at: new Date().toISOString(),
    })
    .select("id, public_id")
    .single();

  const nomeFilhote = `Filhote Fora do Plantel ${Date.now().toString(36)}`;
  const { data: filhote } = await admin
    .from("dogs")
    .insert({
      name: nomeFilhote,
      sex: "male",
      kennel_id: canil.id,
      litter_id: ninhada!.id,
      litter_status: "available",
      sire_id: pai.id,
      dam_id: mae.id,
      owner_id: criador.id,
      created_by: criador.id,
      published_at: new Date().toISOString(),
    })
    .select("id, public_id")
    .single();

  await publicar(admin, { kennelId: canil.id, dogIds: [adulto.id] });

  // 1. Painel do criador: o adulto aparece, o filhote não.
  await page.goto("/painel/caes");
  await expect(page.getByText(adulto.name)).toBeVisible();
  await expect(page.getByText(nomeFilhote)).toHaveCount(0);

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();

  // 2. Perfil público do canil: mesma coisa.
  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByText(adulto.name)).toBeVisible();
  await expect(publica.getByText(nomeFilhote)).toHaveCount(0);

  // 3. O OUTRO LADO: o filhote está publicado e é um cão como outro qualquer —
  // tem página própria e aparece na ninhada. Filtro de LISTAGEM, não de RLS.
  await publica.goto(`/d/${filhote!.public_id}`);
  await expect(publica.getByRole("heading", { name: nomeFilhote })).toBeVisible();

  await publica.goto(`/n/${ninhada!.public_id}`);
  await expect(publica.getByText(nomeFilhote)).toBeVisible();

  await semSessao.close();
});

/**
 * "Aceita proposta" — SÓ RÓTULO. Nenhum mecanismo de oferta, nenhuma mudança
 * no fluxo de contato (continua o mesmo WhatsApp de sempre). Independente do
 * preço: o teste marca o checkbox SEM preencher preço nenhum, de propósito —
 * é o caso "só sob consulta" que a decisão do dono do produto cobre.
 */
test("marcar \"Aceita proposta\" no filhote mostra o badge no público; desmarcar remove", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const pai = await criarCao(admin, criador.id, { sex: "male", kennel_id: canil.id });
  const mae = await criarCao(admin, criador.id, { sex: "female", kennel_id: canil.id });

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      created_by: criador.id,
      sire_id: pai.id,
      dam_id: mae.id,
      published_at: new Date().toISOString(),
    })
    .select("id, public_id")
    .single();

  const nomeFilhote = `Filhote Proposta ${Date.now().toString(36)}`;
  await admin.from("dogs").insert({
    name: nomeFilhote,
    sex: "male",
    kennel_id: canil.id,
    litter_id: ninhada!.id,
    litter_status: "available",
    sire_id: pai.id,
    dam_id: mae.id,
    owner_id: criador.id,
    created_by: criador.id,
    published_at: new Date().toISOString(),
  });

  await publicar(admin, { kennelId: canil.id });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();

  // 1. Sem marcar nada, o badge não existe.
  await publica.goto(`/n/${ninhada!.public_id}`);
  await expect(publica.getByText("Aceita proposta")).toHaveCount(0);

  // 2. Marca no painel — SEM preencher preço, de propósito.
  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);
  const linhaFilhote = page.locator("li", { hasText: nomeFilhote });
  await linhaFilhote.getByLabel("Aceita proposta").check();
  await linhaFilhote.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Filhote atualizado.")).toBeVisible();

  await publica.goto(`/n/${ninhada!.public_id}`);
  await expect(publica.getByText("Aceita proposta")).toBeVisible();

  // 3. Desmarca — o badge some. E o CTA de contato continua o mesmo link de
  // sempre, sem nenhum campo de oferta na página.
  await expect(publica.locator("form")).toHaveCount(0);
  await expect(publica.locator("input, textarea")).toHaveCount(0);

  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);
  await linhaFilhote.getByLabel("Aceita proposta").uncheck();
  await linhaFilhote.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Filhote atualizado.")).toBeVisible();

  await publica.goto(`/n/${ninhada!.public_id}`);
  await expect(publica.getByText("Aceita proposta")).toHaveCount(0);

  await semSessao.close();
});

/**
 * 360px — o Android estreito, mais apertado que os 390px da suíte.
 *
 * Afirma AUSÊNCIA DE TRANSBORDO HORIZONTAL, não pixels: screenshot comparado
 * quebra a cada ajuste de cor e não diz nada sobre usabilidade. Transbordo é o
 * defeito real que 360px expõe — a barra de resumo 2×2, o par de progenitores
 * com o "×" no meio e os cards de filhote são o que aperta primeiro.
 */
test("layout da ninhada não transborda a 360px", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const pai = await criarCao(admin, criador.id, { sex: "male", kennel_id: canil.id });
  const mae = await criarCao(admin, criador.id, { sex: "female", kennel_id: canil.id });

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      description: "Ninhada para conferir o layout estreito.",
      created_by: criador.id,
      sire_id: pai.id,
      dam_id: mae.id,
      born_on: "2026-08-15",
      published_at: new Date().toISOString(),
    })
    .select("id, public_id")
    .single();

  for (const sexo of ["male", "female"] as const) {
    await admin.from("dogs").insert({
      name: `Filhote ${sexo === "male" ? 1 : 2}`,
      sex: sexo,
      kennel_id: canil.id,
      litter_id: ninhada!.id,
      litter_status: sexo === "male" ? "available" : "reserved",
      sire_id: pai.id,
      dam_id: mae.id,
      owner_id: criador.id,
      created_by: criador.id,
      published_at: new Date().toISOString(),
    });
  }

  // Progenitores publicados: sem isso a seção do "×" nem renderiza, e o teste
  // mediria uma página mais simples do que a real.
  await admin.from("kennels").update({ whatsapp: "5511987654321" }).eq("id", canil.id);
  await publicar(admin, { kennelId: canil.id, dogIds: [pai.id, mae.id] });

  const semSessao = await page.context().browser()!.newContext({
    viewport: { width: 360, height: 740 },
  });
  const estreita = await semSessao.newPage();
  await estreita.goto(`/n/${ninhada!.public_id}`);

  // A página cheia: progenitores, resumo, filhotes, saúde, pedigree e CTA.
  await expect(estreita.getByRole("heading", { name: "Progenitores", exact: true })).toBeVisible();
  await expect(estreita.getByText("Filhote 1")).toBeVisible();
  await expect(estreita.getByRole("link", { name: /Tenho interesse/ })).toBeVisible();

  const transbordo = await estreita.evaluate(() => {
    const el = document.documentElement;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });
  expect(
    transbordo.scroll,
    `a página rola na horizontal a 360px (${transbordo.scroll}px de conteúdo em ${transbordo.client}px)`,
  ).toBeLessThanOrEqual(transbordo.client);

  await semSessao.close();
});

/**
 * O CTA é um LINK para o WhatsApp do criador — nunca um formulário.
 *
 * Os dois lados no mesmo teste, de propósito: o botão existente prova que o
 * link se monta, e a AUSÊNCIA dele quando não há telefone prova que o fallback
 * para Instagram — que existiu por uma rodada e contrariava a especificação —
 * não voltou. Um botão escrito "Tenho interesse NESTA ninhada" abrindo um
 * perfil genérico é o tipo de regressão que passa em review sem ninguém notar.
 */
test("CTA de WhatsApp: aparece com telefone, some sem telefone", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });

  // DUAS ninhadas no mesmo canil, e é o que torna o teste possível sob ISR:
  // cada `public_id` é uma entrada de cache própria. Reusar a mesma URL depois
  // de mexer no telefone serviria o HTML cacheado do primeiro acesso — e nem
  // query string resolve, porque ela não varia a chave de cache de uma rota
  // estática. `revalidatePath` também não ajudaria: o UPDATE abaixo é feito
  // por fora das Server Actions, direto no banco.
  const criarNinhada = async (descricao: string) => {
    const { data } = await admin
      .from("kennel_litters")
      .insert({
        kennel_id: canil.id,
        description: descricao,
        created_by: criador.id,
        born_on: "2026-08-15",
        published_at: new Date().toISOString(),
      })
      .select("id, public_id")
      .single();
    return data!;
  };

  const semTelefone = await criarNinhada("Ninhada sem telefone no canil.");
  const comTelefone = await criarNinhada("Ninhada com telefone no canil.");

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();

  // 1. O canil das fixtures nasce SEM telefone — nenhum botão.
  await publica.goto(`/n/${semTelefone.public_id}`);
  await expect(publica.getByText("Ninhada sem telefone no canil.")).toBeVisible();
  await expect(publica.getByRole("link", { name: /Tenho interesse/ })).toHaveCount(0);

  // 2. Com telefone, o link aparece e aponta para wa.me.
  await admin.from("kennels").update({ whatsapp: "5511987654321" }).eq("id", canil.id);

  await publica.goto(`/n/${comTelefone.public_id}`);

  const cta = publica.getByRole("link", { name: /Tenho interesse/ });
  await expect(cta).toBeVisible();

  const href = await cta.getAttribute("href");
  expect(href).toContain("https://wa.me/5511987654321?text=");

  // A mensagem identifica a ninhada: data legível E o link, porque o criador
  // não distingue as próprias ninhadas por nome — elas não têm nome.
  const texto = decodeURIComponent(new URL(href!).searchParams.get("text")!);
  expect(texto).toContain("nascida em 15/08/2026");
  expect(texto).toContain(`/n/${comTelefone.public_id}`);
  expect(texto.endsWith("no OrigemX.")).toBe(true);

  // A FRONTEIRA CONTRATUAL, virada teste.
  //
  // "NÃO crie formulário de lead, NÃO persista dado de terceiro interessado" é
  // decisão registrada no CLAUDE.md e exige novo aditivo para mudar. Hoje isso
  // é verdade por construção (a página é um `<a href>` estático), mas
  // "construção" muda — e a mudança que a violaria é justamente a que parece
  // uma melhoria inocente: um campinho de e-mail "para o criador te achar".
  //
  // Mesma técnica de "provar a ausência" que `alerts/engine.test.ts` usa para
  // os canais de notificação.
  await expect(publica.locator("form")).toHaveCount(0);
  await expect(publica.locator("input, textarea, select")).toHaveCount(0);

  await semSessao.close();
});

/**
 * O campo de WhatsApp mora no CANIL (`/painel/canis/[id]`), não na ninhada —
 * reaproveitado por todas as ninhadas do mesmo dono. Reportado depois de subir
 * pra produção: quem está criando/editando uma ninhada não tem como adivinhar
 * que o contato se configura em outro lugar. E, cavando a causa, achei um
 * segundo bug — mais grave — sem teste nenhum até agora: `getManageableKennelById`
 * não selecionava a coluna `whatsapp`, então o campo nascia sempre vazio no
 * formulário de "Meu canil", MESMO DEPOIS de salvo. As duas metades num teste
 * só, porque são a mesma causa (o dado não chegava até a tela) com dois
 * sintomas.
 */
test("aviso de WhatsApp no fluxo de ninhada, e o campo mantém o valor depois de salvar", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);

  const aviso = () => page.getByText(/Seu canil ainda não tem WhatsApp cadastrado/);

  // 1. Canil sem WhatsApp: o aviso aparece na tela de CRIAR ninhada, com link
  // pra onde o campo realmente mora.
  await page.goto(`/painel/canis/${canil.id}/ninhadas/novo`);
  await expect(aviso()).toBeVisible();
  await expect(page.getByRole("link", { name: "Adicionar WhatsApp" })).toHaveAttribute(
    "href",
    `/painel/canis/${canil.id}`,
  );

  // 2. O bug de round-trip: preencher em "Meu canil", salvar, RECARREGAR
  // (força um fetch novo do servidor, não estado de client) — o campo precisa
  // continuar com o valor, não voltar vazio.
  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByLabel("WhatsApp").fill("11987654321");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Alterações salvas.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("WhatsApp")).toHaveValue("11987654321");

  // 3. Com WhatsApp cadastrado, o aviso some — tanto pra criar quanto pra
  // editar uma ninhada já existente.
  await page.goto(`/painel/canis/${canil.id}/ninhadas/novo`);
  await expect(aviso()).toHaveCount(0);

  const { data: litter } = await admin
    .from("kennel_litters")
    .insert({ kennel_id: canil.id, created_by: criador.id })
    .select("id")
    .single();

  await page.goto(`/painel/canis/${canil.id}/ninhadas/${litter!.id}`);
  await expect(aviso()).toHaveCount(0);
});

test("excluir ninhada é lógico, e ela some do painel e do público", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });
  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      description: "Ninhada a ser excluída.",
      created_by: criador.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await page.goto(`/c/${canil.slug}`);
  await expect(page.getByText("Ninhada a ser excluída.")).toBeVisible();

  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);
  await page.getByRole("button", { name: "Excluir ninhada" }).click();
  await page.waitForURL(new RegExp(`/painel/canis/${canil.id}$`));
  await expect(page.getByText("Nenhuma ninhada cadastrada ainda.")).toBeVisible();

  const { data: excluida } = await admin
    .from("kennel_litters")
    .select("deleted_at")
    .eq("id", ninhada!.id)
    .single();
  expect(excluida?.deleted_at, "exclusão é lógica — o registro permanece").not.toBeNull();

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByText("Ninhada a ser excluída.")).toHaveCount(0);
  await semSessao.close();
});

/**
 * ============================================================================
 * O refinamento visual da página pública da ninhada.
 * ============================================================================
 *
 * O que precisa ficar provado, e nenhum destes é decorativo:
 *
 *   - o X da marca fica CENTRADO NAS FOTOS dos progenitores. A primeira
 *     tentativa o colocou na coluna errada: `row-start-1` torna o item de
 *     posição definida, e o grid posiciona esses ANTES dos automáticos, então
 *     o X caía na coluna 1 e empurrava mãe e pai para a direita. É um bug de
 *     uma linha de CSS, invisível em review e óbvio na tela — exatamente o
 *     que uma medição pega e uma asserção de presença não pegaria;
 *   - o CTA diz O QUE ACONTECE ao clicar, antes do clique;
 *   - "Restam ..." é CONTADO do status dos filhotes, não digitado — e o
 *     vendido não entra na conta;
 *   - o FAQ do canil aparece também na ninhada.
 */
test("página da ninhada: X centrado nas fotos, CTA explicado, disponíveis contados e FAQ", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await admin.from("kennels").update({ whatsapp: "5511987654321" }).eq("id", canil.id);

  // Nomes de comprimentos MUITO diferentes de propósito: é o caso que quebra
  // o alinhamento quando um deles ocupa três linhas e o outro uma.
  const pai = await criarCao(admin, criador.id, {
    name: "Chronos",
    sex: "male",
    kennel_id: canil.id,
  });
  const mae = await criarCao(admin, criador.id, {
    name: "Ring Legend's Athena da Casa Grande do Vale",
    sex: "female",
    kennel_id: canil.id,
  });

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      created_by: criador.id,
      sire_id: pai.id,
      dam_id: mae.id,
      born_on: "2026-08-15",
      published_at: new Date().toISOString(),
    })
    .select("id, public_id")
    .single();

  // 2 machos e 1 fêmea disponíveis, 1 macho vendido — o vendido NÃO entra.
  const filhotes: Array<{ sex: "male" | "female"; status: string }> = [
    { sex: "male", status: "available" },
    { sex: "male", status: "available" },
    { sex: "male", status: "sold" },
    { sex: "female", status: "available" },
  ];

  for (const [i, f] of filhotes.entries()) {
    await admin.from("dogs").insert({
      name: `Filhote ${i + 1}`,
      sex: f.sex,
      kennel_id: canil.id,
      litter_id: ninhada!.id,
      litter_status: f.status,
      sire_id: pai.id,
      dam_id: mae.id,
      owner_id: criador.id,
      created_by: criador.id,
      published_at: new Date().toISOString(),
    });
  }

  await admin.from("kennel_faqs").insert({
    kennel_id: canil.id,
    question: "Como funciona a entrega?",
    answer: "Entrego pessoalmente ou por transporte aéreo credenciado.",
    position: 0,
    created_by: criador.id,
  });

  await publicar(admin, { kennelId: canil.id, dogIds: [pai.id, mae.id] });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/n/${ninhada!.public_id}`);

  // O título carrega a data — sem ela, "Ninhada" não distingue esta das
  // outras do mesmo canil para quem recebeu o link.
  await expect(publica.getByRole("heading", { name: "Ninhada de 15/08/2026" })).toBeVisible();

  // --- o X da marca, centrado nas FOTOS ---
  const progenitores = publica.locator("section", { hasText: "Progenitores" }).first();
  const marca = progenitores.locator("svg").first();
  const fotoMae = progenitores.getByRole("link").first().locator("div").first();

  const caixaMarca = await marca.boundingBox();
  const caixaFoto = await fotoMae.boundingBox();
  expect(caixaMarca && caixaFoto).toBeTruthy();

  const centroMarca = caixaMarca!.y + caixaMarca!.height / 2;
  const centroFoto = caixaFoto!.y + caixaFoto!.height / 2;
  expect(
    Math.abs(centroMarca - centroFoto),
    `o X não está centrado na foto (X em ${Math.round(centroMarca)}, foto em ${Math.round(centroFoto)})`,
  ).toBeLessThanOrEqual(2);

  // E ENTRE as duas fotos, não antes delas: o bug original punha o X na
  // primeira coluna, com os dois progenitores à direita dele.
  const fotoPai = progenitores.getByRole("link").nth(1).locator("div").first();
  const caixaPai = await fotoPai.boundingBox();
  expect(caixaFoto!.x, "a mãe deve estar à ESQUERDA do X").toBeLessThan(caixaMarca!.x);
  expect(caixaPai!.x, "o pai deve estar à DIREITA do X").toBeGreaterThan(caixaMarca!.x);

  // --- o CTA explica o que acontece ao clicar ---
  await expect(publica.getByRole("link", { name: /Tenho interesse/ })).toBeVisible();
  await expect(publica.getByText(/fala direto com o criador pelo WhatsApp/)).toBeVisible();
  await expect(publica.getByText(/não participa da negociação/)).toBeVisible();

  // A FRONTEIRA continua: sinalizar interesse é um link, nunca um formulário.
  await expect(publica.locator("form")).toHaveCount(0);

  // --- disponíveis, contados do status ---
  await expect(publica.getByText(/Restam/)).toContainText("2 machos e 1 fêmea");
  // A pílula do topo dá o total — 3, não 4: o vendido não conta.
  await expect(publica.getByText("3 disponíveis", { exact: true })).toBeVisible();

  // --- o FAQ do canil aparece na ninhada ---
  await expect(publica.getByRole("heading", { name: "Perguntas frequentes" })).toBeVisible();
  await expect(publica.getByText("Como funciona a entrega?")).toBeVisible();

  await semSessao.close();
});

/**
 * ============================================================================
 * A prévia de compartilhamento (og:image) da ninhada.
 * ============================================================================
 *
 * Todo link de ninhada mostrava o MESMO card fixo de marca no WhatsApp,
 * tivesse foto ou não. Agora a capa vira o card.
 *
 * NÃO PRECISA DE UPLOAD REAL: `getPublicUrl` do Supabase só concatena string
 * (bucket + caminho), sem ida à rede. Inserir a linha de `media` com o bucket
 * público e um caminho conhecido exercita exatamente o mesmo caminho de
 * código que uma foto de verdade, e a suíte não paga um upload.
 *
 * As três metades da regra, num teste só porque a fixture de usuário é cara:
 * capa presente, ninhada sem foto, e dimensão desconhecida.
 */
test("og:image da ninhada é a foto de capa, com as dimensões reais", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);

  async function criarNinhada(descricao: string) {
    const { data } = await admin
      .from("kennel_litters")
      .insert({
        kennel_id: canil.id,
        created_by: criador.id,
        description: descricao,
        born_on: "2026-08-15",
        published_at: new Date().toISOString(),
      })
      .select("id, public_id")
      .single();
    return data!;
  }

  const comFoto = await criarNinhada("Ninhada com capa.");
  const semFoto = await criarNinhada("Ninhada sem foto nenhuma.");
  const semDimensao = await criarNinhada("Ninhada com foto de dimensão desconhecida.");

  const caminhoCapa = `${criador.id}/litter/${comFoto.id}/capa.webp`;
  const caminhoSemDim = `${criador.id}/litter/${semDimensao.id}/antiga.webp`;

  const { error: erroMidia } = await admin.from("media").insert([
    {
      // O bucket PÚBLICO é o que faz `resolveMediaUrls` devolver
      // `getPublicUrl` em vez de uma URL assinada que expira — é a diferença
      // que decide se o crawler do WhatsApp consegue baixar a imagem.
      bucket_id: "kennel-media-public",
      storage_path: caminhoCapa,
      litter_id: comFoto.id,
      role: "litter_gallery",
      mime: "image/webp",
      size_bytes: 120_000,
      width: 1600,
      height: 1200,
      // Foto de ninhada ocupa um slot 1..4 (`media_litter_position_valid`),
      // não a posição 0 da galeria de cão. `position` 1 é a capa.
      position: 1,
      owner_id: criador.id,
      created_by: criador.id,
    },
    {
      // Linha ANTIGA: as colunas de dimensão nasceram depois de já haver
      // mídia gravada, então nulo aqui é o estado real de parte do banco.
      bucket_id: "kennel-media-public",
      storage_path: caminhoSemDim,
      litter_id: semDimensao.id,
      role: "litter_gallery",
      mime: "image/webp",
      size_bytes: 90_000,
      width: null,
      height: null,
      position: 1,
      owner_id: criador.id,
      created_by: criador.id,
    },
  ]);
  expect(erroMidia, `falhou ao inserir mídia: ${erroMidia?.message}`).toBeNull();

  await publicar(admin, { kennelId: canil.id });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();

  const conteudo = (seletor: string) =>
    publica.locator(seletor).first().getAttribute("content");

  // --- com capa: a foto, absoluta, com as dimensões reais ---
  await publica.goto(`/n/${comFoto.public_id}`);

  const ogImage = await conteudo('meta[property="og:image"]');
  expect(ogImage, "og:image deve ser a capa, não a imagem de marca").toContain(caminhoCapa);
  expect(ogImage, "crawler não resolve URL relativa").toMatch(/^https?:\/\//);
  expect(ogImage).not.toContain("preview-wpp");
  // Sem token de expiração: URL assinada morreria antes do crawler voltar.
  expect(ogImage, "a URL não pode ser assinada").not.toContain("token=");

  expect(await conteudo('meta[property="og:image:width"]')).toBe("1600");
  expect(await conteudo('meta[property="og:image:height"]')).toBe("1200");

  // O Twitter recebe a mesma URL.
  expect(await conteudo('meta[name="twitter:image"]')).toContain(caminhoCapa);

  // --- sem foto: cai na imagem de marca, nunca sem og:image ---
  await publica.goto(`/n/${semFoto.public_id}`);
  const ogFallback = await conteudo('meta[property="og:image"]');
  expect(ogFallback, "sem foto, a marca — nunca ausente").toContain("preview-wpp");
  expect(await conteudo('meta[property="og:image:width"]')).toBe("1536");
  expect(await conteudo('meta[property="og:image:height"]')).toBe("864");

  // --- foto sem dimensão: usa a foto, mas NÃO inventa width/height ---
  await publica.goto(`/n/${semDimensao.public_id}`);
  expect(await conteudo('meta[property="og:image"]')).toContain(caminhoSemDim);
  await expect(
    publica.locator('meta[property="og:image:width"]'),
    "dimensão desconhecida não pode virar número inventado",
  ).toHaveCount(0);
  await expect(publica.locator('meta[property="og:image:height"]')).toHaveCount(0);

  await semSessao.close();
});
