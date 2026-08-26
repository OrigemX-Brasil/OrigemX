import {
  anonClient,
  criarAdmin,
  criarUsuario,
  limparUsuario,
  SENHA_PADRAO,
  type TestUser,
} from "./support/admin";
import { criarCanil, criarCao, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 21. Funil de ativação — /admin
 * ============================================================================
 *
 * A pergunta que a plataforma não sabia responder: de cada 100 contas criadas,
 * quantas chegam a cadastrar o primeiro cão. Não sai de `landing_events` e não
 * poderia sair — aquela tabela é anônima por construção, sem id de usuário.
 * Sai de `profiles`/`kennels`/`dogs`, pela RPC `admin_user_funnel`.
 *
 * TUDO AQUI É MEDIDO POR DELTA, nunca por número absoluto. O funil conta a base
 * INTEIRA, e a base de teste carrega resíduo de todos os outros cenários — um
 * `expect(total).toBe(3)` passaria hoje e quebraria amanhã por motivo nenhum.
 * Medir antes e depois isola o que este teste criou.
 *
 * A LEITURA É COM SESSÃO DE ADMIN, não com a chave de serviço: `private.is_admin()`
 * lê `auth.uid()`, que é nulo para a chave de serviço — ela não passa na guarda,
 * e é assim que tem de ser.
 */

/** Cliente autenticado como o usuário dado, para chamar a RPC direto. */
async function clienteDe(user: TestUser) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: SENHA_PADRAO,
  });
  if (error) throw new Error(`não consegui autenticar ${user.email}: ${error.message}`);
  return client;
}

type Contagens = {
  total: number;
  with_kennel: number;
  with_dog: number;
  with_published_dog: number;
  with_kennel_no_dog: number;
};

async function lerFunil(user: TestUser): Promise<Contagens> {
  const client = await clienteDe(user);
  const { data, error } = await client.rpc("admin_user_funnel");
  if (error) throw new Error(`funil falhou: ${error.message}`);
  return (data as Contagens[])[0]!;
}

test("as etapas contam o que foi criado — medido por delta", async ({ admin }) => {
  const adminUser = await criarAdmin("funil-admin");
  const antes = await lerFunil(adminUser);

  // Três criadores em estados diferentes, cobrindo as três etapas.
  const soConta = await criarUsuario("funil-so-conta");
  const comCanil = await criarUsuario("funil-com-canil");
  const comCao = await criarUsuario("funil-com-cao");
  const comPublicado = await criarUsuario("funil-publicado");

  const k1 = await criarCanil(admin, comCanil.id);
  const k2 = await criarCanil(admin, comCao.id);
  const k3 = await criarCanil(admin, comPublicado.id);
  await criarCao(admin, comCao.id, { kennel_id: k2.id });
  await criarCao(admin, comPublicado.id, { kennel_id: k3.id, published: true });

  const depois = await lerFunil(adminUser);

  // Quatro criadores novos entraram no denominador.
  expect(depois.total - antes.total).toBe(4);
  // Três ganharam canil.
  expect(depois.with_kennel - antes.with_kennel).toBe(3);
  // Dois ganharam cão; um deles publicou.
  expect(depois.with_dog - antes.with_dog).toBe(2);
  expect(depois.with_published_dog - antes.with_published_dog).toBe(1);
  // Um só: canil sem nenhum cão. (`comCanil`.)
  expect(depois.with_kennel_no_dog - antes.with_kennel_no_dog).toBe(1);

  expect(k1.id).toBeTruthy();
  for (const u of [soConta, comCanil, comCao, comPublicado]) await limparUsuario(u.id);
  await limparUsuario(adminUser.id);
});

