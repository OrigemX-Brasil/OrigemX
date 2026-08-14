import { criarCanil, expect, publicar, test } from "./support/fixtures";
import { MIME, pngDeTeste } from "./support/imagem";

/**
 * ============================================================================
 * 11. Ninhadas — cadastro, 4 fotos, e a REGRA DUPLA de publicação
 * ============================================================================
 *
 * O que precisa ficar provado, e não só "salvou":
 *
 *   - cadastrar é página própria, sem foto (litter_id não existe antes do
 *     INSERT), e SÓ a lista aparece na tela do canil;
 *   - o teto de 4 fotos é do BANCO, não só da UI — a 5ª some da tela porque o
 *     `remaining` chega a zero, não porque um contador de client inventou um
 *     limite;
 *   - a REGRA DUPLA: ninhada publicada com o canil em rascunho não aparece em
 *     `/c/[slug]`, e o aviso avisa disso na hora;
 *   - publicar o canil DEPOIS mostra a ninhada que já estava publicada —
 *     prova o cascade de `publishKennel` sobre mídia de ninhada.
 */

test("cadastra ninhada, sobe 4 fotos, e a 5ª não tem onde entrar", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);

  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("link", { name: "Cadastrar nova ninhada" }).click();
  await page.waitForURL(/\/painel\/canis\/[0-9a-f-]{36}\/ninhadas\/novo/);

  // Sem campo de foto nesta tela — `litter_id` só existe depois do INSERT.
  await expect(page.getByLabel("Adicionar fotos")).toHaveCount(0);

  await page.getByLabel("Descrição").fill("Quatro filhotes, machos e fêmeas, nascidos em outubro.");
  await page.getByRole("button", { name: "Cadastrar ninhada" }).click();
  await page.waitForURL(/\/painel\/canis\/[0-9a-f-]{36}\/ninhadas\/[0-9a-f-]{36}/);

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .select("id, kennel_id, description")
    .eq("kennel_id", canil.id)
    .single();
  expect(ninhada?.description).toContain("Quatro filhotes");

  // A tela do canil mostra SÓ a lista — card com o resumo, sem upload nem
  // toggle de publicação (esses ficam na página da própria ninhada).
  await page.goto(`/painel/canis/${canil.id}`);
  await expect(page.getByRole("heading", { name: "Ninhadas" })).toBeVisible();
  await expect(page.getByText("Quatro filhotes, machos")).toBeVisible();
  await expect(page.getByLabel("Adicionar fotos")).toHaveCount(0);

  // De volta à ninhada, as 4 fotos de uma vez — exercita a fila com
  // concorrência de verdade (GALLERY_UPLOAD_CONCURRENCY = 3), o caminho que
  // faz duas fotos colidirem no mesmo slot e a retentativa de
  // `registerLitterPhoto` precisar entrar em ação.
  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);

  const fotos = await Promise.all(
    [1, 2, 3, 4].map((n) => pngDeTeste(`ninhada foto ${n}`, 500)),
  );
  await page.getByLabel("Adicionar fotos").setInputFiles(
    fotos.map((buffer, i) => ({ name: `foto-${i + 1}.png`, mimeType: MIME, buffer })),
  );

  const grade = page.getByTestId("litter-photo-grid");
  await expect(grade.locator("img")).toHaveCount(4, { timeout: 30_000 });

  const { data: fotosGravadas } = await admin
    .from("media")
    .select("position")
    .eq("litter_id", ninhada!.id)
    .eq("role", "litter_gallery")
    .is("deleted_at", null)
    .order("position");
  // As QUATRO posições, sem repetição e sem buraco — é a prova de que o
  // cálculo do menor slot livre (e a retentativa em 23505) funcionaram sob
  // concorrência real, não só no teste sequencial de RLS.
  expect(fotosGravadas?.map((f) => f.position)).toEqual([1, 2, 3, 4]);

  // O teto é do BANCO: o campo de upload nem aparece mais — é o mesmo
  // comportamento que a galeria do cão já tem ao chegar no limite dela.
  await expect(page.getByLabel("Adicionar fotos")).toHaveCount(0);
  await expect(page.getByText("Limite de 4 imagens atingido")).toBeVisible();
});

