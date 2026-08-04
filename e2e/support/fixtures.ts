import { test as base, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import { adminClient, cookieDeSessao, criarUsuario, limparUsuario, type TestUser } from "./admin";

/**
 * ============================================================================
 * Fixtures da suíte E2E.
 * ============================================================================
 *
 * `criador` e `outroCriador` nascem e morrem em cada teste. Nenhum cenário
 * enxerga dado de outro, então a ordem de execução não importa e um teste que
 * quebra no meio não deixa entulho para o seguinte tropeçar.
 *
 * O preço é criar dois usuários por teste de isolamento; é barato perto de
 * depurar suíte que só falha quando roda inteira.
 */

type Fixtures = {
  admin: SupabaseClient<Database>;
  /** Usuário já autenticado na `page`. */
  criador: TestUser;
  /** Segundo usuário, SEM sessão na página. Para os testes de isolamento. */
  outroCriador: TestUser;
  /** Autentica uma página qualquer como o usuário dado. */
  autenticar: (page: Page, user: TestUser) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  admin: async ({}, use) => {
    await use(adminClient());
  },

  autenticar: async ({}, use) => {
    await use(async (page, user) => {
      await page.context().addCookies([await cookieDeSessao(user)]);
    });
  },

  criador: async ({ page }, use) => {
    const user = await criarUsuario("criador");
    await page.context().addCookies([await cookieDeSessao(user)]);

    await use(user);

    await limparUsuario(user.id);
  },

  outroCriador: async ({}, use) => {
    const user = await criarUsuario("outro");
    await use(user);
    await limparUsuario(user.id);
  },
});

export { expect } from "@playwright/test";

/**
 * Os alertas DA APLICAÇÃO, sem o do Next.
 *
 * O App Router injeta um `<div role="alert">` fora do `<main>` para anunciar
 * troca de rota a leitor de tela. Ele fica vazio quase sempre, mas
 * `getByRole("alert")` o encontra — e aí o seletor casa com dois elementos, o
 * modo estrito reclama, e o teste falha por motivo que não tem nada a ver com o
 * que ele verifica. Aconteceu em quatro cenários antes de eu escopar.
 */
export function alerta(page: Page) {
  return page.locator("main").getByRole("alert");
}

// ---------------------------------------------------------------------------
// Atalhos de dados
//
// Cenário que precisa de um canil para testar OUTRA coisa cria por aqui, e não
// pela tela. Passar pelo formulário em todo teste faria a suíte inteira falhar
// junto quando o formulário mudasse — e esconderia qual comportamento quebrou
// de verdade. A criação PELA TELA tem teste próprio.
// ---------------------------------------------------------------------------

export async function criarCanil(
  admin: SupabaseClient<Database>,
  ownerId: string,
  over: Partial<{
    name: string;
    slug: string;
    city: string;
    state: string;
    description: string;
  }> = {},
) {
  const token = Math.random().toString(36).slice(2, 9);

  const { data, error } = await admin
    .from("kennels")
    .insert({
      name: over.name ?? `Canil E2E ${token}`,
      slug: over.slug ?? `e2e-${token}`,
      owner_id: ownerId,
      created_by: ownerId,
      city: over.city ?? "Curitiba",
      state: over.state ?? "PR",
      description: over.description ?? "Canil de teste automatizado.",
    })
    .select("id, name, slug")
    .single();

  if (error || !data) throw new Error(`Falhou ao criar canil: ${error?.message}`);
  return data;
}

export async function criarCao(
  admin: SupabaseClient<Database>,
  ownerId: string,
  over: Partial<{
    name: string;
    sex: "male" | "female";
    kennel_id: string | null;
    sire_id: string | null;
    dam_id: string | null;
    breed: string;
    published: boolean;
  }> = {},
) {
  const token = Math.random().toString(36).slice(2, 9);

  const { data, error } = await admin
    .from("dogs")
    .insert({
      name: over.name ?? `Cão E2E ${token}`,
      sex: over.sex ?? "male",
      breed: over.breed ?? "Fila Brasileiro",
      kennel_id: over.kennel_id ?? null,
      owner_id: ownerId,
      created_by: ownerId,
      sire_id: over.sire_id ?? null,
      dam_id: over.dam_id ?? null,
      published_at: over.published ? new Date().toISOString() : null,
    })
    .select("id, name, public_id, sex")
    .single();

  if (error || !data) throw new Error(`Falhou ao criar cão: ${error?.message}`);
  return data;
}

/** Publica canil e cães de uma vez, para os cenários de página pública. */
export async function publicar(
  admin: SupabaseClient<Database>,
  { kennelId, dogIds = [] }: { kennelId?: string; dogIds?: string[] },
) {
  const agora = new Date().toISOString();
  if (kennelId) await admin.from("kennels").update({ published_at: agora }).eq("id", kennelId);
  if (dogIds.length > 0) {
    await admin.from("dogs").update({ published_at: agora }).in("id", dogIds);
  }
}
