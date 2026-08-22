import { expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 12. Home do painel — os dois atalhos de ninhada
 * ============================================================================
 *
 * Os atalhos só existem quando há para onde levar: sem canil, não há `id`
 * para montar `/painel/canis/[id]`. "Meu canil" e "Cães" não têm essa
 * condição — sempre aparecem — e este arquivo não testa os dois, só o
 * comportamento condicional.
 *
 * SÃO DOIS ATALHOS, e a razão é histórica. Numa rodada anterior existia um
 * só, indo direto pra `/ninhadas/novo`: foi reportado como bug depois de
 * subir pra produção, porque jogava quem já tinha ninhada dentro de um
 * formulário de criar outra, sem ver o que já havia cadastrado. Trocar o
 * destino pela âncora `#ninhadas` consertou aquele caso e criou o oposto —
 * cadastrar passou a exigir dois passos.
 *
 * Por isso os testes abaixo prendem os DOIS caminhos ao mesmo tempo:
 * "Ver minhas ninhadas" precisa continuar pousando na seção que resolve
 * lista/empty-state, e "Cadastrar nova ninhada" precisa abrir o formulário
 * direto. Se um dos dois sumir, ou se um passar a fazer o trabalho do outro,
 * este arquivo falha.
 *
 * "VER MINHAS NINHADAS" TEM UM SEGUNDO DESVIO — quando já existe ninhada
 * cadastrada, ele pula a lista e vai direto para EDITAR a mais recente, com
 * os dados dela já carregados no formulário. Não é o mesmo erro do
 * parágrafo acima: aquele bug era ir direto para CRIAR (formulário vazio,
 * escondendo o que já existia); este vai direto para EDITAR o que já existe
 * (formulário preenchido, nada escondido). Sem ninhada, cai de volta na
 * âncora; com duas ou mais, vai para a mais recente.
 */

test("com canil, a home mostra os dois atalhos, cada um no seu destino", async ({
  page,
  criador,
  admin,
}) => {
  const { data } = await admin
    .from("kennels")
    .insert({
      name: "Canil Com Atalho",
      slug: `atalho-${Date.now().toString(36)}`,
      owner_id: criador.id,
      created_by: criador.id,
    })
    .select("id")
    .single();

  await page.goto("/painel");

  const verLink = page.getByRole("link", { name: "Ver minhas ninhadas" });
  const criarLink = page.getByRole("link", { name: "Cadastrar nova ninhada" });

  await expect(verLink).toBeVisible();
  await expect(verLink).toHaveAttribute("href", `/painel/canis/${data!.id}#ninhadas`);
  await expect(criarLink).toBeVisible();
  await expect(criarLink).toHaveAttribute("href", `/painel/canis/${data!.id}/ninhadas/novo`);

  // Não só o href: a navegação real precisa pousar na seção que resolve
  // lista/empty-state, com o empty-state visível (este canil não tem
  // nenhuma ninhada).
  await verLink.click();
  await expect(page.getByText("Nenhuma ninhada cadastrada ainda.")).toBeVisible();

  // E o segundo abre o FORMULÁRIO, não a listagem. Volta pra home e clica
  // nele — clicar a partir da home é o caminho que o usuário faz, e é o que
  // prova que a rota funciona sem depender de passar pela página do canil
  // antes.
  await page.goto("/painel");
  await criarLink.click();
  await expect(page.getByRole("heading", { name: "Nova ninhada" })).toBeVisible();
});

test("com UMA ninhada cadastrada, 'Ver minhas ninhadas' vai direto para editá-la", async ({
  page,
  criador,
  admin,
}) => {
  const { data: kennel } = await admin
    .from("kennels")
    .insert({
      name: "Canil Com Ninhada",
      slug: `atalho-ninhada-${Date.now().toString(36)}`,
      owner_id: criador.id,
      created_by: criador.id,
    })
    .select("id")
    .single();

  const { data: litter } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: kennel!.id,
      created_by: criador.id,
      description: "Ninhada de teste do atalho",
    })
    .select("id")
    .single();

  await page.goto("/painel");
  const verLink = page.getByRole("link", { name: "Ver minhas ninhadas" });
  await expect(verLink).toHaveAttribute(
    "href",
    `/painel/canis/${kennel!.id}/ninhadas/${litter!.id}`,
  );

  // Não só o href: a navegação real precisa cair na tela de EDITAR, com o
  // formulário já preenchido — não a lista, e não um formulário vazio.
  await verLink.click();
  await expect(page.getByRole("heading", { name: "Ninhada", exact: true })).toBeVisible();
  await expect(page.getByLabel("Descrição")).toHaveValue("Ninhada de teste do atalho");
});

test("com DUAS ninhadas, 'Ver minhas ninhadas' vai para a MAIS RECENTE, não a mais antiga", async ({
  page,
  criador,
  admin,
}) => {
  const { data: kennel } = await admin
    .from("kennels")
    .insert({
      name: "Canil Com Duas Ninhadas",
      slug: `atalho-duas-ninhadas-${Date.now().toString(36)}`,
      owner_id: criador.id,
      created_by: criador.id,
    })
    .select("id")
    .single();

  // `created_at` forçado para não depender de tempo real decorrido entre os
  // dois inserts — a antiga fica no passado, a nova usa o `now()` padrão.
  const { data: antiga } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: kennel!.id,
      created_by: criador.id,
      description: "Ninhada antiga",
      created_at: "2026-01-01T00:00:00Z",
    })
    .select("id")
    .single();
  const { data: recente } = await admin
    .from("kennel_litters")
    .insert({ kennel_id: kennel!.id, created_by: criador.id, description: "Ninhada recente" })
    .select("id")
    .single();

  await page.goto("/painel");
  const verLink = page.getByRole("link", { name: "Ver minhas ninhadas" });
  const href = await verLink.getAttribute("href");

  expect(href).toBe(`/painel/canis/${kennel!.id}/ninhadas/${recente!.id}`);
  expect(href).not.toContain(antiga!.id);
});

test("sem canil, a home não mostra nenhum dos dois atalhos", async ({ page, criador }) => {
  expect(criador.id).toBeTruthy();

  await page.goto("/painel");

  await expect(page.getByRole("link", { name: "Ver minhas ninhadas" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Cadastrar nova ninhada" })).toHaveCount(0);
});
