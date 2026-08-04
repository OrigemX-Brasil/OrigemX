import { criarCanil, criarCao, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 7. O QR aponta para o perfil certo
 * ============================================================================
 *
 * O QR é o único artefato do produto que não dá para corrigir depois: quando o
 * criador troca o nome do cão, o papel já está na mão de alguém.
 *
 * Por isso o teste central não é "gera um QR" — é **o alvo não muda**.
 */

/** A URL impressa vem da env canônica, não do host onde o teste roda. */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

test("o QR do cão aponta para /d/{public_id} e o dono consegue conferir na tela", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id, name: "Rex do Alvo" });

  await page.goto(`/painel/caes/${cao.id}`);

  const cartao = page.locator("section", { hasText: "QR Code" });
  await expect(cartao.locator("svg[role='img']")).toBeVisible();

  // A URL aparece em TEXTO para o dono conferir antes de mandar imprimir.
  await expect(cartao.locator("code")).toHaveText(`${SITE}/d/${cao.public_id}`);

  // E o rótulo acessível do desenho diz o mesmo, para quem usa leitor de tela.
  await expect(cartao.locator("svg[role='img']")).toHaveAttribute(
    "aria-label",
    `QR Code que aponta para ${SITE}/d/${cao.public_id}`,
  );
});

test("trocar o nome do cão NÃO muda o QR — é o ponto do identificador estável", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, {
    kennel_id: canil.id,
    name: "Nome Que Vai Mudar",
  });

  await page.goto(`/painel/caes/${cao.id}`);
  const antes = await page.locator("section", { hasText: "QR Code" }).locator("code").textContent();

  // Troca pela TELA, como o criador faria.
  await page.getByLabel("Nome").fill("Nome Totalmente Outro");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("heading", { name: "Nome Totalmente Outro" })).toBeVisible();

  const depois = await page
    .locator("section", { hasText: "QR Code" })
    .locator("code")
    .textContent();

  expect(depois, "o QR impresso não pode quebrar quando o nome muda").toBe(antes);
  expect(depois).toBe(`${SITE}/d/${cao.public_id}`);

  // E o banco confirma: `public_id` é congelado por trigger.
  const { data } = await admin.from("dogs").select("public_id, name").eq("id", cao.id).single();
  expect(data?.name).toBe("Nome Totalmente Outro");
  expect(data?.public_id).toBe(cao.public_id);
});

test("o QR do canil aponta para /c/{slug}", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);

  await page.goto(`/painel/canis/${canil.id}`);
  const cartao = page.locator("section", { hasText: "QR Code" });

  await expect(cartao.locator("code")).toHaveText(`${SITE}/c/${canil.slug}`);
});

test("o download sai em PNG e em SVG, com nome de arquivo reconhecível", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id, name: "Ipê Amarelo" });

  await page.goto(`/painel/caes/${cao.id}`);

  const png = await page.request.get(`/api/qr/dog/${cao.id}?format=png&size=1024`);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  const bytes = await png.body();
  // Assinatura de PNG. Sem isto, um HTML de erro passaria como "200 ok".
  expect(bytes.subarray(0, 4).toString("hex")).toBe("89504e47");
  expect(bytes.byteLength).toBeGreaterThan(1000);

  const disposicao = png.headers()["content-disposition"] ?? "";
  expect(disposicao).toContain("attachment");
  // Nome com o acento resolvido e o identificador estável junto, para conferir
  // na gráfica de qual cão é o arquivo.
  expect(disposicao).toContain("origemx-cao-ipe-amarelo");
  expect(disposicao).toContain(cao.public_id);

  const svg = await page.request.get(`/api/qr/dog/${cao.id}?format=svg`);
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");

  const texto = await svg.text();
  // Preto no branco, sempre — requisito de leitura óptica, não estética.
  expect(texto).toContain('fill="#000000"');
  expect(texto).toContain('fill="#ffffff"');
});

test("o QR de outra pessoa dá 404, não a imagem", async ({
  page,
  criador,
  outroCriador,
  admin,
}) => {
  const canilAlheio = await criarCanil(admin, outroCriador.id);
  const caoAlheio = await criarCao(admin, outroCriador.id, { kennel_id: canilAlheio.id });

  await page.goto("/painel");
  const resp = await page.request.get(`/api/qr/dog/${caoAlheio.id}?format=png`);

  // 404 e não 403: dizer "existe, mas não é seu" já conta algo.
  expect(resp.status()).toBe(404);
  expect(criador.id).not.toBe(outroCriador.id);
});
