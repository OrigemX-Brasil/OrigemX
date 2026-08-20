import { criarCanil, criarCao, expect, publicar, test } from "./support/fixtures";

/**
 * ============================================================================
 * 15. Perfil público do cão — selos, história, disponibilidade e CTA
 * ============================================================================
 *
 * NOTA para quem for rodar: escrito na mesma sessão em que as migrations de
 * depoimentos e FAQ foram aplicadas DIRETO EM PRODUÇÃO, sem passar pelo
 * projeto de dev. `.env.local` aponta para DEV. Rode `npx supabase db push`
 * contra dev (depois de linkar com a conta certa) antes desta suíte.
 *
 * O que precisa ficar provado:
 *
 *   - NENHUM selo aparece sem o dado que o sustenta — e é o caso "cão pelado"
 *     que prova isso, não a ausência de asserção;
 *   - a linha do tempo mostra EVENTOS COM DATA REAL (nascimento, vacina,
 *     exame), nunca data de upload de foto;
 *   - "Restam X machos e Y fêmeas" é CONTADO do status dos irmãos publicados;
 *   - o CTA de WhatsApp existe com telefone e some sem telefone, e continua
 *     sendo um `<a>` — sem formulário de proposta em lugar nenhum;
 *   - 360px sem transbordo horizontal, com a página cheia.
 */

test("cão sem dado nenhum não ganha selo, história nem contador", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, {
    name: `Pelado ${Date.now().toString(36)}`,
    kennel_id: canil.id,
  });
  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id] });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/d/${cao.public_id}`);

  // A página abre — o que falta é badge, não a página.
  await expect(publica.getByRole("heading", { name: cao.name })).toBeVisible();

  await expect(publica.getByText(/Vacina em/)).toHaveCount(0);
  await expect(publica.getByText(/exames? genéticos?/)).toHaveCount(0);
  await expect(publica.getByText(/Pedigree ·/)).toHaveCount(0);
  await expect(publica.getByRole("heading", { name: /A história/ })).toHaveCount(0);
  await expect(publica.getByText(/Restam/)).toHaveCount(0);

  // Canil sem telefone: nenhum CTA.
  await expect(publica.getByRole("link", { name: /Falar no WhatsApp/ })).toHaveCount(0);

  await semSessao.close();
});

test("selos, história com datas reais e CTA aparecem quando o dado existe", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  await admin.from("kennels").update({ whatsapp: "5511987654321" }).eq("id", canil.id);

  const pai = await criarCao(admin, criador.id, { sex: "male", kennel_id: canil.id });
  const mae = await criarCao(admin, criador.id, { sex: "female", kennel_id: canil.id });
  const cao = await criarCao(admin, criador.id, {
    name: `Thor ${Date.now().toString(36)}`,
    sex: "male",
    kennel_id: canil.id,
    sire_id: pai.id,
    dam_id: mae.id,
  });

  await admin.from("dogs").update({ born_on: "2026-08-15" }).eq("id", cao.id);

  await admin.from("dog_health_records").insert({
    dog_id: cao.id,
    kind: "vaccine",
    applied_on: "2026-09-20",
    product: "V10",
    created_by: criador.id,
  });
  await admin.from("dog_genetic_tests").insert({
    dog_id: cao.id,
    name: "Displasia coxofemoral",
    result: "A/A",
    tested_on: "2026-10-01",
    created_by: criador.id,
  });

  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id, pai.id, mae.id] });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/d/${cao.public_id}`);

  // Selos — com o FATO, não com julgamento: a data da vacina, não "em dia".
  //
  // `exact` nos dois primeiros porque o texto do BADGE é substring do que a
  // seção de saúde/exames mostra logo abaixo ("Última vacina em 20/09/2026") —
  // e as duas ocorrências são corretas, não duplicidade.
  await expect(publica.getByText("Vacina em 20/09/2026", { exact: true })).toBeVisible();
  await expect(publica.getByText("1 exame genético", { exact: true })).toBeVisible();
  await expect(publica.getByText(/Pedigree · 2 ancestrais/)).toBeVisible();

  // A história, em ordem cronológica e com as DATAS REAIS dos eventos.
  await expect(publica.getByRole("heading", { name: /A história do Thor/ })).toBeVisible();
  const eventos = publica.getByRole("list", { name: "Linha do tempo" }).getByRole("listitem");
  await expect(eventos.nth(0)).toContainText("15/08/2026");
  await expect(eventos.nth(0)).toContainText("Nascimento");
  await expect(eventos.nth(1)).toContainText("20/09/2026");
  await expect(eventos.nth(2)).toContainText("01/10/2026");

  // O CTA: um `<a>` para wa.me, com o link DO CÃO na mensagem.
  const cta = publica.getByRole("link", { name: /Falar no WhatsApp/ });
  await expect(cta).toBeVisible();
  const href = await cta.getAttribute("href");
  expect(href).toContain("https://wa.me/5511987654321?text=");
  const texto = decodeURIComponent(new URL(href!).searchParams.get("text")!);
  expect(texto).toContain(`/d/${cao.public_id}`);
  expect(texto).toContain("Tenho interesse no");

  // A FRONTEIRA: sinalizar interesse é um link, nunca um formulário. Nenhum
  // campo de proposta entrou junto com o CTA.
  await expect(publica.locator("form")).toHaveCount(0);
  await expect(publica.locator("input, textarea, select")).toHaveCount(0);

  await semSessao.close();
});

