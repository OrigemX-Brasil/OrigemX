import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";

import { buildPedigree, MAX_GENERATIONS, type Pedigree, type PedigreeRow } from "./tree";

/**
 * ============================================================================
 * Pedigree — UMA query para a árvore inteira.
 * ============================================================================
 *
 * Toda a travessia acontece dentro de `public.dog_pedigree`, numa CTE recursiva.
 * Nunca N+1: 62 ancestrais seriam 62 idas ao banco a cada acesso, e a página do
 * QR é justamente a que abre em 4G congestionado no meio de uma feira.
 *
 * CLIENT ANÔNIMO, como o resto das consultas públicas — ver
 * src/lib/supabase/public.ts. É o que mantém a rota em ISR e o que garante que o
 * HTML cacheado seja o de um visitante qualquer, não o de quem abriu primeiro.
 *
 * `cache()` deduplica dentro do mesmo render, então chamar aqui e no
 * `generateMetadata` custa uma consulta só.
 */

/**
 * A árvore do cão, ou `null` se ele não existe / não é visível.
 *
 * NUNCA LEVANTA. Se a RPC falhar, a página renderiza sem a árvore — pelo mesmo
 * critério aplicado à foto: nome, raça e registro valem mais que o pedigree, e
 * pedigree vale mais que erro 500 na cara de quem escaneou o QR.
 */
export const getPedigree = cache(async (dogId: string): Promise<Pedigree | null> => {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("dog_pedigree", {
      p_dog_id: dogId,
      p_generations: MAX_GENERATIONS,
    });

    if (error || !data) return null;

    // O gerador de tipos marca coluna de RETURNS TABLE como não-nula, o que não
    // é verdade: `public_id`, `breed` e companhia saem NULL para ancestral
    // restrito, e é assim que a função esconde os campos. O tipo local diz a
    // verdade, então a conversão acontece aqui, na fronteira.
    const rows: PedigreeRow[] = data.map((r) => ({
      pos: Number(r.pos),
      generation: Number(r.generation),
      dog_id: r.dog_id,
      name: r.name,
      is_public: r.is_public,
      public_id: r.public_id ?? null,
      sex: r.sex ?? null,
      breed: r.breed ?? null,
      born_on: r.born_on ?? null,
      kennel_name: r.kennel_name ?? null,
    }));

    return buildPedigree(rows);
  } catch {
    return null;
  }
});
