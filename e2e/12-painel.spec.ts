import { expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 12. Home do painel — atalho de Ninhadas
 * ============================================================================
 *
 * O atalho só existe quando há para onde ele levar: sem canil, não há `id`
 * para montar `/painel/canis/[id]`. "Meu canil" e "Cães" não têm essa
 * condição — sempre aparecem — e este arquivo não testa os dois, só o
 * comportamento novo.
 *
 * O link vai pra página do CANIL (`#ninhadas`), não direto pro formulário de
 * criação: a seção de lá já resolve lista OU empty-state sozinha. Pular pra
 * `/novo` jogaria quem já tem ninhada dentro do formulário de criar outra,
 * sem ver o que já cadastrou — era assim numa rodada anterior, e foi
 * reportado como bug depois de subir pra produção.
 */

test("com canil, a home mostra o atalho de Ninhadas apontando pro canil certo", async ({
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

  const link = page.getByRole("link", { name: "Ninhadas" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `/painel/canis/${data!.id}#ninhadas`);

  // Não só o href: a navegação real precisa pousar na seção que resolve
  // lista/empty-state, com o empty-state visível (este canil não tem
  // nenhuma ninhada).
  await link.click();
  await expect(page.getByText("Nenhuma ninhada cadastrada ainda.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cadastrar nova ninhada" })).toBeVisible();
});

test("sem canil, a home não mostra o atalho de Ninhadas", async ({ page, criador }) => {
  expect(criador.id).toBeTruthy();

  await page.goto("/painel");

  await expect(page.getByRole("link", { name: "Ninhadas" })).toHaveCount(0);
});
