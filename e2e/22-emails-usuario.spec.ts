import { criarCanil, criarCao, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 22. E-mails ao usuário — opt-out, teto de frequência e evento único
 * ============================================================================
 *
 * NADA É ENVIADO AQUI, e é de propósito. Sem `RESEND_API_KEY` no ambiente de
 * teste, a guarda escreve no console em vez de tocar em rede — mas o registro
 * em `user_emails` acontece do mesmo jeito. É isso que torna a REGRA inteira
 * (opt-out, 2 por semana, não repetir) verificável de ponta a ponta sem
 * depender de serviço externo.
 *
 * Os cenários leem `user_emails` pela chave de serviço: a tabela tem RLS
 * habilitada e ZERO policies de propósito — nenhum client a enxerga.
 */

/** As linhas de e-mail daquele usuário, mais recentes primeiro. */
async function emailsDe(
  admin: Parameters<typeof criarCanil>[0],
  profileId: string,
): Promise<{ kind: string }[]> {
  const { data } = await admin
    .from("user_emails")
    .select("kind, sent_at")
    .eq("profile_id", profileId)
    .order("sent_at", { ascending: false });
  return data ?? [];
}

test("o PRIMEIRO cão registra o e-mail; o segundo não", async ({ page, criador, admin }) => {
  await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  await page.goto("/painel/caes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill(`Primeiro ${token}`);
  await page.getByLabel("Sexo").selectOption("male");
  await page.getByRole("button", { name: "Cadastrar cão" }).click();
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}\/pronto$/);

  await expect
    .poll(async () => (await emailsDe(admin, criador.id)).map((e) => e.kind))
    .toContain("primeiro-cao");

  // SEGUNDO cão: o e-mail é de evento único, então nada de novo entra.
  await page.goto("/painel/caes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill(`Segundo ${token}`);
  await page.getByLabel("Sexo").selectOption("female");
  await page.getByRole("button", { name: "Cadastrar cão" }).click();
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}\/pronto$/);

  /**
   * A ESPERA NÃO É PREGUIÇA, é o que torna esta asserção honesta.
   *
   * O envio roda em `after()`, DEPOIS da resposta — ler o banco assim que o
   * `waitForURL` volta mede um instante em que a escrita ainda não teve chance
   * de acontecer, e o teste passaria mesmo com a guarda quebrada. (Foi
   * exatamente o que aconteceu na primeira versão: a prova de não-vacuidade
   * não falhou nem com as DUAS camadas desligadas.)
   *
   * Asserção de AUSÊNCIA precisa cobrir a janela em que o fato poderia
   * ocorrer. `expect.poll` não serve aqui: ele repete até dar certo, que é o
   * oposto do que se quer quando o esperado é "nada aconteceu".
   */
  await page.waitForTimeout(3_000);

  const depois = await emailsDe(admin, criador.id);
  expect(depois.filter((e) => e.kind === "primeiro-cao")).toHaveLength(1);
});

test("com opt-out, nenhum e-mail é registrado", async ({ page, criador, admin }) => {
  await criarCanil(admin, criador.id);
  await admin
    .from("profiles")
    .update({ email_opt_out: new Date().toISOString() })
    .eq("id", criador.id);

  await page.goto("/painel/caes/novo");
  await page
    .getByLabel("Nome", { exact: false })
    .first()
    .fill(`Opt Out ${Date.now().toString(36)}`);
  await page.getByLabel("Sexo").selectOption("male");
  await page.getByRole("button", { name: "Cadastrar cão" }).click();
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}\/pronto$/);

  // Espera a janela do `after()` — ver a nota no primeiro cenário.
  await page.waitForTimeout(3_000);

  // Nada. A vontade da pessoa vem antes de qualquer regra de frequência.
  expect(await emailsDe(admin, criador.id)).toHaveLength(0);
});

