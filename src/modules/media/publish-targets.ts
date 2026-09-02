import { revalidatePath } from "next/cache";

import type { SupabaseClientLike } from "@/modules/media/queries";

/**
 * ============================================================================
 * O que precisa ser revalidado quando algo entra ou sai do ar.
 * ============================================================================
 *
 * Extraído de `publish.ts` quando o painel administrativo ganhou porta PRÓPRIA
 * de publicação (`admin_set_dog_published` / `admin_set_kennel_published`).
 *
 * POR QUE UM MÓDULO À PARTE, e não `export` em `publish.ts`: aquele arquivo é
 * `"use server"`, e ali TODO export vira endpoint de Server Action — o Next
 * recusa exportar função síncrona de um arquivo assim. Estas três são síncronas
 * (ou puras), então precisam de casa fora dele.
 *
 * POR QUE NÃO EM `sync.ts`: aquele módulo é reconciliação de Storage e não
 * conhece `next/cache`. Misturar as duas coisas ali acoplaria a reconciliação
 * ao runtime do Next sem necessidade.
 *
 * A duplicação que isto evita é a que importa: o caminho do DONO e o caminho do
 * ADMIN publicam a mesma entidade, e uma lista de revalidação que divergisse
 * deixaria uma das duas telas servindo cache velho — o tipo de bug que só
 * aparece em produção, e só para metade dos usuários.
 */

/** O join do PostgREST vem como objeto ou array conforme a cardinalidade. */
export function kennelSlugOf(dog: { kennels?: unknown }): string | null {
  const k = dog.kennels as { slug: string } | { slug: string }[] | null | undefined;
  if (!k) return null;
  return Array.isArray(k) ? (k[0]?.slug ?? null) : k.slug;
}

export function revalidateKennelPaths(slug: string, id: string) {
  revalidatePath(`/c/${slug}`);
  revalidatePath("/painel/canis");
  revalidatePath(`/painel/canis/${id}`);
}

/**
 * Revalida também a página do CANIL: ela lista os cães publicados, então
 * publicar ou despublicar um cão muda o que ela mostra.
 */
export function revalidateDogPaths(publicId: string, id: string, kennelSlug: string | null) {
  revalidatePath(`/d/${publicId}`);
  revalidatePath("/painel/caes");
  revalidatePath(`/painel/caes/${id}`);
  if (kennelSlug) revalidatePath(`/c/${kennelSlug}`);
}

/**
 * `public_id` das ninhadas do canil — o que falta para publicar/despublicar um
 * canil saber QUAIS `/n/[public_id]` revalidar.
 *
 * A REGRA DUPLA (`kennel_litters_select`) faz a visibilidade de CADA ninhada
 * depender do `published_at` do CANIL, não só do dela — então publicar ou
 * despublicar o canil muda o que `/n/[public_id]` de cada ninhada mostra, mesmo
 * sem nenhuma coluna da ninhada ter mudado. Sem esta chamada, essas páginas
 * ficavam presas na versão cacheada (inclusive um "não encontrada") até os 300s
 * do ISR vencerem sozinhos.
 *
 * `onlyPublished`: ao PUBLICAR, só a ninhada que JÁ está com `published_at`
 * preenchido passa a ficar visível — uma em rascunho continua invisível pela
 * mesma regra, e revalidar a página dela seria só reafirmar o 404 que já estava
 * lá. Ao DESPUBLICAR, o filtro é omitido: toda ninhada do canil fica invisível,
 * publicada ou não.
 */
export async function publishedLitterPublicIds(
  supabase: SupabaseClientLike,
  kennelId: string,
  options?: { onlyPublished?: boolean },
): Promise<string[]> {
  let query = supabase
    .from("kennel_litters")
    .select("public_id")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null);
  if (options?.onlyPublished !== false) query = query.not("published_at", "is", null);

  const { data } = await query;
  return (data ?? []).map((l) => l.public_id);
}
