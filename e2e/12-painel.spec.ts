import { expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 12. Home do painel — atalho de Ninhadas
 * ============================================================================
 *
 * O atalho só existe quando há para onde ele levar: sem canil, não há `id`
 * para montar `/painel/canis/[id]/ninhadas/novo`. "Meu canil" e "Cães" não
 * têm essa condição — sempre aparecem — e este arquivo não testa os dois,
 * só o comportamento novo.
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
  await expect(link).toHaveAttribute("href", `/painel/canis/${data!.id}/ninhadas/novo`);
});

test("sem canil, a home não mostra o atalho de Ninhadas", async ({ page, criador }) => {
  expect(criador.id).toBeTruthy();

  await page.goto("/painel");

  await expect(page.getByRole("link", { name: "Ninhadas" })).toHaveCount(0);
});