test("com 2 e-mails na semana, o terceiro não é registrado", async ({ page, criador, admin }) => {
  await criarCanil(admin, criador.id);

  // Dois envios recentes, de kinds diferentes do que o cadastro dispararia.
  await admin.from("user_emails").insert([
    { profile_id: criador.id, kind: "boas-vindas" },
    { profile_id: criador.id, kind: "canil-publicado" },
  ]);

  await page.goto("/painel/caes/novo");
  await page
    .getByLabel("Nome", { exact: false })
    .first()
    .fill(`Teto ${Date.now().toString(36)}`);
  await page.getByLabel("Sexo").selectOption("male");
  await page.getByRole("button", { name: "Cadastrar cão" }).click();
  await page.waitForURL(/\/painel\/caes\/[0-9a-f-]{36}\/pronto$/);

  await page.waitForTimeout(3_000);

  const linhas = await emailsDe(admin, criador.id);
  expect(linhas).toHaveLength(2);
  expect(linhas.map((e) => e.kind)).not.toContain("primeiro-cao");
});

test("publicar o canil registra o e-mail, e republicar não repete", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  // Cão para o canil ter o que mostrar; `criarCao` não dispara e-mail porque
  // o insert é direto no banco, sem passar pela action.
  await criarCao(admin, criador.id, { kennel_id: canil.id });

  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("heading", { name: "Publicado" })).toBeVisible();

  await expect
    .poll(async () => (await emailsDe(admin, criador.id)).map((e) => e.kind))
    .toContain("canil-publicado");

  // Despublicar e publicar de novo: evento único, então não repete.
  await page.getByRole("button", { name: "Despublicar" }).click();
  await expect(page.getByRole("heading", { name: "Não publicado" })).toBeVisible();
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("heading", { name: "Publicado" })).toBeVisible();

  await page.waitForTimeout(3_000);

  const linhas = await emailsDe(admin, criador.id);
  expect(linhas.filter((e) => e.kind === "canil-publicado")).toHaveLength(1);
});

test("descadastro funciona SEM login e é idempotente", async ({ page, criador, admin }) => {
  const { data: perfil } = await admin
    .from("profiles")
    .select("unsubscribe_token")
    .eq("id", criador.id)
    .single();

  // Contexto LIMPO: o ponto da rota é funcionar para quem clica no rodapé do
  // e-mail sem sessão nenhuma.
  const visitante = await page.context().browser()!.newContext();
  const aba = await visitante.newPage();

  const resp = await aba.goto(`/e/descadastro?t=${perfil!.unsubscribe_token}`);
  expect(resp?.status()).toBe(200);
  await expect(aba.getByRole("heading", { name: "Pedido registrado" })).toBeVisible();

  const { data: depois } = await admin
    .from("profiles")
    .select("email_opt_out")
    .eq("id", criador.id)
    .single();
  expect(depois!.email_opt_out).not.toBeNull();

  // Clicar de novo NÃO reescreve a data: a do primeiro pedido é a que vale
  // numa disputa de LGPD.
  await aba.goto(`/e/descadastro?t=${perfil!.unsubscribe_token}`);
  const { data: terceiro } = await admin
    .from("profiles")
    .select("email_opt_out")
    .eq("id", criador.id)
    .single();
  expect(terceiro!.email_opt_out).toBe(depois!.email_opt_out);

  await visitante.close();
});

test("token inválido responde igual a token válido, e não altera ninguém", async ({
  page,
  criador,
  admin,
}) => {
  // Diferenciar transformaria a rota num verificador de tokens: quem tivesse
  // uma lista descobriria quais existem observando a resposta.
  const visitante = await page.context().browser()!.newContext();
  const aba = await visitante.newPage();

  const resp = await aba.goto("/e/descadastro?t=00000000-0000-4000-8000-000000000000");
  expect(resp?.status()).toBe(200);
  await expect(aba.getByRole("heading", { name: "Pedido registrado" })).toBeVisible();

  const { data } = await admin
    .from("profiles")
    .select("email_opt_out")
    .eq("id", criador.id)
    .single();
  expect(data!.email_opt_out).toBeNull();

  await visitante.close();
});
