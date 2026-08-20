import { criarCanil, expect, publicar, test } from "./support/fixtures";

/**
 * ============================================================================
 * 14. FAQ — cadastro, reordenação, sugestões e visibilidade
 * ============================================================================
 *
 * MESMA NOTA de `13-depoimentos.spec.ts`: escrito na sessão em que a
 * migration `faq_do_canil` foi aplicada direto em produção, sem acesso ao
 * projeto de dev. Rode `db push` contra dev (depois de linkar com a conta
 * certa) antes de rodar esta suíte.
 *
 * O que precisa ficar provado:
 *
 *   - clicar numa pergunta sugerida preenche o campo, mas NÃO submete nem
 *     pré-preenche a resposta — a resposta é sempre do criador;
 *   - reordenar (▲/▼) muda a ordem exibida, tanto no painel quanto no público;
 *   - sem canil publicado, a seção não aparece mesmo com perguntas cadastradas
 *     (FAQ não tem estado de rascunho próprio — só o do canil importa);
 *   - sem nenhuma pergunta, a seção não existe;
 *   - excluir é lógico.
 */

test("clicar numa sugestão preenche a pergunta, sem submeter nem preencher a resposta", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);

  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("button", { name: "Qual a garantia de saúde?" }).click();

  await expect(page.getByLabel("Pergunta")).toHaveValue("Qual a garantia de saúde?");
  await expect(page.getByLabel("Resposta")).toHaveValue("");

  // Não submeteu sozinho — a lista continua vazia até o criador escrever a
  // resposta e clicar em adicionar.
  await expect(page.getByText("Nenhuma pergunta cadastrada ainda.")).toBeVisible();

  await page.getByLabel("Resposta").fill("90 dias contra doenças genéticas comprovadas.");
  await page.getByRole("button", { name: "Adicionar pergunta" }).click();

  await expect(page.getByText("Pergunta adicionada.")).toBeVisible();
  await expect(page.getByText("Qual a garantia de saúde?")).toBeVisible();
});

test("reordenar muda a ordem exibida no painel e no público", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });

  const perguntas = ["Pergunta A", "Pergunta B", "Pergunta C"];
  for (const [i, question] of perguntas.entries()) {
    await admin.from("kennel_faqs").insert({
      kennel_id: canil.id,
      question,
      answer: `Resposta ${question}`,
      position: i,
      created_by: criador.id,
    });
  }

  await page.goto(`/painel/canis/${canil.id}`);

  const linhas = page.locator("#faq li");
  await expect(linhas).toHaveCount(3);
  await expect(linhas.nth(0)).toContainText("Pergunta A");

  // Move "Pergunta B" (índice 1) pra cima — troca com "Pergunta A".
  await linhas.nth(1).getByRole("button", { name: "Mover para cima" }).click();

  await expect(linhas.nth(0)).toContainText("Pergunta B");
  await expect(linhas.nth(1)).toContainText("Pergunta A");

  // O primeiro item não tem como subir mais.
  await expect(linhas.nth(0).getByRole("button", { name: "Mover para cima" })).toBeDisabled();

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/c/${canil.slug}`);

  const detalhes = publica.locator("details");
  await expect(detalhes.nth(0)).toContainText("Pergunta B");
  await expect(detalhes.nth(1)).toContainText("Pergunta A");
  await expect(detalhes.nth(2)).toContainText("Pergunta C");

  await semSessao.close();
});

test("canil em rascunho: FAQ cadastrada não aparece — não existe rascunho por pergunta", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  // De propósito: canil NÃO publicado.

  await admin.from("kennel_faqs").insert({
    kennel_id: canil.id,
    question: "Pergunta qualquer",
    answer: "Resposta qualquer",
    created_by: criador.id,
  });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  const resp = await publica.goto(`/c/${canil.slug}`);
  expect(resp?.status()).toBe(404);
  await semSessao.close();
});

test("sem nenhuma pergunta, a seção não existe", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByRole("heading", { name: "Perguntas frequentes" })).toHaveCount(0);
  await semSessao.close();
});

test("excluir é lógico: some do painel e do público, a linha permanece no banco", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });

  const { data: faq } = await admin
    .from("kennel_faqs")
    .insert({
      kennel_id: canil.id,
      question: "Pergunta a remover",
      answer: "Resposta a remover",
      created_by: criador.id,
    })
    .select("id")
    .single();

  await page.goto(`/painel/canis/${canil.id}`);
  await expect(page.getByText("Pergunta a remover")).toBeVisible();

  await page
    .locator("#faq li", { hasText: "Pergunta a remover" })
    .getByRole("button", { name: "Remover" })
    .click();

  await expect(page.getByText("Pergunta a remover")).toHaveCount(0);
  await expect(page.getByText("Nenhuma pergunta cadastrada ainda.")).toBeVisible();

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByText("Pergunta a remover")).toHaveCount(0);
  await semSessao.close();

  const { data: linha } = await admin
    .from("kennel_faqs")
    .select("id, deleted_at")
    .eq("id", faq!.id)
    .single();
  expect(linha?.deleted_at).not.toBeNull();
});
