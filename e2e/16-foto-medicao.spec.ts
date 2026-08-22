import { anonClient } from "./support/admin";
import { criarCanil, criarCao, expect, test } from "./support/fixtures";
import { MIME, pngDeTeste } from "./support/imagem";

/**
 * ============================================================================
 * 16. Foto na medição — upload, publicação em cascata, RLS e Story Timeline
 * ============================================================================
 *
 * A tabela `media` ganhou um quinto dono (`measurement_id`), 1:1 opcional,
 * mesmo molde do avatar de depoimento. O que precisa ficar provado:
 *
 *   - anexar/trocar/remover a foto de uma medição já existente, no painel;
 *   - publicar o CÃO move a foto da medição para o bucket público JUNTO com a
 *     galeria — sem ação nova, `dogMediaRows` é quem carrega as duas;
 *     despublicar devolve as duas;
 *   - dono de outro cão não consegue anexar foto numa medição alheia
 *     (`private.owns_measurement` recusa), mesmo tentando direto pela API;
 *   - a Story Timeline: medição COM foto ganha a legenda de semana calculada
 *     ("1ª Semana"), medição SEM foto mantém o rótulo de tipo ("Peso").
 *
 * NOTA para quem for rodar: escrito na mesma sessão em que a migration
 * `foto_da_medicao` foi criada. Rode `npx supabase db push` contra o projeto
 * de dev (com a confirmação do dono do produto) antes desta suíte — sem a
 * migration aplicada, todo teste aqui falha com "column measurement_id does
 * not exist" ou "invalid input value for enum media_role_valid".
 */

test("anexar, trocar e remover a foto de uma medição, no painel", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { name: "Thor", kennel_id: canil.id });
  await admin.from("dogs").update({ born_on: "2026-08-15" }).eq("id", cao.id);

  await admin.from("dog_measurements").insert({
    dog_id: cao.id,
    kind: "weight",
    value: 2.4,
    measured_on: "2026-08-22",
    created_by: criador.id,
  });

  await page.goto(`/painel/caes/${cao.id}`);
  await page.getByRole("button", { name: "Editar" }).click();

  const linha = page.locator("li").filter({ hasText: "Salvar" });
  // `input[type=file]` direto, não `getByLabel`: o rótulo troca de
  // "Adicionar foto (opcional)" para "Trocar foto" assim que a primeira foto
  // existe, e um locator preso ao texto antigo ficaria órfão no reenvio.
  const campoFoto = linha.locator('input[type="file"]');
  await expect(linha.getByLabel("Adicionar foto (opcional)")).toBeVisible();

  await campoFoto.setInputFiles({
    name: "medicao.png",
    mimeType: MIME,
    buffer: await pngDeTeste("medicao", 400),
  });

  await expect(linha.getByRole("button", { name: "Remover foto" })).toBeVisible({
    timeout: 15_000,
  });

  const { data: linhaMedicao } = await admin
    .from("dog_measurements")
    .select("id")
    .eq("dog_id", cao.id)
    .single();
  const { data: fotoRegistrada } = await admin
    .from("media")
    .select("id, role, measurement_id, dog_id")
    .eq("measurement_id", linhaMedicao!.id)
    .is("deleted_at", null)
    .single();
  expect(fotoRegistrada?.role).toBe("measurement_photo");
  // A foto NÃO carrega `dog_id` — é 1:1 com a medição, mesmo desenho do
  // avatar de depoimento (que não carrega `kennel_id`).
  expect(fotoRegistrada?.dog_id).toBeNull();

  // O rótulo já reflete a foto existente — é o que prova que o SERVIDOR
  // devolveu a foto nova antes deste ponto, não só o cliente otimista.
  await expect(linha.getByLabel("Trocar foto")).toBeVisible();

  // Trocar: o antigo sai (soft-delete) antes do novo entrar — mesmo mecanismo
  // do avatar de depoimento e do logo do canil.
  await campoFoto.setInputFiles({
    name: "medicao2.png",
    mimeType: MIME,
    buffer: await pngDeTeste("medicao2", 400),
  });
  await page.waitForTimeout(2500);

  const { data: fotos } = await admin
    .from("media")
    .select("id")
    .eq("measurement_id", linhaMedicao!.id)
    .is("deleted_at", null);
  expect(fotos).toHaveLength(1);

  // Remover.
  await linha.getByRole("button", { name: "Remover foto" }).click();
  await expect(linha.getByLabel("Adicionar foto (opcional)")).toBeVisible();

  const { data: restante } = await admin
    .from("media")
    .select("id")
    .eq("measurement_id", linhaMedicao!.id)
    .is("deleted_at", null);
  expect(restante).toHaveLength(0);
});

