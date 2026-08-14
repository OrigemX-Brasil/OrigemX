import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import { criarCanil, criarCao, expect, publicar, test } from "./support/fixtures";

/**
 * ============================================================================
 * 10. Vídeo do cão na página pública
 * ============================================================================
 *
 * NADA AQUI TOCA NO CLOUDFLARE, e é de propósito. A suíte tem de rodar em
 * máquina e CI sem conta no serviço de vídeo — a mesma regra que `lib/notify`
 * já segue com o Resend. A linha de `dog_videos` é semeada pelo client de
 * service_role, com um `playback_origin` fictício mas válido pelo CHECK
 * `dog_videos_origin_host`.
 *
 * O que sobra para testar é exatamente o que é NOSSO: a seção existir só quando
 * há vídeo pronto, o player não carregar antes do clique, e o `src` sair sem
 * autoplay. O que é do Cloudflare (transcodificar, entregar HLS) não é nosso
 * para verificar aqui.
 */

/** Host fictício, no formato que o CHECK do banco exige. */
const ORIGEM = "https://customer-e2e0000.cloudflarestream.com";

/**
 * `exact: true` em TODO seletor do título "Vídeo" abaixo, e não é preciosismo:
 * `getByRole` casa por SUBSTRING por padrão, então num cão chamado "Com Vídeo"
 * o `<h1>` do nome casa com o seletor do `<h2>` da seção e o modo estrito
 * derruba o teste por motivo que não tem nada a ver com o que ele verifica.
 */

async function semearVideo(
  admin: SupabaseClient<Database>,
  params: {
    dogId: string;
    ownerId: string;
    status: "ready" | "inprogress";
    uid?: string;
  },
) {
  const uid = params.uid ?? `e2e-${Math.random().toString(36).slice(2, 10)}`;
  const pronto = params.status === "ready";

  const { error } = await admin.from("dog_videos").insert({
    dog_id: params.dogId,
    provider_uid: uid,
    status: params.status,
    // `dog_videos_ready_has_playback` recusa 'ready' sem os dois.
    thumbnail_url: pronto ? `${ORIGEM}/${uid}/thumbnails/thumbnail.jpg` : null,
    playback_origin: pronto ? ORIGEM : null,
    duration_seconds: pronto ? 18.4 : null,
    owner_id: params.ownerId,
    created_by: params.ownerId,
  });

  if (error) throw new Error(`Falhou ao semear vídeo: ${error.message}`);
  return uid;
}

test("cão SEM vídeo não ganha seção nenhuma — sem título órfão nem caixa vazia", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id, name: "Sem Vídeo" });
  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id] });

  await page.goto(`/d/${cao.public_id}`);

  await expect(page.getByRole("heading", { name: "Sem Vídeo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vídeo", exact: true })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("o player NÃO carrega antes do clique — a página não pesa para quem não assiste", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id, name: "Com Vídeo" });
  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id] });
  const uid = await semearVideo(admin, {
    dogId: cao.id,
    ownerId: criador.id,
    status: "ready",
  });

  await page.goto(`/d/${cao.public_id}`);

  await expect(page.getByRole("heading", { name: "Vídeo", exact: true })).toBeVisible();

  const gatilho = page.getByRole("button", { name: "Reproduzir vídeo de Com Vídeo" });
  await expect(gatilho).toBeVisible();

  // O ponto do teste: nenhum iframe no DOM enquanto o visitante não pedir.
  await expect(page.locator("iframe")).toHaveCount(0);

  await gatilho.click();

  const player = page.locator("iframe");
  await expect(player).toHaveCount(1);
  await expect(player).toHaveAttribute("src", `${ORIGEM}/${uid}/iframe?poster=${encodeURIComponent(`${ORIGEM}/${uid}/thumbnails/thumbnail.jpg`)}`);
  await expect(player).toHaveAttribute("title", "Vídeo de Com Vídeo");
});

test("o endereço do player não carrega autoplay, nem na URL nem na permissão", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id, name: "Sem Autoplay" });
  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id] });
  await semearVideo(admin, { dogId: cao.id, ownerId: criador.id, status: "ready" });

  await page.goto(`/d/${cao.public_id}`);
  await page.getByRole("button", { name: "Reproduzir vídeo de Sem Autoplay" }).click();

  const player = page.locator("iframe");
  expect(await player.getAttribute("src")).not.toContain("autoplay");
  // O embed padrão do Cloudflare traz `autoplay` no `allow`. O nosso não.
  expect(await player.getAttribute("allow")).not.toContain("autoplay");
});

test("vídeo ainda em processamento NÃO aparece no perfil público", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id, name: "Processando" });
  await publicar(admin, { kennelId: canil.id, dogIds: [cao.id] });
  await semearVideo(admin, { dogId: cao.id, ownerId: criador.id, status: "inprogress" });

  await page.goto(`/d/${cao.public_id}`);

  // A policy MOSTRA a linha ao anônimo (ela herda a visibilidade do cão), então
  // quem tira a seção da tela é o filtro por status='ready' da consulta. É esta
  // separação que o teste guarda: sem ela, a página renderizaria um player sem
  // endereço de reprodução.
  await expect(page.getByRole("heading", { name: "Processando" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vídeo", exact: true })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("o painel mostra o vídeo em processamento e o dono pode sair da página", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id });
  await semearVideo(admin, { dogId: cao.id, ownerId: criador.id, status: "inprogress" });

  await page.goto(`/painel/caes/${cao.id}`);

  // Sem credencial do Cloudflare no ambiente de teste, a reconciliação de
  // abertura falha em silêncio e o status fica onde está — que é exatamente a
  // degradação que se quer provar: a página abre, o vídeo continua em
  // processamento, nada quebra.
  await expect(page.getByText(/Processando o vídeo/)).toBeVisible();
});

test("a seção de vídeo do painel nunca renderiza vazia, com ou sem credencial", async ({
  page,
  criador,
  admin,
}) => {
  const canil = await criarCanil(admin, criador.id);
  const cao = await criarCao(admin, criador.id, { kennel_id: canil.id });

  await page.goto(`/painel/caes/${cao.id}`);

  const secao = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Vídeo", exact: true }) });
  await expect(secao).toBeVisible();

  // Alternância deliberada: sem `CLOUDFLARE_*` no ambiente a seção mostra a
  // degradação, com credencial mostra o campo de envio. Cravar um dos dois
  // faria o teste passar na minha máquina e falhar na de quem configurou o
  // serviço (ou o contrário no CI). O que vale nos dois casos — e é o que
  // realmente pode quebrar — é a seção nunca aparecer vazia.
  await expect(secao).toContainText(/Adicionar vídeo|não está disponível/);
});
