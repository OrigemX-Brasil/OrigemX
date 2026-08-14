import { createClient } from "@/lib/supabase/server";
import { getLitterCovers } from "@/modules/media/queries";
import type { ResolvedMedia } from "@/modules/media/queries";

/**
 * Acesso a dados de ninhada. Todo `.from("kennel_litters")` do painel passa
 * por aqui — mesmo princípio de `modules/kennels/queries.ts`/`modules/dogs/queries.ts`.
 *
 * Os filtros abaixo são para a CONSULTA estar certa, não para proteger: quem
 * decide o que cada um enxerga é a RLS.
 */

export type LitterListItem = {
  id: string;
  kennel_id: string;
  description: string | null;
  published_at: string | null;
  created_at: string;
  cover: ResolvedMedia | null;
};

/** Ninhadas do canil, mais recente primeiro, com a capa (posição 1) já resolvida. */
export async function getKennelLitters(kennelId: string): Promise<LitterListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennel_litters")
    .select("id, kennel_id, description, published_at, created_at")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const litters = data ?? [];
  if (litters.length === 0) return [];

  const covers = await getLitterCovers(litters.map((l) => l.id));
  return litters.map((litter) => ({ ...litter, cover: covers.get(litter.id) ?? null }));
}

export type ManageableLitter = {
  id: string;
  kennel_id: string;
  description: string | null;
  published_at: string | null;
  created_at: string;
};

/**
 * A ninhada, só se o usuário for dono do CANIL dela — `kennel_litters` não
 * tem `owner_id` próprio (ver a migration), então a posse é sempre via
 * `kennels.owner_id`, filtrada NA CONSULTA (mesmo princípio de
 * `getManageableKennelById`: deixar a checagem solta num `if` é o que a
 * próxima tela esquece de copiar).
 */
export async function getManageableLitterById(
  id: string,
  userId: string,
): Promise<ManageableLitter | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennel_litters")
    .select("id, kennel_id, description, published_at, created_at, kennels!inner(owner_id)")
    .eq("id", id)
    .eq("kennels.owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    kennel_id: data.kennel_id,
    description: data.description,
    published_at: data.published_at,
    created_at: data.created_at,
  };
}
