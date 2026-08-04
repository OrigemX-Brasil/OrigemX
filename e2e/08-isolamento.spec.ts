import { anonClient } from "./support/admin";
import { criarCanil, criarCao, expect, publicar, test } from "./support/fixtures";

/**
 * ============================================================================
 * 8. O usuário B não vê nem edita dados de A
 * ============================================================================
 *
 * `npm run test:rls` já prova isto pela API, que é onde a garantia mora. Aqui a
 * pergunta é outra: **a tela respeita a mesma fronteira?** Uma listagem com o
 * filtro errado mostraria dado alheio mesmo com a RLS correta, porque o dono
 * legítimo de outra linha ainda é um usuário autenticado.
 *
 * Aqui `criador` é o B (tem a sessão) e `outroCriador` é o A (dono dos dados).
 */

test("B não enxerga os canis e cães de A nas listagens", async ({
  page,
  criador: b,
  outroCriador: a,
  admin,
}) => {
  const token = Date.now().toString(36);
  const canilDeA = await criarCanil(admin, a.id, { name: `Canil Secreto de A ${token}` });
  const caoDeA = await criarCao(admin, a.id, {
    name: `Cão Secreto de A ${token}`,
    kennel_id: canilDeA.id,
  });

  await page.goto("/painel/canis");
  await expect(page.getByText(`Canil Secreto de A ${token}`)).toHaveCount(0);

  await page.goto("/painel/caes");
  await expect(page.getByText(`Cão Secreto de A ${token}`)).toHaveCount(0);

  // Nem pela busca, que é outro caminho de leitura.
  await page.goto(`/painel/caes?q=${encodeURIComponent(`Secreto de A ${token}`)}`);
  await expect(page.getByText(`Cão Secreto de A ${token}`)).toHaveCount(0);

  expect(b.id).not.toBe(a.id);
  expect(caoDeA.id).toBeTruthy();
});

test("B abrindo a URL direta de A recebe 404", async ({
  page,
  criador: b,
  outroCriador: a,
  admin,
}) => {
  const canilDeA = await criarCanil(admin, a.id);
  const caoDeA = await criarCao(admin, a.id, { kennel_id: canilDeA.id });

  const respCanil = await page.goto(`/painel/canis/${canilDeA.id}`);
  expect(respCanil?.status(), "canil de terceiro tem que dar 404").toBe(404);

  const respCao = await page.goto(`/painel/caes/${caoDeA.id}`);
  expect(respCao?.status(), "cão de terceiro tem que dar 404").toBe(404);

  expect(b.id).not.toBe(a.id);
});

test("B não consegue GRAVAR sobre os dados de A, nem pela API", async ({
  criador: b,
  outroCriador: a,
  admin,
}) => {
  const canilDeA = await criarCanil(admin, a.id, { name: "Nome Original de A" });
  const caoDeA = await criarCao(admin, a.id, {
    name: "Cão Original de A",
    kennel_id: canilDeA.id,
  });

  // Sessão de B falando direto com a API REST — a porta que um atacante usaria,
  // sem passar por nenhuma tela.
  const comoB = anonClient();
  const { error: erroLogin } = await comoB.auth.signInWithPassword({
    email: b.email,
    password: b.password,
  });
  expect(erroLogin).toBeNull();

  await comoB.from("kennels").update({ name: "Invadido" }).eq("id", canilDeA.id);
  await comoB.from("dogs").update({ name: "Invadido" }).eq("id", caoDeA.id);
  // Mover o cão de A para um canil de B também não pode passar.
  const canilDeB = await criarCanil(admin, b.id);
  await comoB.from("dogs").update({ kennel_id: canilDeB.id }).eq("id", caoDeA.id);

  const { data: canil } = await admin.from("kennels").select("name").eq("id", canilDeA.id).single();
  const { data: cao } = await admin
    .from("dogs")
    .select("name, kennel_id")
    .eq("id", caoDeA.id)
    .single();

  expect(canil?.name).toBe("Nome Original de A");
  expect(cao?.name).toBe("Cão Original de A");
  expect(cao?.kennel_id).toBe(canilDeA.id);
});

test("B não vê o rascunho de A nem por leitura direta na API", async ({
  criador: b,
  outroCriador: a,
  admin,
}) => {
  const canilDeA = await criarCanil(admin, a.id);
  const caoDeA = await criarCao(admin, a.id, { kennel_id: canilDeA.id });

  const comoB = anonClient();
  await comoB.auth.signInWithPassword({ email: b.email, password: b.password });

  const { data: canis } = await comoB.from("kennels").select("id").eq("id", canilDeA.id);
  const { data: caes } = await comoB.from("dogs").select("id").eq("id", caoDeA.id);

  expect(canis ?? [], "rascunho de canil de terceiro").toHaveLength(0);
  expect(caes ?? [], "rascunho de cão de terceiro").toHaveLength(0);
});

test("o que A PUBLICA, B vê — e continua não podendo editar", async ({
  page,
  criador: b,
  outroCriador: a,
  admin,
}) => {
  const token = Date.now().toString(36);
  const canilDeA = await criarCanil(admin, a.id, { name: `Canil Público de A ${token}` });
  const caoDeA = await criarCao(admin, a.id, {
    name: `Cão Público de A ${token}`,
    kennel_id: canilDeA.id,
  });
  await publicar(admin, { kennelId: canilDeA.id, dogIds: [caoDeA.id] });

  // Publicado é público: B enxerga, como qualquer visitante.
  const resp = await page.goto(`/d/${caoDeA.public_id}`);
  expect(resp?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: `Cão Público de A ${token}` })).toBeVisible();

  // Mas o painel de edição continua fechado — visível não é o mesmo que
  // gerenciável, e é aqui que uma policy frouxa apareceria.
  const respPainel = await page.goto(`/painel/caes/${caoDeA.id}`);
  expect(respPainel?.status(), "publicado não vira editável por terceiro").toBe(404);

  // E a listagem de B segue sem ele.
  await page.goto("/painel/caes");
  await expect(page.getByText(`Cão Público de A ${token}`)).toHaveCount(0);

  expect(b.id).not.toBe(a.id);
});
