import { alerta, criarCanil, criarCao, expect, publicar, test } from "./support/fixtures";
import { MIME, NOME_ARQUIVO, pngDeTeste } from "./support/imagem";

/**
 * ============================================================================
 * 5. Upload de imagem → thumbnail na listagem
 * ============================================================================
 *
 * O que precisa ficar provado, e não só "subiu":
 *
 *   - a compressão acontece NO NAVEGADOR (o arquivo que sai é menor que o que
 *     entrou e vira WebP);
 *   - o banco guarda URL e metadata, NUNCA base64;
 *   - a galeria exibe o THUMBNAIL, não a imagem cheia.
 */

test("sobe a foto, comprime no navegador e a galeria usa o thumbnail", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id });

  const original = await pngDeTeste("upload e2e", 900);

  await page.goto(`/painel/caes/${cao.id}`);
  await page.getByLabel("Adicionar imagem").setInputFiles({
    name: NOME_ARQUIVO,
    mimeType: MIME,
    buffer: original,
  });

  // A galeria só aparece depois que o servidor confirmou a linha.
  const galeria = page.locator("section", { hasText: "Galeria" });
  await expect(galeria.locator("img").first()).toBeVisible({ timeout: 30_000 });

  const { data: media } = await admin
    .from("media")
    .select("storage_path, thumb_path, mime, size_bytes, thumb_bytes, width, height")
    .eq("dog_id", cao.id)
    .single();

  expect(media, "a linha de mídia tem que existir").toBeTruthy();

  // NUNCA base64: o banco guarda caminho, e caminho não tem cara de dado.
  expect(media!.storage_path).not.toContain("base64");
  expect(media!.storage_path).not.toMatch(/^data:/);
  expect(media!.storage_path.length).toBeLessThan(300);

  // Comprimiu no navegador: saiu WebP e menor que o PNG que entrou.
  expect(media!.mime).toBe("image/webp");
  expect(media!.size_bytes).toBeLessThan(original.byteLength);

  // Duas variantes, cada uma dentro do seu teto.
  //
  // A comparação óbvia — thumb menor que a cheia em BYTES — não vale para toda
  // imagem: neste teste a fonte é um QR, alto contraste e sem gradiente, e o
  // WebP da versão reduzida chega a passar o da cheia. O contrato de verdade
  // são os limites, e é isso que se afirma.
  expect(media!.thumb_path, "o thumbnail tem que existir").toBeTruthy();
  expect(media!.size_bytes).toBeLessThanOrEqual(600 * 1024);
  expect(media!.thumb_bytes!).toBeLessThanOrEqual(80 * 1024);

  // Redimensionou para dentro do teto.
  expect(Math.max(media!.width!, media!.height!)).toBeLessThanOrEqual(1600);

  // E a tela mostra o THUMBNAIL, não a imagem cheia — é uma listagem.
  const src = await galeria.locator("img").first().getAttribute("src");
  expect(src, "a galeria tem que apontar para o thumb").toContain(
    media!
      .thumb_path!.split("/")
      .pop()!
      .replace(/\.[a-z]+$/, ""),
  );
});

test("arquivo que não é imagem é recusado antes de subir", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id });

  await page.goto(`/painel/caes/${cao.id}`);
  await page.getByLabel("Adicionar imagem").setInputFiles({
    name: "contrato.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 nao sou imagem"),
  });

  await expect(alerta(page).first()).toBeVisible();

  const { data } = await admin.from("media").select("id").eq("dog_id", cao.id);
  expect(data ?? [], "nada pode ter sido gravado").toHaveLength(0);
});

