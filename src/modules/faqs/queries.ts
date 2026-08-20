import { createClient } from "@/lib/supabase/server";

import { MAX_FAQS_PER_KENNEL } from "./constraints";

/** Acesso a dados de FAQ. Todo `.from("kennel_faqs")` do painel passa por aqui. */

export type Faq = {
  id: string;
  kennel_id: string;
  question: string;
  answer: string;
  position: number;
};

/** Todas as perguntas do canil, na ordem de exibição. */
export async function getKennelFaqs(kennelId: string): Promise<Faq[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kennel_faqs")
    .select("id, kennel_id, question, answer, position")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .limit(MAX_FAQS_PER_KENNEL);

  return data ?? [];
}

export async function countKennelFaqs(kennelId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("kennel_faqs")
    .select("id", { count: "exact", head: true })
    .eq("kennel_id", kennelId)
    .is("deleted_at", null);

  return count ?? 0;
}
