"use server";

import { revalidatePath } from "next/cache";

import type { SupabaseClientLike } from "@/modules/media/queries";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";

import { BUCKET_PRIVATE, BUCKET_PUBLIC } from "./constraints";
import {
  dogMediaRows,
  kennelMediaRows,
  litterMediaRowsForKennel,
  reconcileMediaBucket,
} from "./sync";

/**
 * ============================================================================
 * Publicar e despublicar. A ORDEM DAS OPERAÇÕES É A REGRA DE SEGURANÇA.
 * ============================================================================
 *
 * PUBLICAR — mover PRIMEIRO, publicar depois.
 *   Entidade publicada com mídia privada é o pior estado possível: a página
 *   cacheada não pode usar URL assinada (expira), então a imagem ficaria
 *   quebrada de forma PERMANENTE, não temporária. Se o move falhar, não
 *   publicamos.
 *
 * DESPUBLICAR — despublicar PRIMEIRO, mover depois.
 *   O passo que importa para privacidade é a página sumir, e ele não pode ficar
 *   refém de um soluço do Storage. Na ordem inversa, um move com erro deixaria
 *   a entidade INTEIRAMENTE pública.
 *   Se o move falhar aqui, a resposta diz isso com todas as letras: o registro
 *   saiu do ar, mas a URL antiga da imagem ainda resolve até a próxima
 *   reconciliação.
 *
 * JANELA DE CDN, que nenhum código elimina: mesmo com o move bem-sucedido, o
 * CDN continua servindo a cópia em cache da imagem até o `Cache-Control`
 * vencer. Por isso o upload usa 1 hora, e não "imutável" — o conteúdo é
 * imutável, mas a AUTORIZAÇÃO para vê-lo não é. Despublicar remove o objeto na
 * hora; a cópia no edge some dentro da janela.
 */

export type PublishState = {
  error?: string;
  warning?: string;
  ok?: boolean;
};

export async function publishKennel(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Canil não identificado." };

  await requireUser(`/painel/canis/${id}`);
  const supabase = await createClient();

  const { data: kennel } = await supabase
    .from("kennels")
    .select("id, slug")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!kennel) return { error: "Canil não encontrado." };

  // 1. Move primeiro — o logo do canil E a foto de ninhada que JÁ está
  // publicada. Ninhada em rascunho continua invisível pela regra dupla
  // (`kennel_litters_select` exige as duas publicações), então a foto dela
  // fica no privado até a própria ninhada ser publicada.
  const [kennelRows, litterRows, litterPublicIds] = await Promise.all([
    kennelMediaRows(supabase, id),
    litterMediaRowsForKennel(supabase, id, { onlyPublished: true }),
    publishedLitterPublicIds(supabase, id),
  ]);
  const sync = await reconcileMediaBucket(supabase, [...kennelRows, ...litterRows], BUCKET_PUBLIC);

  if (sync.failed.length > 0) {
    return {
      error:
        "Não foi possível preparar as imagens para o acesso público. O canil NÃO foi publicado — tente de novo.",
    };
  }

  // 2. Só então publica.
  const { data: updated, error } = await supabase
    .from("kennels")
    .update({ published_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível publicar o canil." };
  }

  revalidateKennel(kennel.slug, id);
  // A REGRA DUPLA depende do canil — uma ninhada JÁ publicada (`published_at`
  // preenchido) só fica visível a partir de AGORA, e `/n/[public_id]` dela
  // pode ter sido renderizada como "não encontrada" enquanto o canil ainda
  // era rascunho e ficado presa nesse estado até os 300s do ISR vencerem
  // sozinhos. Sem esta linha, publicar o canil não reabre a ninhada.
  for (const publicId of litterPublicIds) revalidatePath(`/n/${publicId}`);
  return { ok: true };
}

export async function unpublishKennel(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Canil não identificado." };

  await requireUser(`/painel/canis/${id}`);
  const supabase = await createClient();

  const { data: kennel } = await supabase
    .from("kennels")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();
  if (!kennel) return { error: "Canil não encontrado." };

  // 1. Tira do ar primeiro.
  const { data: updated, error } = await supabase
    .from("kennels")
    .update({ published_at: null })
    .eq("id", id)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível despublicar o canil." };
  }

  // 2. Purga o cache antes de mexer em arquivo — a ninhada TAMBÉM, e sem o
  // filtro `onlyPublished`: a regra dupla já esconde TODA ninhada assim que o
  // canil sai do ar, publicada ou não, então `/n/[public_id]` de qualquer uma
  // delas precisa parar de servir a versão cacheada.
  revalidateKennel(kennel.slug, id);
  const litterPublicIds = await publishedLitterPublicIds(supabase, id, { onlyPublished: false });
  for (const publicId of litterPublicIds) revalidatePath(`/n/${publicId}`);

  // 3. Devolve os arquivos ao privado — o logo E TODA foto de TODA ninhada
  // deste canil, publicada ou não: a regra dupla já esconde a ninhada
  // inteira assim que o canil sai do ar, então nenhuma foto dela pode
  // continuar acessível no bucket público.
  const [kennelRows, litterRows] = await Promise.all([
    kennelMediaRows(supabase, id),
    litterMediaRowsForKennel(supabase, id),
  ]);
  const sync = await reconcileMediaBucket(supabase, [...kennelRows, ...litterRows], BUCKET_PRIVATE);

  if (sync.failed.length > 0) {
    return {
      ok: true,
      warning:
        "O canil saiu do ar, mas não foi possível remover as imagens do endereço público. " +
        "Quem tiver o link antigo da imagem ainda consegue abri-la. Rode a reconciliação ou tente despublicar de novo.",
    };
  }

  return { ok: true };
}

