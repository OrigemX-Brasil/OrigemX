"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";

import {
  BUCKET_PRIVATE,
  BUCKET_PUBLIC,
  MAX_GALLERY_ITEMS,
  pathBelongsTo,
  targetBucketFor,
  validateQuota,
  validateStoredFile,
  type MediaRole,
} from "./constraints";
import {
  countDogGallery,
  getUsedBytes,
  statStorageObject,
  type SupabaseClientLike,
} from "./queries";
import { reconcileMediaBucket } from "./sync";

export type MediaActionState = {
  error?: string;
  mediaId?: string;
};

type ParentPublishState = {
  isPublished: boolean;
  /** Caminho da página pública da entidade, só quando publicada. */
  publicPath: string | null;
};

/**
 * A entidade dona já está publicada, e sob qual URL pública?
 *
 * Determina para onde a mídia RECÉM-REGISTRADA deveria ir. O upload em si
 * sempre grava no bucket privado (`BUCKET_PRIVATE`, acima) — só a ação
 * explícita de publicar move para o público, e ela move o que existe NAQUELE
 * momento. Sem esta checagem, uma foto adicionada depois de o cão já estar
 * publicado ficava presa no privado para sempre: a página pública usa o client
 * anônimo, que não tem nenhuma permissão de leitura no bucket privado, então a
 * foto some em silêncio — sem erro, sem log. Foi o bug relatado.
 *
 * `publicPath` sai da mesma consulta para não pagar um segundo round-trip só
 * para saber o que revalidar depois do move.
 */
async function parentPublishState(
  supabase: SupabaseClientLike,
  role: MediaRole,
  entityId: string,
): Promise<ParentPublishState> {
  if (role === "kennel_logo") {
    const { data } = await supabase
      .from("kennels")
      .select("published_at, slug")
      .eq("id", entityId)
      .maybeSingle();
    return {
      isPublished: Boolean(data?.published_at),
      publicPath: data?.slug ? `/c/${data.slug}` : null,
    };
  }

  const { data } = await supabase
    .from("dogs")
    .select("published_at, public_id")
    .eq("id", entityId)
    .maybeSingle();
  return {
    isPublished: Boolean(data?.published_at),
    publicPath: data?.public_id ? `/d/${data.public_id}` : null,
  };
}

/**
 * Registra a metadata de um arquivo JÁ enviado ao Storage pelo client.
 *
 * O upload em si vai direto do navegador para o Storage, com a sessão do
 * usuário — a RLS de `storage.objects` decide se o caminho é dele. Passar o
 * binário por aqui só somaria uma cópia em memória do servidor e um limite de
 * body a estourar.
 *
 * O que este passo faz é o que o client NÃO pode fazer por si:
 *   1. conferir tamanho e mime lendo o Storage, não o que o client declarou;
 *   2. conferir a quota do usuário;
 *   3. gravar a metadata sob RLS.
 *
 * Se qualquer checagem falhar, o arquivo órfão é removido — deixá-lo consumiria
 * plano sem nunca aparecer em tela.
 */
