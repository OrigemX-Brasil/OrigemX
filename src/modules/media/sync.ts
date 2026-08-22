import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import { BUCKET_PRIVATE, BUCKET_PUBLIC, targetBucketFor } from "./constraints";

/**
 * ============================================================================
 * Movimentação de mídia entre o bucket privado e o público.
 * ============================================================================
 *
 * O par "mover objeto no Storage" + "gravar media.bucket_id" NÃO é atômico. Não
 * há transação que abranja os dois. A defesa é dupla:
 *
 *   1. A ORDEM das operações em quem chama (ver publish/unpublish), que garante
 *      que a falha caia sempre no estado menos ruim.
 *   2. Esta reconciliação ser IDEMPOTENTE e CONVERGENTE: rodar de novo conserta
 *      qualquer estado parcial, inclusive o de ter caído entre o move e o
 *      UPDATE.
 */

type Client = SupabaseClient<Database>;

export type MediaLocationRow = {
  id: string;
  bucket_id: string;
  storage_path: string;
  thumb_path: string | null;
};

export type ReconcileResult = {
  moved: number;
  alreadyThere: number;
  failed: Array<{ id: string; path: string; reason: string }>;
};

const EMPTY: ReconcileResult = { moved: 0, alreadyThere: 0, failed: [] };

/** Um objeto existe neste bucket? Usado para detectar move já concluído. */
async function objectExists(client: Client, bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const folder = slash === -1 ? "" : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);

  const { data } = await client.storage.from(bucket).list(folder, { search: name, limit: 100 });
  return (data ?? []).some((f) => f.name === name);
}

/**
 * Move um objeto, tolerando o caso de ele já estar no destino.
 *
 * Esse caso não é hipotético: é exatamente o que sobra quando o processo caiu
 * entre o `move` (que já tinha dado certo) e o `UPDATE` da linha.
 */
async function moveOne(
  client: Client,
  from: string,
  to: string,
  path: string,
): Promise<{ ok: true; movedNow: boolean } | { ok: false; reason: string }> {
  const { error } = await client.storage.from(from).move(path, path, { destinationBucket: to });

  if (!error) return { ok: true, movedNow: true };

  // Falhou: o objeto já está no destino? Então o move anterior deu certo e só a
  // linha ficou para trás.
  if (await objectExists(client, to, path)) {
    return { ok: true, movedNow: false };
  }

  return { ok: false, reason: error.message };
}

/**
 * Converge as linhas informadas para o bucket alvo.
 *
 * Não levanta: devolve o que falhou, para quem chamou decidir se aborta a
 * publicação (deve) ou apenas reporta (despublicação).
 */
export async function reconcileMediaBucket(
  client: Client,
  rows: MediaLocationRow[],
  targetBucket: string,
): Promise<ReconcileResult> {
  if (rows.length === 0) return EMPTY;

  const result: ReconcileResult = { moved: 0, alreadyThere: 0, failed: [] };
  const source = targetBucket === BUCKET_PUBLIC ? BUCKET_PRIVATE : BUCKET_PUBLIC;

  for (const row of rows) {
    if (row.bucket_id === targetBucket) {
      result.alreadyThere += 1;
      continue;
    }

    const paths = [row.storage_path, row.thumb_path].filter((p): p is string => Boolean(p));
    let allOk = true;
    let anyMoved = false;

    for (const path of paths) {
      const outcome = await moveOne(client, source, targetBucket, path);
      if (outcome.ok) {
        if (outcome.movedNow) anyMoved = true;
      } else {
        allOk = false;
        result.failed.push({ id: row.id, path, reason: outcome.reason });
      }
    }

    // Só grava a linha se TODOS os objetos dela chegaram ao destino. Gravar com
    // metade movida deixaria a thumbnail apontando para o bucket errado, e a
    // listagem quebraria sem que a reconciliação soubesse que faltava algo.
    if (allOk) {
      const { error } = await client
        .from("media")
        .update({ bucket_id: targetBucket })
        .eq("id", row.id);

      if (error) {
        result.failed.push({ id: row.id, path: row.storage_path, reason: error.message });
      } else if (anyMoved) {
        result.moved += 1;
      } else {
        result.alreadyThere += 1;
      }
    }
  }

  return result;
}

/** Mídia de um canil (o logo). */
export async function kennelMediaRows(client: Client, kennelId: string) {
  const { data } = await client
    .from("media")
    .select("id, bucket_id, storage_path, thumb_path")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null);
  return (data ?? []) as MediaLocationRow[];
}

/**
 * Mídia de um cão — a galeria E a foto de cada medição dele.
 *
 * DUAS consultas, não uma: a foto de medição não carrega `dog_id` na própria
 * linha de `media` (ela é 1:1 com `measurement_id`, mesmo desenho do avatar de
 * depoimento) — precisa do pulo por `dog_measurements` primeiro. É por isso
 * que `publishDog`/`unpublishDog` (que só chamam esta função) carregam a foto
 * de medição junto com a galeria sem precisar saber que ela existe.
 */