test("a foto publicada aparece no perfil público, servida sem token", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id });

  await page.goto(`/painel/caes/${cao.id}`);
  await page.getByLabel("Adicionar imagem").setInputFiles({
    name: NOME_ARQUIVO,
    mimeType: MIME,
    buffer: await pngDeTeste("publica", 700),
  });
  await expect(page.locator("section", { hasText: "Galeria" }).locator("img").first()).toBeVisible({
    timeout: 30_000,
  });

  // Publicar MOVE o arquivo para o bucket público — é o que torna o QR
  // impresso viável, porque URL assinada expira e o papel não.
  //
  // O canil vai por baixo (é pré-requisito, não o que se testa); o CÃO vai pelo
  // botão, porque é o fluxo que move a imagem. Publicar os dois por baixo
  // deixaria o botão dizendo "Despublicar" e o clique faria o contrário.
  await publicar(admin, { kennelId: canil.id });
  await page.goto(`/painel/caes/${cao.id}`);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  // `exact: true` é obrigatório: sem ele, "Publicado" casa dentro de "Não
  // publicado" e a asserção passa na hora, antes de qualquer coisa acontecer.
  // Foi assim que este teste "passou" mostrando um cão que continuava rascunho.
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // Confere o estado no banco ANTES de abrir a página pública: se falhar aqui,
  // o problema é publicação; se falhar depois, é renderização. Sem isto, um 404
  // na página pública não diz qual dos dois quebrou.
  const { data: publicado } = await admin
    .from("dogs")
    .select("published_at, deleted_at, owner_id, kennel_id")
    .eq("id", cao.id)
    .single();
  expect(publicado?.published_at, "o clique em Publicar tinha que gravar").not.toBeNull();

  const { data: arquivos } = await admin
    .from("media")
    .select("bucket_id")
    .eq("dog_id", cao.id)
    .is("deleted_at", null);
  expect(arquivos?.[0]?.bucket_id, "publicar MOVE o arquivo para o bucket público").toBe(
    "kennel-media-public",
  );

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  const resp = await publica.goto(`/d/${cao.public_id}`);
  expect(resp?.status(), "cão publicado tem que abrir para o público").toBe(200);

  const img = publica.locator("main img").first();
  await expect(img).toBeVisible();

  const src = (await img.getAttribute("src")) ?? "";
  // URL pública não carrega token nem expiração: se carregasse, o QR impresso
  // pararia de funcionar quando a assinatura vencesse.
  expect(src).not.toContain("token=");
  expect(src).not.toContain("X-Amz-Expires");

  await semSessao.close();
});

/**
 * A ORDEM INVERSA do teste anterior — e era exatamente aqui que quebrava.
 *
 * "Publicar" move para o bucket público o que existe NAQUELE momento. Uma
 * foto adicionada DEPOIS não tinha gatilho nenhum que a movesse: ficava presa
 * no privado, e a página pública usa o client anônimo, que não tem policy de
 * leitura no bucket privado — a foto sumia em silêncio, sem erro. Era o bug
 * relatado em produção.
 *
 * O cão nasce e é publicado DIRETO no banco (fixture, não fluxo de app) de
 * propósito: o que se testa é o upload num cão que JÁ está publicado, não o
 * clique em Publicar em si — esse já tem o teste acima.
 */
test("foto adicionada DEPOIS de publicar aparece no perfil público sem novo clique em Publicar", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id, published: true });
  await publicar(admin, { kennelId: canil.id });

  await page.goto(`/painel/caes/${cao.id}`);
  // O botão já diz "Despublicar": não há como clicar em "Publicar" de novo sem
  // antes tirar o cão do ar. É exatamente essa a situação que o bug explora.
  await expect(page.getByRole("button", { name: "Despublicar", exact: true })).toBeVisible();

  await page.getByLabel("Adicionar imagem").setInputFiles({
    name: NOME_ARQUIVO,
    mimeType: MIME,
    buffer: await pngDeTeste("depois de publicar", 700),
  });
  await expect(page.locator("section", { hasText: "Galeria" }).locator("img").first()).toBeVisible({
    timeout: 30_000,
  });

  // O registro em si já tem que ter movido a linha, sem publish/despublish
  // adicional e sem rodar o script de reconciliação.
  const { data: arquivo } = await admin
    .from("media")
    .select("bucket_id")
    .eq("dog_id", cao.id)
    .single();
  expect(
    arquivo?.bucket_id,
    "mídia registrada com o cão já publicado tem que nascer no bucket público",
  ).toBe("kennel-media-public");

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  const resp = await publica.goto(`/d/${cao.public_id}`);
  expect(resp?.status()).toBe(200);

  const img = publica.locator("main img").first();
  await expect(img, "a foto adicionada depois de publicar tem que aparecer").toBeVisible({
    timeout: 10_000,
  });

  const src = (await img.getAttribute("src")) ?? "";
  expect(src.length).toBeGreaterThan(0);
  expect(src).not.toContain("token=");

  await semSessao.close();
});