test("cão SEM canil conta na etapa do cão — o funil não é aninhado", async ({ admin }) => {
  /**
   * É a razão de cada etapa ser medida contra o TOTAL, e não contra a anterior.
   * `dogs.kennel_id` é nullable e `/painel/caes/novo` cadastra cão sem canil,
   * então existe criador na etapa "tem cão" que nunca passou por "tem canil".
   * Num funil clássico ele seria conversão de uma etapa por onde não passou.
   */
  const adminUser = await criarAdmin("funil-sem-canil-admin");
  const antes = await lerFunil(adminUser);

  const solto = await criarUsuario("funil-cao-solto");
  await criarCao(admin, solto.id, { kennel_id: null });

  const depois = await lerFunil(adminUser);

  expect(depois.with_dog - antes.with_dog).toBe(1);
  expect(depois.with_kennel - antes.with_kennel).toBe(0);
  // E não entra na evasão: ele não tem canil para ter parado nele.
  expect(depois.with_kennel_no_dog - antes.with_kennel_no_dog).toBe(0);

  await limparUsuario(solto.id);
  await limparUsuario(adminUser.id);
});

test("conta de ADMIN não entra no denominador", async () => {
  const adminUser = await criarAdmin("funil-denominador");
  const antes = await lerFunil(adminUser);

  const outroAdmin = await criarAdmin("funil-outro-admin");
  const depois = await lerFunil(adminUser);

  // O admin novo existe em `profiles`, mas o funil é sobre CRIADORES: uma conta
  // de admin nunca vai cadastrar cão e puxaria a taxa para baixo sem significar
  // nada.
  expect(depois.total).toBe(antes.total);

  await limparUsuario(outroAdmin.id);
  await limparUsuario(adminUser.id);
});

test("ancestral fantasma não conta como cão cadastrado", async ({ admin }) => {
  // Fantasma tem `owner_id` nulo — é nó de árvore de outra pessoa, não cão de
  // ninguém. A RPC filtra por `owner_id is not null`, e é o que este cenário
  // prende.
  const adminUser = await criarAdmin("funil-fantasma");
  const dono = await criarUsuario("funil-dono-fantasma");
  const antes = await lerFunil(adminUser);

  const { error } = await admin.from("dogs").insert({
    name: `Fantasma Funil ${Date.now().toString(36)}`,
    sex: "male",
    owner_id: null,
    kennel_id: null,
    created_by: dono.id,
  });
  expect(error).toBeNull();

  const depois = await lerFunil(adminUser);
  expect(depois.with_dog - antes.with_dog).toBe(0);

  await limparUsuario(dono.id);
  await limparUsuario(adminUser.id);
});

test("criador comum NÃO consegue ler o funil, nem chamando a RPC direto", async () => {
  /**
   * A guarda mora DENTRO da função, além da rota. A rota `/admin` já barra
   * não-admin, mas a RPC é chamável por qualquer sessão autenticada via
   * PostgREST — e quantos usuários a plataforma tem não é dado de criador.
   */
  const comum = await criarUsuario("funil-comum");
  const client = await clienteDe(comum);

  const { data, error } = await client.rpc("admin_user_funnel");

  expect(error, "criador comum tem de ser recusado").not.toBeNull();
  expect(data).toBeNull();

  await limparUsuario(comum.id);
});

test("a Visão geral mostra o funil, com a métrica principal em destaque", async ({
  page,
  adminUser,
  autenticar,
}) => {
  await autenticar(page, adminUser);
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "Ativação" })).toBeVisible();
  await expect(page.getByText("Cadastraram o primeiro cão")).toBeVisible();

  // As quatro etapas, cada uma com sua barra rotulada.
  for (const etapa of [
    "Criadores",
    "Com canil",
    "Com ao menos 1 cão",
    "Com ao menos 1 cão publicado",
  ]) {
    await expect(
      page.getByRole("progressbar", { name: `${etapa}, fatia do total de criadores` }),
    ).toBeVisible();
  }

  // O aviso de que canil e cão se sobrepõem — é o que impede a leitura errada
  // de funil em cadeia.
  await expect(page.getByText(/se sobrep|não são degraus/)).toBeVisible();
});
