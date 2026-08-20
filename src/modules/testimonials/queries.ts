import { createClient } from "@/lib/supabase/server";

import { MAX_TESTIMONIALS_PER_KENNEL } from "./constraints";

/**
 * Acesso a dados de depoimento. Todo `.from("testimonials")` do painel passa
 * por aqui — a leitura pública mora em `modules/public/queries.ts`, mesma
 * separação que `litters`/`health` já seguem.
 */

export type Testimonial = {
  id: string;
  kennel_id: string;
  dog_id: string | null;
  author_name: string;
  text: string;
  rating: number | null;
  published_at: string | null;
};

/** Todos os depoimentos do canil (inclusive rascunho), mais recente primeiro. */
export async function getKennelTestimonials(kennelId: string): Promise<Testimonial[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("testimonials")
    .select("id, kennel_id, dog_id, author_name, text, rating, published_at")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_TESTIMONIALS_PER_KENNEL);

  return data ?? [];
}

/** Um depoimento, só se pertencer ao canil deste usuário. */
export async function getManageableTestimonialById(
  id: string,
  userId: string,
): Promise<Testimonial | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("testimonials")
    .select("id, kennel_id, dog_id, author_name, text, rating, published_at, kennels!inner(owner_id)")
    .eq("id", id)
    .eq("kennels.owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    kennel_id: data.kennel_id,
    dog_id: data.dog_id,
    author_name: data.author_name,
    text: data.text,
    rating: data.rating,
    published_at: data.published_at,
  };
}

export async function countKennelTestimonials(kennelId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("testimonials")
    .select("id", { count: "exact", head: true })
    .eq("kennel_id", kennelId)
    .is("deleted_at", null);

  return count ?? 0;
}

/**
 * Os cães do canil, para o `<select>` de vínculo opcional do depoimento.
 *
 * SEM o filtro `litter_id is null` que `listMyDogs` usa: um depoimento pode
 * ser sobre um filhote já vendido, e ele precisa continuar na lista. Não dá
 * para reaproveitar `listMyDogs` — ela filtra por `owner_id`, pagina e exclui
 * filhote, os três motivos erram aqui.
 */
export async function listKennelDogsForSelect(
  kennelId: string,
): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dogs")
    .select("id, name")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(200);

  return data ?? [];
}