test("a regra dupla: ninhada publicada só aparece quando o canil também publica", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({ kennel_id: canil.id, description: "Ninhada de teste — regra dupla.", created_by: criador.id })
    .select("id")
    .single();

  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);

  // O canil (fixture) nasce em RASCUNHO — publicar a ninhada aqui não pode
  // fingir que já está tudo certo.
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/só aparece no perfil quando o canil TAMBÉM/)).toBeVisible();

  const { data: aindaRascunho } = await admin
    .from("kennel_litters")
    .select("published_at")
    .eq("id", ninhada!.id)
    .single();
  expect(aindaRascunho?.published_at, "a ninhada grava a própria intenção mesmo assim").not.toBeNull();

  // O CANIL ainda é rascunho (a fixture nasce assim) — a página inteira nem
  // abre para o público, então a ninhada publicada não vaza por nenhum
  // caminho, nem o direto.
  const semSessao1 = await page.context().browser()!.newContext();
  const publica1 = await semSessao1.newPage();
  const resp1 = await publica1.goto(`/c/${canil.slug}`);
  expect(resp1?.status()).toBe(404);
  await semSessao1.close();

  // Publica o CANIL pelo BOTÃO — não pelo helper `publicar()` (grava direto
  // no banco, sem passar por `publishKennel`). É a `revalidatePath` de dentro
  // da Server Action que invalida o 404 já em cache de `/c/${slug}` — um
  // UPDATE por fora do fluxo deixaria a página pública presa no 404 antigo
  // até os 300s do ISR vencerem sozinhos, mesmo com o canil já publicado no
  // banco.
  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const semSessao2 = await page.context().browser()!.newContext();
  const publica2 = await semSessao2.newPage();
  await publica2.goto(`/c/${canil.slug}`);
  await expect(publica2.getByRole("heading", { name: "Ninhadas" })).toBeVisible();
  await expect(publica2.getByText("Ninhada de teste — regra dupla.")).toBeVisible();
  await semSessao2.close();

  // E despublicar o canil esconde de novo — sem mexer na ninhada.
  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("button", { name: "Despublicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Não publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const semSessao3 = await page.context().browser()!.newContext();
  const publica3 = await semSessao3.newPage();
  const resp = await publica3.goto(`/c/${canil.slug}`);
  expect(resp?.status()).toBe(404);
  await semSessao3.close();
});

test("o card da ninhada abre o modal com a descrição completa e navega entre as fotos", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      description: "Ninhada com duas fotos, para testar a navegação do modal.",
      created_by: criador.id,
    })
    .select("id")
    .single();

  // Sobe 2 fotos pela tela real — o pipeline de upload já foi provado no
  // primeiro teste deste arquivo; aqui é só o suficiente para o modal ter o
  // que navegar.
  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);
  const fotos = await Promise.all([1, 2].map((n) => pngDeTeste(`modal foto ${n}`, 400)));
  await page
    .getByLabel("Adicionar fotos")
    .setInputFiles(fotos.map((buffer, i) => ({ name: `modal-${i + 1}.png`, mimeType: MIME, buffer })));
  await expect(page.getByTestId("litter-photo-grid").locator("img")).toHaveCount(2, {
    timeout: 30_000,
  });

  // Publica os dois pelos botões reais — mesmo motivo já registrado no teste
  // da regra dupla: `publicar()` grava direto no banco e não revalida o ISR.
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(`/painel/canis/${canil.id}`);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicado", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/c/${canil.slug}`);

  await publica.getByRole("button", { name: /Ver detalhes da ninhada/ }).click();

  // `dialog[open]`, não `getByRole("dialog")`: a página tem um `<dialog>`
  // por ninhada (mais o do logo do canil), todos fechados menos este —
  // mirar o atributo é inequívoco, sem depender de como cada engine computa
  // a árvore de acessibilidade de elementos `display:none`.
  const dialogo = publica.locator("dialog[open]");
  await expect(dialogo).toBeVisible();
  await expect(
    dialogo.getByText("Ninhada com duas fotos, para testar a navegação do modal."),
  ).toBeVisible();
  await expect(dialogo.getByText("1 / 2")).toBeVisible();

  await dialogo.getByRole("button", { name: "Próxima foto" }).click();
  await expect(dialogo.getByText("2 / 2")).toBeVisible();

  await dialogo.getByRole("button", { name: "Fechar" }).click();
  await expect(dialogo).not.toBeVisible();

  await semSessao.close();
});

test("ninhada SEM foto abre o modal só com a descrição — sem diálogo vazio", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });
  await admin.from("kennel_litters").insert({
    kennel_id: canil.id,
    description: "Ninhada sem foto nenhuma, só texto.",
    created_by: criador.id,
    published_at: new Date().toISOString(),
  });

  await page.goto(`/c/${canil.slug}`);
  await page.getByRole("button", { name: /Ver detalhes da ninhada/ }).click();

  const dialogo = page.locator("dialog[open]");
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText("Ninhada sem foto nenhuma, só texto.")).toBeVisible();
  // Sem foto, sem contador nem setas — só o botão de fechar, que continua
  // existindo porque deixou de estar preso ao bloco condicionado a `photo`.
  await expect(dialogo.getByText(/^\d+ \/ \d+$/)).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Fechar" })).toBeVisible();
});

test("excluir ninhada é lógico, e ela some do painel e do público", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await publicar(admin, { kennelId: canil.id });
  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      description: "Ninhada a ser excluída.",
      created_by: criador.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await page.goto(`/c/${canil.slug}`);
  await expect(page.getByText("Ninhada a ser excluída.")).toBeVisible();

  await page.goto(`/painel/canis/${canil.id}/ninhadas/${ninhada!.id}`);
  await page.getByRole("button", { name: "Excluir ninhada" }).click();
  await page.waitForURL(new RegExp(`/painel/canis/${canil.id}$`));
  await expect(page.getByText("Nenhuma ninhada cadastrada ainda.")).toBeVisible();

  const { data: excluida } = await admin
    .from("kennel_litters")
    .select("deleted_at")
    .eq("id", ninhada!.id)
    .single();
  expect(excluida?.deleted_at, "exclusão é lógica — o registro permanece").not.toBeNull();

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/c/${canil.slug}`);
  await expect(publica.getByText("Ninhada a ser excluída.")).toHaveCount(0);
  await semSessao.close();
});