test("contador de irmãos disponíveis é contado do status, não digitado", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const pai = await criarCao(admin, criador.id, { sex: "male", kennel_id: canil.id });
  const mae = await criarCao(admin, criador.id, { sex: "female", kennel_id: canil.id });

  const { data: ninhada } = await admin
    .from("kennel_litters")
    .insert({
      kennel_id: canil.id,
      created_by: criador.id,
      sire_id: pai.id,
      dam_id: mae.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // 2 machos disponíveis, 1 fêmea disponível, 1 macho vendido — o vendido
  // NÃO pode entrar na conta.
  const filhotes: Array<{ sex: "male" | "female"; status: string }> = [
    { sex: "male", status: "available" },
    { sex: "male", status: "available" },
    { sex: "male", status: "sold" },
    { sex: "female", status: "available" },
  ];

  const ids: string[] = [];
  for (const [i, filhote] of filhotes.entries()) {
    const { data } = await admin
      .from("dogs")
      .insert({
        name: `Filhote ${i + 1}`,
        sex: filhote.sex,
        kennel_id: canil.id,
        litter_id: ninhada!.id,
        litter_status: filhote.status,
        sire_id: pai.id,
        dam_id: mae.id,
        owner_id: criador.id,
        created_by: criador.id,
        published_at: new Date().toISOString(),
      })
      .select("id, public_id")
      .single();
    ids.push(data!.public_id);
  }

  await publicar(admin, { kennelId: canil.id });

  const semSessao = await page.context().browser()!.newContext();
  const publica = await semSessao.newPage();
  await publica.goto(`/d/${ids[0]}`);

  await expect(publica.getByText(/Restam/)).toContainText("2 machos e 1 fêmea");

  await semSessao.close();
});

/**
 * 360px — o Android estreito, mais apertado que os 390px da suíte. Mesma
 * mecânica do teste que já existe para a ninhada: afirma AUSÊNCIA DE
 * TRANSBORDO, não pixels. Aqui o que aperta primeiro é o trilho da história
 * (que rola dentro de si, e só passa se o pai tiver `min-w-0`) e o CTA sticky.
 */
test("layout do cão não transborda a 360px", async ({ page, criador, admin }) => {
  const canil = await criarCanil(admin, criador.id);
  await admin.from("kennels").update({ whatsapp: "5511987654321" }).eq("id", canil.id);

  const pai = await criarCao(admin, criador.id, { sex: "male", kennel_id: canil.id });
  const mae = await criarCao(admin, criador.id, { sex: "female", kennel_id: canil.id });
  const cao = await criarCao(admin, criador.id, {
    name: "Cão Estreito",
    sex: "male",
    kennel_id: canil.id,
    sire_id: pai.id,
    dam_id: mae.id,
  });

  await admin.from("dogs").update({ born_on: "2026-08-15" }).eq("id", cao.id);

  // História longa de propósito: é o trilho horizontal que estoura primeiro.
  for (const [i, data] of ["2026-09-01", "2026-09-15", "2026-10-01", "2026-10-20"].entries()) {
    await admin.from("dog_health_records").insert({
      dog_id: cao.id,
      kind: i % 2 === 0 ? "vaccine" : "deworming",
      applied_on: data,
      product: i % 2 === 0 ? "V10 Polivalente" : "Vermífugo",
      created_by: criador.id,
    });
  }

  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id, pai.id, mae.id] });

  const semSessao = await page.context().browser()!.newContext({
    viewport: { width: 360, height: 740 },
  });
  const estreita = await semSessao.newPage();
  await estreita.goto(`/d/${cao.public_id}`);

  // A página cheia: selos, história e CTA montados antes de medir. `exact`
  // no nome porque o `<h2>` da história também contém o nome do cão.
  await expect(
    estreita.getByRole("heading", { name: "Cão Estreito", exact: true }),
  ).toBeVisible();
  await expect(estreita.getByRole("heading", { name: /A história/ })).toBeVisible();
  await expect(estreita.getByRole("link", { name: /Falar no WhatsApp/ })).toBeVisible();

  const transbordo = await estreita.evaluate(() => {
    const el = document.documentElement;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });
  expect(
    transbordo.scroll,
    `a página rola na horizontal a 360px (${transbordo.scroll}px de conteúdo em ${transbordo.client}px)`,
  ).toBeLessThanOrEqual(transbordo.client);

  await semSessao.close();
});