export async function publishDog(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Cão não identificado." };

  await requireUser(`/painel/caes/${id}`);
  const supabase = await createClient();

  const { data: dog } = await supabase
    .from("dogs")
    .select("id, public_id, kennel_id, kennels(slug)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!dog) return { error: "Cão não encontrado." };

  const rows = await dogMediaRows(supabase, id);
  const sync = await reconcileMediaBucket(supabase, rows, BUCKET_PUBLIC);

  if (sync.failed.length > 0) {
    return {
      error:
        "Não foi possível preparar as imagens para o acesso público. O cão NÃO foi publicado — tente de novo.",
    };
  }

  const { data: updated, error } = await supabase
    .from("dogs")
    .update({ published_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível publicar o cão." };
  }

  revalidateDog(dog.public_id, id, kennelSlugOf(dog));
  return { ok: true };
}

export async function unpublishDog(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Cão não identificado." };

  await requireUser(`/painel/caes/${id}`);
  const supabase = await createClient();

  const { data: dog } = await supabase
    .from("dogs")
    .select("id, public_id, kennel_id, kennels(slug)")
    .eq("id", id)
    .maybeSingle();
  if (!dog) return { error: "Cão não encontrado." };

  const { data: updated, error } = await supabase
    .from("dogs")
    .update({ published_at: null })
    .eq("id", id)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível despublicar o cão." };
  }

  revalidateDog(dog.public_id, id, kennelSlugOf(dog));

  const rows = await dogMediaRows(supabase, id);
  const sync = await reconcileMediaBucket(supabase, rows, BUCKET_PRIVATE);

  if (sync.failed.length > 0) {
    return {
      ok: true,
      warning:
        "O cão saiu do ar, mas não foi possível remover as fotos do endereço público. " +
        "Quem tiver o link antigo da imagem ainda consegue abri-la. Rode a reconciliação ou tente despublicar de novo.",
    };
  }

  return { ok: true };
}

/** O join do PostgREST vem como objeto ou array conforme a cardinalidade. */
function kennelSlugOf(dog: { kennels?: unknown }): string | null {
  const k = dog.kennels as { slug: string } | { slug: string }[] | null | undefined;
  if (!k) return null;
  return Array.isArray(k) ? (k[0]?.slug ?? null) : k.slug;
}

function revalidateKennel(slug: string, id: string) {
  revalidatePath(`/c/${slug}`);
  revalidatePath("/painel/canis");
  revalidatePath(`/painel/canis/${id}`);
}

/**
 * `public_id` das ninhadas do canil — o que falta para `publishKennel`/
 * `unpublishKennel` saberem QUAIS `/n/[public_id]` revalidar.
 *
 * A REGRA DUPLA (`kennel_litters_select`) faz a visibilidade de CADA ninhada
 * depender do `published_at` do CANIL, não só do dela — então publicar ou
 * despublicar o canil muda o que `/n/[public_id]` de cada ninhada mostra,
 * mesmo sem nenhuma coluna da ninhada ter mudado. Sem esta chamada, essas
 * páginas ficavam presas na versão cacheada (inclusive um "não encontrada")
 * até os 300s do ISR vencerem sozinhos — a mesma classe de lacuna que
 * `litterMediaRowsForKennel` já resolve do lado do bucket de fotos.
 *
 * `onlyPublished`: ao PUBLICAR, só a ninhada que JÁ está com `published_at`
 * preenchido passa a ficar visível — uma em rascunho continua invisível pela
 * mesma regra, e revalidar a página dela seria só reafirmar o 404 que já
 * estava lá. Ao DESPUBLICAR, o filtro é omitido: toda ninhada do canil fica
 * invisível, publicada ou não.
 */
async function publishedLitterPublicIds(
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

/**
 * Revalida também a página do CANIL: ela lista os cães publicados, então
 * publicar ou despublicar um cão muda o que ela mostra.
 */
function revalidateDog(publicId: string, id: string, kennelSlug: string | null) {
  revalidatePath(`/d/${publicId}`);
  revalidatePath("/painel/caes");
  revalidatePath(`/painel/caes/${id}`);
  if (kennelSlug) revalidatePath(`/c/${kennelSlug}`);
}
