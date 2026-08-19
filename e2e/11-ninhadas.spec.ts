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