test("publicar o cão move a foto da medição para o bucket público junto com a galeria; despublicar devolve", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { name: "Nix", kennel_id: canil.id });

  const { data: medicao } = await admin
    .from("dog_measurements")
    .insert({
      dog_id: cao.id,
      kind: "weight",
      value: 1.8,
      measured_on: "2026-08-20",
      created_by: criador.id,
    })
    .select("id")
    .single();

  await page.goto(`/painel/caes/${cao.id}`);
  await page.getByRole("button", { name: "Editar" }).click();
  await page
    .locator("li")
    .filter({ hasText: "Salvar" })
    .getByLabel("Adicionar foto (opcional)")
    .setInputFiles({
      name: "medicao.png",
      mimeType: MIME,
      buffer: await pngDeTeste("medicao", 400),
    });
  await expect(
    page.locator("li").filter({ hasText: "Salvar" }).getByRole("button", { name: "Remover foto" }),
  ).toBeVisible({ timeout: 15_000 });

  const bucketDaFoto = async () => {
    const { data } = await admin
      .from("media")
      .select("bucket_id")
      .eq("measurement_id", medicao!.id)
      .is("deleted_at", null)
      .single();
    return data?.bucket_id;
  };

  // Antes de publicar: privado.
  expect(await bucketDaFoto()).toBe("kennel-media");

  await page.getByRole("button", { name: "Publicar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // `dogMediaRows` (usada por publishDog) soma a galeria E a foto de medição
  // numa consulta só — é o que move as duas juntas sem `publish.ts` saber que
  // a foto de medição existe.
  expect(await bucketDaFoto()).toBe("kennel-media-public");

  await page.getByRole("button", { name: "Despublicar" }).click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toHaveCount(0);

  expect(await bucketDaFoto()).toBe("kennel-media");
});

test("dono de outro cão não consegue anexar foto numa medição alheia, nem direto pela API", async ({
  criador: b,
  outroCriador: a,
  admin,
}) => {
  const canilDeA = await criarCanil(admin, a.id);
  const caoDeA = await criarCao(admin, a.id, { kennel_id: canilDeA.id });
  const { data: medicaoDeA } = await admin
    .from("dog_measurements")
    .insert({
      dog_id: caoDeA.id,
      kind: "weight",
      value: 3,
      measured_on: "2026-08-20",
      created_by: a.id,
    })
    .select("id")
    .single();

  const comoB = anonClient();
  const { error: erroLogin } = await comoB.auth.signInWithPassword({
    email: b.email,
    password: b.password,
  });
  expect(erroLogin).toBeNull();

  const { error: erroInsert } = await comoB.from("media").insert({
    measurement_id: medicaoDeA!.id,
    role: "measurement_photo",
    bucket_id: "kennel-media",
    storage_path: `${b.id}/medidas/${medicaoDeA!.id}/forjado.png`,
    mime: "image/png",
    size_bytes: 100,
    owner_id: b.id,
    created_by: b.id,
  });

  expect(erroInsert).not.toBeNull();

  const { data: fotos } = await admin
    .from("media")
    .select("id")
    .eq("measurement_id", medicaoDeA!.id)
    .is("deleted_at", null);
  expect(fotos).toHaveLength(0);
});

test("Story Timeline: medição com foto ganha legenda de semana; sem foto mantém o rótulo de tipo", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, {
    name: `Athena ${Date.now().toString(36)}`,
    kennel_id: canil.id,
  });
  await admin.from("dogs").update({ born_on: "2026-08-15" }).eq("id", cao.id);

  // Exatamente 1 semana depois do nascimento — o mesmo salto do mockup
  // original ("Nascimento" → "1ª Semana").
  const { data: comFoto } = await admin
    .from("dog_measurements")
    .insert({
      dog_id: cao.id,
      kind: "weight",
      value: 2.4,
      measured_on: "2026-08-22",
      created_by: criador.id,
    })
    .select("id")
    .single();

  await admin.from("dog_measurements").insert({
    dog_id: cao.id,
    kind: "withers_height",
    value: 20,
    measured_on: "2026-08-25",
    created_by: criador.id,
  });

  // A foto pelo painel — só assim ela chega a fazer parte do que a página
  // pública resolve (mesmo raciocínio de todo outro teste de mídia real
  // desta suíte).
  // DUAS medições nesta tela — "Peso" e "Cernelha" — então o botão "Editar"
  // sozinho seria ambíguo. Escopado à linha do PESO, que é onde a foto entra.
  await page.goto(`/painel/caes/${cao.id}`);
  const linhaPeso = page.locator("li").filter({ hasText: "Peso" });
  await linhaPeso.getByRole("button", { name: "Editar" }).click();

  const editandoPeso = page.locator("li").filter({ hasText: "Salvar" });
  await editandoPeso.getByLabel("Adicionar foto (opcional)").setInputFiles({
    name: "medicao.png",
    mimeType: MIME,
    buffer: await pngDeTeste("medicao", 400),
  });
  await expect(editandoPeso.getByRole("button", { name: "Remover foto" })).toBeVisible({
    timeout: 15_000,
  });
  await editandoPeso.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Publicar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/d/${cao.public_id}`);

  const eventos = publica.getByRole("list", { name: "Linha do tempo" }).getByRole("listitem");

  // O evento COM foto: legenda de semana, e uma imagem real dentro do item.
  const eventoComFoto = eventos.filter({ hasText: "1ª Semana" });
  await expect(eventoComFoto).toBeVisible();
  await expect(eventoComFoto.locator("img")).toBeVisible();

  // O evento SEM foto: continua com o rótulo de tipo, sem imagem nenhuma.
  const eventoSemFoto = eventos.filter({ hasText: "Cernelha" });
  await expect(eventoSemFoto).toBeVisible();
  await expect(eventoSemFoto.locator("img")).toHaveCount(0);

  expect(comFoto?.id).toBeTruthy();

  await semSessao.close();
});
