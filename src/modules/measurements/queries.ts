import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClientLike } from "@/modules/media/queries";

import { MAX_MEASUREMENTS_PER_DOG } from "./constraints";

/**
 * Acesso a dados de medição. Todo `.from("dog_measurements")` do app passa
 * por aqui.
 *
 * As funções aceitam um client externo pelo mesmo motivo de
 * `health/queries.ts`: a página pública passa o client ANÔNIMO, sem cookies e
 * sem sessão, e é isso que mantém a rota em ISR.
 *
 * NENHUM filtro de "cão publicado" aqui — a RLS delega a `dogs_select` via
 * `exists`, mesmo raciocínio já documentado em `health/queries.ts`.
 */

export type Measurement = {
  id: string;
  dog_id: string;
  kind: string;
  value: number;
  measured_on: string;
  notes: string | null;
};

/** Histórico do cão, mais recente primeiro. */
export async function getDogMeasurements(
  dogId: string,
  client?: SupabaseClientLike,
): Promise<Measurement[]> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("dog_measurements")
    .select("id, dog_id, kind, value, measured_on, notes")
    .eq("dog_id", dogId)
    .is("deleted_at", null)
    .order("measured_on", { ascending: false })
    .limit(MAX_MEASUREMENTS_PER_DOG);

  return data ?? [];
}

/** Medições de VÁRIOS cães de uma vez, agrupadas por cão — mesma forma de
 *  `getHealthRecordsByDog`, para a página pública do cão poder buscar em lote
 *  junto com saúde e genética. */
export const getMeasurementsByDog = cache(
  async (
    dogIds: readonly string[],
    client?: SupabaseClientLike,
  ): Promise<Map<string, Measurement[]>> => {
    const grouped = new Map<string, Measurement[]>();
    if (dogIds.length === 0) return grouped;

    try {
      const supabase = client ?? (await createClient());
      const { data } = await supabase
        .from("dog_measurements")
        .select("id, dog_id, kind, value, measured_on, notes")
        .in("dog_id", dogIds)
        .is("deleted_at", null)
        .order("measured_on", { ascending: false })
        .limit(dogIds.length * MAX_MEASUREMENTS_PER_DOG);

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
