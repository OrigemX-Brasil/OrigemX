import { criarCanil, criarCao, expect, publicar, test } from "./support/fixtures";

/**
 * ============================================================================
 * 13. Depoimentos — cadastro, LGPD, regra dupla e vínculo com cão
 * ============================================================================
 *
 * NOTA IMPORTANTE PARA QUEM FOR RODAR ESTE ARQUIVO: escrito na mesma sessão em
 * que a migration `depoimentos_do_canil` foi aplicada DIRETO EM PRODUÇÃO,
 * sem passar pelo projeto de dev (login da CLI sem acesso a ele naquele
 * momento). `.env.local` continua apontando para DEV, que não tem a tabela
 * `testimonials` até essa migration ser aplicada lá também. Rode
 * `npx supabase db push` contra o projeto de dev (depois de linkar com a
 * conta certa) antes de rodar esta suíte — do jeito que está agora, todo
 * teste aqui falha com "relation testimonials does not exist".
 *
 * O que precisa ficar provado:
 *
 *   - sem o checkbox de LGPD marcado, o formulário de adicionar recusa —
 *     mesma técnica de "provar a ausência" que a fronteira de WhatsApp já usa;
 *   - a REGRA DUPLA: depoimento publicado com o canil em rascunho não aparece
 *     em `/c/[slug]`;
 *   - depoimento vinculado a um cão aparece em `/d/[public_id]` dele, e
 *     TAMBÉM na vitrine geral em `/c/[slug]` — não é OU, é E;
 *   - depoimento sem vínculo de cão aparece só em `/c/[slug]`;
 *   - sem depoimento publicado nenhum, a seção não existe em lugar nenhum;
 *   - excluir é lógico: some do painel e do público, sem apagar a linha.
 */

test("sem o checkbox de LGPD, o formulário recusa o envio", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);

  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByLabel("Nome de quem deu o depoimento").fill("Maria Silva");
  // `exact`: "Depoimento" também é substring de "Nome de quem deu o
  // depoimento", o campo logo acima.
  await page.getByLabel("Depoimento", { exact: true }).fill("Ótimo criador, super recomendo!");
  // De propósito: NÃO marca o checkbox de LGPD.
  await page.getByRole("button", { name: "Adicionar depoimento" }).click();

  await expect(
    page.getByText(/Confirme que você tem autorização/),
  ).toBeVisible();

  // E não criou linha nenhuma — a lista continua vazia.
  await expect(page.getByText("Nenhum depoimento cadastrado ainda.")).toBeVisible();
});

test("com o checkbox marcado, adiciona, publica, e a REGRA DUPLA decide a visibilidade", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);

  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByLabel("Nome de quem deu o depoimento").fill("João Pereira");
  // `exact`: "Depoimento" também é substring de "Nome de quem deu o
  // depoimento", o campo logo acima.
  await page.getByLabel("Depoimento", { exact: true }).fill("Cão chegou saudável e muito bem cuidado.");
  await page.getByLabel(/Confirmo que tenho autorização/).check();
  await page.getByRole("button", { name: "Adicionar depoimento" }).click();

  await expect(page.getByText("Depoimento adicionado.")).toBeVisible();

  // Publica o depoimento — mas o CANIL continua em rascunho.
  // Escopado a `#depoimentos`: o `PublishToggle` do CANIL, mais acima na
  // mesma tela, também tem um botão "Publicar".
  await page.locator("#depoimentos").getByRole("button", { name: "Publicar" }).click();

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();

  // Canil em rascunho: a REGRA DUPLA esconde o depoimento mesmo publicado.
  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByText("João Pereira")).toHaveCount(0);

  // Publica o canil — agora as duas metades da regra estão satisfeitas.
  await publicar(admin, { kennelId: canil.id });
  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByRole("heading", { name: "Depoimentos" })).toBeVisible();
  await expect(publica.getByText("João Pereira")).toBeVisible();
  await expect(publica.getByText("Cão chegou saudável e muito bem cuidado.")).toBeVisible();

  await semSessao.close();
});

test("depoimento vinculado a um cão aparece na página dele E na vitrine do canil", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { name: "Rex", kennel_id: canil.id });

  const semVinculo = await criarCao(admin, criador.id, {
    name: "Fera",
    kennel_id: canil.id,
  });
  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id, semVinculo.id] });

  const { data: comCao } = await admin
    .from("testimonials")
    .insert({
      kennel_id: canil.id,
      dog_id: cao.id,
      author_name: "Ana Costa",
      text: "O Rex é exatamente como prometido.",
      created_by: criador.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const { data: semCao } = await admin
    .from("testimonials")
    .insert({
      kennel_id: canil.id,
      author_name: "Pedro Alves",
      text: "Canil sério, recomendo a todos.",
      created_by: criador.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  expect(comCao?.id && semCao?.id).toBeTruthy();

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();

  // A vitrine do canil mostra os DOIS — vinculado ou não.
  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByText("Ana Costa")).toBeVisible();
  await expect(publica.getByText("Pedro Alves")).toBeVisible();

  // A página do Rex mostra só o que fala DELE.
  await publica.goto(`/d/${cao.public_id}`);
  await expect(publica.getByText("Ana Costa")).toBeVisible();
  await expect(publica.getByText("Pedro Alves")).toHaveCount(0);

  // A página da Fera não mostra nenhum — nenhum depoimento a cita.
  await publica.goto(`/d/${semVinculo.public_id}`);
  await expect(publica.getByText("Ana Costa")).toHaveCount(0);
  await expect(publica.getByText("Pedro Alves")).toHaveCount(0);
  await expect(publica.getByRole("heading", { name: "Depoimentos" })).toHaveCount(0);

  await semSessao.close();
});

test("sem depoimento publicado, a seção não existe em lugar nenhum", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();

  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByRole("heading", { name: "Depoimentos" })).toHaveCount(0);

  await semSessao.close();
});

test("excluir é lógico: some do painel e do público, a linha permanece no banco", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });

  const { data: testimonial } = await admin
    .from("testimonials")
    .insert({
      kennel_id: canil.id,
      author_name: "Carla Souza",
      text: "Melhor canil da região.",
      created_by: criador.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await page.goto(`/painel/canis/${canil.id}`);
  await expect(page.getByText("Carla Souza")).toBeVisible();

  await page
    .locator("li", { hasText: "Carla Souza" })
    .getByRole("button", { name: "Remover" })
    .click();

  await expect(page.getByText("Carla Souza")).toHaveCount(0);
  await expect(page.getByText("Nenhum depoimento cadastrado ainda.")).toBeVisible();

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByText("Carla Souza")).toHaveCount(0);
  await semSessao.close();

  const { data: linha } = await admin
    .from("testimonials")
    .select("id, deleted_at")
    .eq("id", testimonial!.id)
    .single();
  expect(linha?.deleted_at).not.toBeNull();
});
