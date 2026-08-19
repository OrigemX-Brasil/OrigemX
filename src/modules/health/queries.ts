import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClientLike } from "@/modules/media/queries";

import { MAX_GENETIC_TESTS_PER_DOG, MAX_HEALTH_RECORDS_PER_DOG } from "./constraints";

/**
 * Acesso a dados de saúde e exames. Todo `.from("dog_health_records")` e
 * `.from("dog_genetic_tests")` do app passa por aqui.
 *
 * As funções aceitam um client externo pelo mesmo motivo de
 * `modules/media/queries.ts`: a página pública passa o client ANÔNIMO, sem
 * cookies e sem sessão, e é isso que mantém a rota em ISR.
 *
 * NENHUM filtro de "cão publicado" aqui. Quem decide é a RLS: as duas policies
 * de SELECT delegam a visibilidade para `dogs_select` através de um `exists`,
 * então o client anônimo simplesmente não recebe linha de cão que não seja
 * público. Rederivar a regra em TypeScript é a duplicação que diverge na
 * primeira mudança — mesmo raciocínio já escrito em `getPublicLitters`.
 */

export type HealthRecord = {
  id: string;
  dog_id: string;
  kind: string;
  applied_on: string;
  product: string | null;
  notes: string | null;
};

export type GeneticTest = {
  id: string;
  dog_id: string;
  name: string;
  result: string;
  tested_on: string | null;
  lab: string | null;
};

/** Histórico do cão, mais recente primeiro. */
export async function getDogHealthRecords(
  dogId: string,
  client?: SupabaseClientLike,
): Promise<HealthRecord[]> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("dog_health_records")
    .select("id, dog_id, kind, applied_on, product, notes")
    .eq("dog_id", dogId)
    .is("deleted_at", null)
    .order("applied_on", { ascending: false })
    .limit(MAX_HEALTH_RECORDS_PER_DOG);

  return data ?? [];
}

export async function getDogGeneticTests(
  dogId: string,
  client?: SupabaseClientLike,
): Promise<GeneticTest[]> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("dog_genetic_tests")
    .select("id, dog_id, name, result, tested_on, lab")
    .eq("dog_id", dogId)
    .is("deleted_at", null)
    .order("tested_on", { ascending: false, nullsFirst: false })
    .limit(MAX_GENETIC_TESTS_PER_DOG);

  return data ?? [];
}

/**
 * Exames de VÁRIOS cães de uma vez, agrupados por cão.
 *
 * É esta função que cumpre o pedido "exames dos progenitores IMPORTADOS do
 * perfil dos pais": a página da ninhada chama com `[sire_id, dam_id]` e recebe
 * o que já foi cadastrado no perfil de cada um. Não existe importação, cópia
 * nem campo de exame na ninhada — o dado tem UM dono, o cão.
 *
 * NUNCA LEVANTA: exame é informação valiosa, mas menos que a página abrir.
 * Mesmo critério de `getPublicLitters` e `getPedigree`.
 */
export const getGeneticTestsByDog = cache(
  async (
    dogIds: readonly (string | null | undefined)[],
    client?: SupabaseClientLike,
  ): Promise<Map<string, GeneticTest[]>> => {
    const ids = dogIds.filter((id): id is string => Boolean(id));
    const grouped = new Map<string, GeneticTest[]>();
    if (ids.length === 0) return grouped;

    try {
      const supabase = client ?? (await createClient());
      const { data } = await supabase
        .from("dog_genetic_tests")
        .select("id, dog_id, name, result, tested_on, lab")
        .in("dog_id", ids)
        .is("deleted_at", null)
        .order("tested_on", { ascending: false, nullsFirst: false })
        .limit(ids.length * MAX_GENETIC_TESTS_PER_DOG);

      for (const row of data ?? []) {
        const list = grouped.get(row.dog_id) ?? [];
        list.push(row);
        grouped.set(row.dog_id, list);
      }
    } catch {
      return grouped;
    }

    return grouped;
  },
);

/** Saúde de vários cães de uma vez — a lista de filhotes da ninhada precisa em lote. */
export const getHealthRecordsByDog = cache(
  async (
    dogIds: readonly string[],
    client?: SupabaseClientLike,
  ): Promise<Map<string, HealthRecord[]>> => {
    const grouped = new Map<string, HealthRecord[]>();
    if (dogIds.length === 0) return grouped;

    try {
      const supabase = client ?? (await createClient());
      const { data } = await supabase
        .from("dog_health_records")
        .select("id, dog_id, kind, applied_on, product, notes")
        .in("dog_id", dogIds)
        .is("deleted_at", null)
        .order("applied_on", { ascending: false })
        .limit(dogIds.length * MAX_HEALTH_RECORDS_PER_DOG);

      for (const row of data ?? []) {
        const list = grouped.get(row.dog_id) ?? [];
        list.push(row);
        grouped.set(row.dog_id, list);
      }
    } catch {
      return grouped;
    }

    return grouped;
  },
);