export async function registerMedia(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const user = await requireUser("/painel");

  const role = String(formData.get("role") ?? "") as MediaRole;
  const entityId = String(formData.get("entity_id") ?? "");
  const storagePath = String(formData.get("storage_path") ?? "");
  const thumbPath = String(formData.get("thumb_path") ?? "") || null;
  const width = Number(formData.get("width") ?? 0) || null;
  const height = Number(formData.get("height") ?? 0) || null;
  const alt = String(formData.get("alt") ?? "").trim() || null;

  if (role !== "kennel_logo" && role !== "dog_gallery") return { error: "Tipo de mídia inválido." };
  if (!entityId || !storagePath) return { error: "Envio incompleto." };

  const supabase = await createClient();
  const cleanup = async () => {
    const paths = [storagePath, thumbPath].filter((p): p is string => Boolean(p));
    await supabase.storage.from(BUCKET_PRIVATE).remove(paths);
  };

  // O caminho tem de começar pelo uid. A policy do Storage já barra o upload
  // fora do prefixo, mas esta linha impede que a METADATA aponte para o
  // arquivo de outra pessoa.
  if (!pathBelongsTo(storagePath, user.id) || (thumbPath && !pathBelongsTo(thumbPath, user.id))) {
    return { error: "Caminho de arquivo inválido." };
  }

  const full = await statStorageObject(BUCKET_PRIVATE, storagePath);
  if (!full) {
    return { error: "Arquivo não encontrado no armazenamento. Tente enviar de novo." };
  }

  const check = validateStoredFile({ mime: full.mime, size: full.size });
  if (!check.ok) {
    await cleanup();
    return { error: check.reason };
  }

  const thumb = thumbPath ? await statStorageObject(BUCKET_PRIVATE, thumbPath) : null;

  const used = await getUsedBytes(user.id);
  const quota = validateQuota(used, full.size + (thumb?.size ?? 0));
  if (!quota.ok) {
    await cleanup();
    return { error: quota.reason };
  }

  if (role === "dog_gallery") {
    const current = await countDogGallery(entityId);
    if (current >= MAX_GALLERY_ITEMS) {
      await cleanup();
      return { error: `A galeria aceita no máximo ${MAX_GALLERY_ITEMS} imagens.` };
    }
  }

  // Logo é 1:1. O antigo sai antes do novo entrar, senão o índice único
  // parcial recusa a inserção.
  if (role === "kennel_logo") {
    await supabase
      .from("media")
      .update({ deleted_at: new Date().toISOString() })
      .eq("kennel_id", entityId)
      .eq("role", "kennel_logo")
      .is("deleted_at", null);
  }

  const { data, error } = await supabase
    .from("media")
    .insert({
      bucket_id: BUCKET_PRIVATE,
      storage_path: storagePath,
      thumb_path: thumbPath,
      kennel_id: role === "kennel_logo" ? entityId : null,
      dog_id: role === "dog_gallery" ? entityId : null,
      role,
      mime: full.mime,
      size_bytes: full.size,
      thumb_bytes: thumb?.size ?? null,
      width,
      height,
      alt,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    await cleanup();
    // Se for violação do índice "um logo por canil" (media_one_logo_per_kennel),
    // a causa mais provável é o soft-delete do logo antigo, alguns passos
    // acima, ter afetado zero linhas por RLS (media_update só permite
    // owner_id = auth.uid()) — o antigo continuou "vivo" e barrou o novo.
    console.error(
      `[media:registerMedia] insert falhou para entity=${entityId}, role=${role}, owner=${user.id}:`,
      error?.code,
      error?.message,
    );
    return { error: "Não foi possível registrar a imagem." };
  }

  // Ver `parentPublishState`: sem isto, foto adicionada depois de a entidade
  // já estar publicada ficava presa no bucket privado — o bug relatado.
  const parent = await parentPublishState(supabase, role, entityId);
  if (targetBucketFor(parent.isPublished) === BUCKET_PUBLIC) {
    const outcome = await reconcileMediaBucket(
      supabase,
      [
        {
          id: data.id,
          bucket_id: BUCKET_PRIVATE,
          storage_path: storagePath,
          thumb_path: thumbPath,
        },
      ],
      BUCKET_PUBLIC,
    );
    if (outcome.failed.length > 0) {
      // Não bloqueia o registro se a move falhar: a foto já está gravada e
      // continua visível para o dono. Ficaria fora do perfil público até a
      // próxima publicação/despublicação ou até `npm run media:reconcile
      // -- --apply`, que existe exatamente para este caso. Bloquear o upload
      // por um soluço do Storage seria pior do que a foto demorar a aparecer.
      console.error(
        `[media:registerMedia] falha ao mover ${data.id} para o bucket público:`,
        outcome.failed.map((f) => f.reason).join("; "),
      );
    } else if (parent.publicPath) {
      // A página pública é ISR (`revalidate = 300`): sem isto, o move acima
      // acontece no Storage mas o HTML cacheado segue sem a foto por até 5
      // minutos — o mesmo bug relatado, só que mais devagar.
      revalidatePath(parent.publicPath);
    }
  }

  if (role === "kennel_logo") {
    revalidatePath(`/painel/canis/${entityId}`);
    revalidatePath("/painel/canis");
  } else {
    revalidatePath(`/painel/caes/${entityId}`);
  }

  return { mediaId: data.id };
}

/**
 * Remove uma imagem.
 *
 * A LINHA sai por exclusão lógica, como toda tabela do projeto. O ARQUIVO é
 * apagado de verdade: ele não é registro histórico, é conteúdo substituível, e
 * mantê-lo consumiria plano para sempre sem aparecer em lugar nenhum.
 */
export async function deleteMedia(formData: FormData): Promise<void> {
  const user = await requireUser("/painel");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();

  const { data } = await supabase
    .from("media")
    .select("id, bucket_id, storage_path, thumb_path, kennel_id, dog_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) {
    // Diagnóstico: a linha existe, só não pertence a este owner_id? A
    // policy de SELECT não filtra por owner_id (só pergunta se o canil/cão
    // "existe" para quem lê), então esta segunda consulta não abre nada que
    // a RLS já não deixasse este usuário ver — só tira o filtro que o
    // application-level estava aplicando por cima.
    const { data: anyOwner } = await supabase
      .from("media")
      .select("id, owner_id, kennel_id, dog_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    console.error(
      `[media:deleteMedia] linha não encontrada para user=${user.id}, media id=${id}.`,
      anyOwner
        ? `A linha existe, mas media.owner_id=${anyOwner.owner_id} (kennel=${anyOwner.kennel_id ?? "-"}, dog=${anyOwner.dog_id ?? "-"}) — mismatch de dono explica o "nada acontece".`
        : "A linha não existe (id errado, ou já estava excluída).",
    );
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from("media")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (updateError) {
    console.error(`[media:deleteMedia] UPDATE falhou para media id=${id}:`, updateError.message);
  } else if (!updated || updated.length === 0) {
    console.error(
      `[media:deleteMedia] UPDATE afetou zero linhas para media id=${id} mesmo a SELECT anterior tendo encontrado a linha — RLS negando na escrita apesar da leitura ter passado.`,
    );
  }

  // Só apaga o arquivo se a linha realmente saiu. Na ordem inversa, uma RLS
  // negando deixaria o registro apontando para um arquivo que não existe mais.
  if (updated && updated.length > 0) {
    const paths = [data.storage_path, data.thumb_path].filter((p): p is string => Boolean(p));
    await supabase.storage.from(data.bucket_id).remove(paths);
  }

  if (data.kennel_id) {
    revalidatePath(`/painel/canis/${data.kennel_id}`);
    revalidatePath("/painel/canis");
  }
  if (data.dog_id) revalidatePath(`/painel/caes/${data.dog_id}`);

  // Sem isto, remover o logo/foto de uma entidade JÁ PUBLICADA some no painel
  // mas o perfil público continua com a versão antiga até o ISR de 300s vencer
  // sozinho — a mesma classe de bug que `registerMedia` já trata do lado do
  // upload, só que faltando aqui do lado da remoção.
  const role = data.kennel_id ? "kennel_logo" : "dog_gallery";
  const entityId = data.kennel_id ?? data.dog_id;
  if (entityId) {
    const parent = await parentPublishState(supabase, role, entityId);
    if (parent.isPublished && parent.publicPath) revalidatePath(parent.publicPath);
  }
}

/**
 * Troca qual foto é a CAPA da galeria do cão.
 *
 * "Capa" não é campo novo, nem RLS nova: é a foto na posição mais baixa de
 * `media.position` — a MESMA coluna que já ordena a galeria
 * (`position asc, created_at asc`) e que a página pública já usa para
 * separar a foto principal do resto (`const [principal, ...resto] = media`
 * em `/d/[public_id]`). Trocar a capa é só recolocar a escolhida em primeiro
 * e renumerar o resto na ordem em que já estavam — `media_update` já
 * concede ao dono escrever a própria linha, então não precisa de policy
 * nova.
 *
 * `Promise<void>` e sem estado de erro devolvido, no mesmo estilo de
 * `deleteMedia` acima: o botão que chama isto é um `<form>` simples, sem
 * `useActionState`.
 */
export async function setDogGalleryCover(formData: FormData): Promise<void> {
  const user = await requireUser("/painel");
  const id = String(formData.get("id") ?? "");
  const dogId = String(formData.get("dog_id") ?? "");
  if (!id || !dogId) return;

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("media")
    .select("id, position")
    .eq("dog_id", dogId)
    .eq("role", "dog_gallery")
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (!rows || rows.length === 0) return;

  const chosen = rows.find((row) => row.id === id);
  if (!chosen) return; // Não é uma foto desta galeria — nada a fazer.

  // A escolhida vai para o índice 0; as demais mantêm a ordem relativa que já
  // tinham, só empurradas uma posição para trás.
  const ordered = [chosen, ...rows.filter((row) => row.id !== id)];

  const updates = await Promise.all(
    ordered.map((row, index) =>
      supabase.from("media").update({ position: index }).eq("id", row.id),
    ),
  );

  if (updates.some((u) => u.error)) {
    console.error(`[media:setDogGalleryCover] falha ao renumerar a galeria do cão ${dogId}`);
    return;
  }

  revalidatePath(`/painel/caes/${dogId}`);

  const parent = await parentPublishState(supabase, "dog_gallery", dogId);
  if (parent.isPublished && parent.publicPath) revalidatePath(parent.publicPath);
}
