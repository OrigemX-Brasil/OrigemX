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

/**
 * ============================================================================
 * A nota em estrelas — marcar N acende as N primeiras, não só a última.
 * ============================================================================
 *
 * O truque de CSS (`peer-checked:text-data` com os 5 rádios em ordem
 * inversa no DOM + `flex-row-reverse`) só funciona com `<input>` e `<label>`
 * como IRMÃOS DIRETOS — é o combinador `~` do CSS, que só atravessa
 * elementos que compartilham o MESMO pai. Uma versão anterior deste
 * componente envolvia cada input no PRÓPRIO label (`<label><input/><svg/>
 * </label>`), o que prendia cada par numa caixa separada e quebrava a
 * cadeia: só a estrela clicada acendia, nunca as anteriores.
 *
 * `waitForTimeout` aqui NÃO é arbitrário — é medido: o label tem
 * `transition-colors`, e ler `getComputedStyle` no mesmo tick do clique
 * captura a cor NO MEIO da transição (confirmado batendo o mesmo teste sem
 * a espera: o valor mudava a cada execução, nunca uma cor estável). 250ms
 * cobre a transição do projeto com folga.
 */
test("marcar N estrelas acende as N primeiras, não só a última", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  await page.goto(`/painel/canis/${canil.id}`);

  const secao = page.locator("#depoimentos");
  const estrela = (n: number) => secao.locator(`label[for="testimonial-nota-${n}"]`);

  async function coresApos(nota: number): Promise<string[]> {
    await estrela(nota).click();
    await page.waitForTimeout(250);
    return Promise.all([1, 2, 3, 4, 5].map((n) => estrela(n).evaluate((el) => getComputedStyle(el).color)));
  }

  // 3 de 5: as três primeiras (1,2,3) na MESMA cor entre si, as duas
  // últimas (4,5) na mesma cor entre si, e as duas cores DIFERENTES.
  const cores3 = await coresApos(3);
  expect(new Set(cores3.slice(0, 3)).size, "1,2,3 deveriam ter a mesma cor (acesas)").toBe(1);
  expect(new Set(cores3.slice(3, 5)).size, "4,5 deveriam ter a mesma cor (apagadas)").toBe(1);
  expect(cores3[0]).not.toBe(cores3[4]);

  // 5 de 5 — o caso exato do relato: as CINCO precisam ficar na MESMA cor,
  // não só a última.
  const cores5 = await coresApos(5);
  expect(new Set(cores5).size, `esperava 1 cor para as 5 estrelas, veio ${JSON.stringify(cores5)}`).toBe(
    1,
  );

  // E VOLTAR para 2 confirma que não é um artefato de "sempre acende tudo"
  // — só as duas primeiras acendem, as três de cima apagam de novo.
  const cores2 = await coresApos(2);
  expect(new Set(cores2.slice(0, 2)).size).toBe(1);
  expect(new Set(cores2.slice(2, 5)).size).toBe(1);
  expect(cores2[0]).not.toBe(cores2[2]);
});