export async function dogMediaRows(client: Client, dogId: string) {
  const { data: measurements } = await client
    .from("dog_measurements")
    .select("id")
    .eq("dog_id", dogId)
    .is("deleted_at", null);
  const measurementIds = (measurements ?? []).map((m) => m.id);

  const [gallery, photos] = await Promise.all([
    client
      .from("media")
      .select("id, bucket_id, storage_path, thumb_path")
      .eq("dog_id", dogId)
      .is("deleted_at", null),
    measurementIds.length > 0
      ? client
          .from("media")
          .select("id, bucket_id, storage_path, thumb_path")
          .in("measurement_id", measurementIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as MediaLocationRow[] }),
  ]);

  return [...(gallery.data ?? []), ...(photos.data ?? [])] as MediaLocationRow[];
}

/** Mídia de UMA ninhada. Usada por `publishLitter`/`unpublishLitter`. */
export async function litterMediaRows(client: Client, litterId: string) {
  const { data } = await client
    .from("media")
    .select("id, bucket_id, storage_path, thumb_path")
    .eq("litter_id", litterId)
    .is("deleted_at", null);
  return (data ?? []) as MediaLocationRow[];
}

/**
 * Mídia dos FILHOTES de uma ninhada — as fotos que vivem em `dogs`, não em
 * `kennel_litters`.
 *
 * Existe porque o filhote é uma linha em `dogs` (ver a migration
 * `ninhada_completa_estrutura`): a foto dele tem `role = 'dog_gallery'` e
 * `dog_id` preenchido, então `litterMediaRows` — que filtra por `litter_id` na
 * própria `media` — não a alcança. Publicar a ninhada precisa mover as duas
 * coisas: a galeria da ninhada E a foto de cada filhote.
 *
 * Duas consultas e não um join: `media` não tem coluna que ligue direto ao
 * `litter_id` do CÃO, e o PostgREST não faz join transitivo aqui.
 */
export async function litterPuppyMediaRows(client: Client, litterId: string) {
  const { data: puppies } = await client
    .from("dogs")
    .select("id")
    .eq("litter_id", litterId)
    .is("deleted_at", null);

  const puppyIds = (puppies ?? []).map((p) => p.id);
  if (puppyIds.length === 0) return [] as MediaLocationRow[];

  const { data } = await client
    .from("media")
    .select("id, bucket_id, storage_path, thumb_path")
    .in("dog_id", puppyIds)
    .is("deleted_at", null);
  return (data ?? []) as MediaLocationRow[];
}

/**
 * Mídia de TODAS as ninhadas de um canil — o lado do cascade que
 * `publishKennel`/`unpublishKennel` precisam, e que `litterMediaRows` (acima,
 * escopada a UMA ninhada) não cobre.
 *
 * `onlyPublished`: ao PUBLICAR o canil, só a foto de ninhada que JÁ está com
 * `published_at` preenchido deve ir ao público — uma ninhada em rascunho
 * continua invisível pela regra dupla (`kennel_litters_select`), e mover a
 * foto dela seria expor um arquivo que nenhuma página RLS deixa alguém
 * enxergar. Ao DESPUBLICAR o canil, a chamada omite o filtro: TODA ninhada
 * fica invisível pela mesma regra, publicada ou não, então toda foto volta ao
 * privado.
 */
export async function litterMediaRowsForKennel(
  client: Client,
  kennelId: string,
  options?: { onlyPublished?: boolean },
) {
  let littersQuery = client
    .from("kennel_litters")
    .select("id")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null);
  if (options?.onlyPublished) littersQuery = littersQuery.not("published_at", "is", null);

  const { data: litters } = await littersQuery;
  const litterIds = (litters ?? []).map((l) => l.id);
  if (litterIds.length === 0) return [] as MediaLocationRow[];

  const { data } = await client
    .from("media")
    .select("id, bucket_id, storage_path, thumb_path")
    .in("litter_id", litterIds)
    .is("deleted_at", null);
  return (data ?? []) as MediaLocationRow[];
}

/** Mídia de UM depoimento (o avatar). Usada por `publishTestimonial`/`unpublishTestimonial`. */
export async function testimonialMediaRows(client: Client, testimonialId: string) {
  const { data } = await client
    .from("media")
    .select("id, bucket_id, storage_path, thumb_path")
    .eq("testimonial_id", testimonialId)
    .is("deleted_at", null);
  return (data ?? []) as MediaLocationRow[];
}

/**
 * Mídia de TODOS os depoimentos de um canil — o lado do cascade que
 * `publishKennel`/`unpublishKennel` precisam. Mesmo raciocínio de
 * `litterMediaRowsForKennel`: ao PUBLICAR o canil, só o avatar de depoimento
 * JÁ publicado vai ao público (um depoimento em rascunho continua invisível
 * pela regra dupla); ao DESPUBLICAR, a chamada omite o filtro.
 */
export async function testimonialMediaRowsForKennel(
  client: Client,
  kennelId: string,
  options?: { onlyPublished?: boolean },
) {
  let testimonialsQuery = client
    .from("testimonials")
    .select("id")
    .eq("kennel_id", kennelId)
    .is("deleted_at", null);
  if (options?.onlyPublished) testimonialsQuery = testimonialsQuery.not("published_at", "is", null);

  const { data: testimonials } = await testimonialsQuery;
  const testimonialIds = (testimonials ?? []).map((t) => t.id);
  if (testimonialIds.length === 0) return [] as MediaLocationRow[];

  const { data } = await client
    .from("media")
    .select("id, bucket_id, storage_path, thumb_path")
    .in("testimonial_id", testimonialIds)
    .is("deleted_at", null);
  return (data ?? []) as MediaLocationRow[];
}

export { targetBucketFor };
