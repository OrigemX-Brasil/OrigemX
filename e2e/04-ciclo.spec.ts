import { alerta, criarCanil, criarCao, expect, test } from "./support/fixtures";

/**
 * ============================================================================
 * 4. Tentar criar ciclo → erro legível, sem 500
 * ============================================================================
 *
 * Duas camadas, e as duas importam:
 *
 *   A TELA avisa antes, para o criador não levar erro seco depois de preencher.
 *   O BANCO recusa sempre, porque a tela pode estar desatualizada.
 *
 * O segundo teste força exatamente esse desencontro — e é ele que prova que o
 * erro do banco vira frase em português em vez de 500.
 */

test("a tela recusa o descendente e diz por quê", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  const avo = await criarCao(admin, criador.id, {
    name: `Avô ${token}`,
    sex: "male",
    kennel_id: canil.id,
  });
  await criarCao(admin, criador.id, {
    name: `Neto ${token}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: avo.id,
  });

  // Editando o AVÔ, tentar escolher o NETO como pai fecharia o ciclo.
  await page.goto(`/painel/caes/${avo.id}`);
  await page.getByRole("button", { name: /Buscar o pai/ }).click();
  await page.getByLabel("Nome, registro ou microchip").fill(`Neto ${token}`);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();

  const candidato = page.getByRole("button", { name: new RegExp(`Neto ${token}`) });
  await expect(candidato).toBeVisible();
  await expect(candidato).toBeDisabled();
  await expect(page.getByText(/descendente deste cão/i)).toBeVisible();
});

test("quando a tela está desatualizada, o BANCO recusa e vira frase, não 500", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  const a = await criarCao(admin, criador.id, {
    name: `Alfa ${token}`,
    sex: "male",
    kennel_id: canil.id,
  });
  const b = await criarCao(admin, criador.id, {
    name: `Bravo ${token}`,
    sex: "male",
    kennel_id: canil.id,
  });

  const erros5xx: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 500) erros5xx.push(`${r.status()} ${r.url()}`);
  });

  // A tela do Bravo carrega quando o Alfa AINDA NÃO é descendente dele — então
  // o Alfa aparece como candidato legítimo.
  await page.goto(`/painel/caes/${b.id}`);
  await page.getByRole("button", { name: /Buscar o pai/ }).click();
  await page.getByLabel("Nome, registro ou microchip").fill(`Alfa ${token}`);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();

  const candidato = page.getByRole("button", { name: new RegExp(`Alfa ${token}`) });
  await expect(candidato).toBeEnabled();

  // Agora o mundo muda por baixo: o Alfa vira filho do Bravo. É a corrida real
  // de quem deixou duas abas abertas.
  const { error } = await admin.from("dogs").update({ sire_id: b.id }).eq("id", a.id);
  expect(error, "o vínculo Alfa←Bravo é válido e devia passar").toBeNull();

  // A tela, sem saber, deixa escolher e enviar. O banco é quem barra.
  await candidato.click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  const erro = alerta(page).first();
  await expect(erro).toBeVisible();
  await expect(erro).toContainText(/ciclo|ancestral|descendente/i);

  // Frase de gente, não despejo de erro do Postgres.
  const texto = (await erro.textContent()) ?? "";
  expect(texto).not.toMatch(/P0001|SQLSTATE|plpgsql|dogs_check_ancestry|stack/i);

  expect(erros5xx, `respostas 5xx: ${erros5xx.join(", ")}`).toEqual([]);

  // E nada foi gravado: o ciclo não existe no banco.
  const { data } = await admin.from("dogs").select("sire_id").eq("id", b.id).single();
  expect(data?.sire_id, "o vínculo que fecharia o ciclo não pode ter sido salvo").toBeNull();
});

test("cão como pai de si mesmo é recusado", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  const token = Date.now().toString(36);

  const cao = await criarCao(admin, criador.id, {
    name: `Sozinho ${token}`,
    sex: "male",
    kennel_id: canil.id,
  });

  await page.goto(`/painel/caes/${cao.id}`);
  await page.getByRole("button", { name: /Buscar o pai/ }).click();
  await page.getByLabel("Nome, registro ou microchip").fill(`Sozinho ${token}`);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();

  // Ou some da lista, ou aparece desabilitado — o que não pode é ser escolhível.
  const proprio = page.getByRole("button", { name: new RegExp(`Sozinho ${token}`) });
  if ((await proprio.count()) > 0) {
    await expect(proprio.first()).toBeDisabled();
  }

  const { data } = await admin.from("dogs").select("sire_id").eq("id", cao.id).single();
  expect(data?.sire_id).toBeNull();
});
