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
  await page.getByLabel("Adicionar fotos").setInputFiles({
    name: NOME_ARQUIVO,
    mimeType: MIME,
    buffer: original,
  });

  // A galeria só aparece depois que o servidor confirmou a linha.
  // `getByTestId`, não a seção inteira: a seção "Galeria" também contém a
  // prévia LOCAL do upload em andamento (blob: URL, aparece antes de o
  // servidor confirmar), e essa prévia satisfaria "existe um <img>" cedo
  // demais — o teste pegaria a prévia, não a foto de verdade.
  const galeria = page.getByTestId("media-gallery");
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
  await page.getByLabel("Adicionar fotos").setInputFiles({
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
  await page.getByLabel("Adicionar fotos").setInputFiles({
    name: NOME_ARQUIVO,
    mimeType: MIME,
    buffer: await pngDeTeste("publica", 700),
  });
  await expect(page.getByTestId("media-gallery").locator("img").first()).toBeVisible({
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

  await page.getByLabel("Adicionar fotos").setInputFiles({
    name: NOME_ARQUIVO,
    mimeType: MIME,
    buffer: await pngDeTeste("depois de publicar", 700),
  });
  await expect(page.getByTestId("media-gallery").locator("img").first()).toBeVisible({
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

/** UUID do arquivo, presente tanto no caminho cheio quanto no do thumbnail. */
function fileIdOf(storagePath: string): string {
  return storagePath
    .split("/")
    .pop()!
    .replace(/\.[a-z0-9]+$/i, "");
}

/**
 * ============================================================================
 * Seleção múltipla — o limite de 12 e a troca de capa.
 * ============================================================================
 */

test("selecionar mais fotos do que cabe aceita só até o limite, e avisa o resto", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id });

  // 10 linhas fixture direto no banco — o que se testa é o CLIENTE cortando a
  // seleção para caber, não o upload dessas 10 (isso já está coberto alhures).
  await admin.from("media").insert(
    Array.from({ length: 10 }, (_, i) => ({
      bucket_id: "kennel-media",
      storage_path: `${criador.id}/caes/${cao.id}/seed-${i}.webp`,
      role: "dog_gallery" as const,
      dog_id: cao.id,
      mime: "image/webp",
      size_bytes: 1000,
      owner_id: criador.id,
      created_by: criador.id,
      position: i,
    })),
  );

  await page.goto(`/painel/caes/${cao.id}`);
  // Restam 2 dos 12 — a tela precisa oferecer o input, não a mensagem de
  // limite atingido.
  await expect(page.getByLabel("Adicionar fotos")).toBeVisible();

  await page.getByLabel("Adicionar fotos").setInputFiles([
    { name: "a.png", mimeType: MIME, buffer: await pngDeTeste("lote a", 400) },
    { name: "b.png", mimeType: MIME, buffer: await pngDeTeste("lote b", 400) },
    { name: "c.png", mimeType: MIME, buffer: await pngDeTeste("lote c", 400) },
    { name: "d.png", mimeType: MIME, buffer: await pngDeTeste("lote d", 400) },
    { name: "e.png", mimeType: MIME, buffer: await pngDeTeste("lote e", 400) },
  ]);

  // O aviso aparece ANTES do upload terminar — é checagem síncrona na seleção.
  await expect(page.getByRole("status").filter({ hasText: /cabiam mais 2/ })).toBeVisible();

  // E o resumo, no fim do lote.
  await expect(page.getByRole("status").filter({ hasText: /2 de 2/ })).toBeVisible({
    timeout: 30_000,
  });

  const { count } = await admin
    .from("media")
    .select("id", { count: "exact", head: true })
    .eq("dog_id", cao.id)
    .is("deleted_at", null);

  // 10 do fixture + exatamente 2 do lote — nunca 12+3, nunca menos que 12.
  expect(count).toBe(12);
});

test("trocar a capa muda a foto principal do perfil público", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id, published: true });
  await publicar(admin, { kennelId: canil.id });

  await page.goto(`/painel/caes/${cao.id}`);

  await page.getByLabel("Adicionar fotos").setInputFiles({
    name: "capa-original.png",
    mimeType: MIME,
    buffer: await pngDeTeste("capa original", 700),
  });
  await expect(page.getByTestId("media-gallery").locator("img")).toHaveCount(1, {
    timeout: 30_000,
  });

  await page.getByLabel("Adicionar fotos").setInputFiles({
    name: "segunda-foto.png",
    mimeType: MIME,
    buffer: await pngDeTeste("segunda foto", 700),
  });
  await expect(page.getByTestId("media-gallery").locator("img")).toHaveCount(2, {
    timeout: 30_000,
  });

  // A ordem de verdade é a do banco — mesmo critério que a página pública usa
  // (`position asc, created_at asc`) para decidir quem é a capa.
  const { data: antes } = await admin
    .from("media")
    .select("id, storage_path")
    .eq("dog_id", cao.id)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  expect(antes).toHaveLength(2);
  const [capaAntes, segundaAntes] = antes!;

  await page.goto(`/d/${cao.public_id}`);
  const principalAntes = (await page.locator("main img").first().getAttribute("src")) ?? "";
  expect(principalAntes).toContain(fileIdOf(capaAntes.storage_path));

  // Troca PELA TELA — o botão só existe no item que NÃO é a capa.
  await page.goto(`/painel/caes/${cao.id}`);
  await expect(page.getByTestId("media-gallery")).toContainText("Capa");
  await page.getByRole("button", { name: "Tornar capa" }).click();

  // Espera de VERDADE, não um `toContainText("Capa")` que já era true antes
  // do clique e continuaria true de qualquer jeito: o selo troca de card, mas
  // "existe a palavra Capa em algum lugar" não prova isso. O que prova é o
  // PRIMEIRO <img> da galeria confirmada passar a apontar para o arquivo que
  // era o segundo — só então a leitura no banco logo abaixo é confiável.
  await expect(page.getByTestId("media-gallery").locator("img").first()).toHaveAttribute(
    "src",
    new RegExp(fileIdOf(segundaAntes.storage_path)),
    { timeout: 10_000 },
  );

  const { data: depois } = await admin
    .from("media")
    .select("id, storage_path")
    .eq("dog_id", cao.id)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  expect(depois?.[0]?.id, "a que era a segunda foto virou a primeira").toBe(segundaAntes.id);
  expect(depois?.[1]?.id, "a capa antiga foi para a segunda posição").toBe(capaAntes.id);

  await page.goto(`/d/${cao.public_id}`);
  const principalDepois = (await page.locator("main img").first().getAttribute("src")) ?? "";
  expect(principalDepois).toContain(fileIdOf(segundaAntes.storage_path));
  expect(principalDepois).not.toBe(principalAntes);
});
