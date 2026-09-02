"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";
import { getDescendantIds } from "@/modules/dogs/queries";

import {
  BUCKET_PRIVATE,
  BUCKET_PUBLIC,
  MAX_GALLERY_ITEMS,
  normalizeCaption,
  pathBelongsTo,
  targetBucketFor,
  validateQuota,
  validateStoredFile,
  type MediaRole,
} from "./constraints";
import {
  countDogGallery,
  getUsedBytes,
  ownerOfMediaEntity,
  statStorageObject,
  type SupabaseClientLike,
} from "./queries";
import { reconcileMediaBucket } from "./sync";

export type MediaActionState = {
  error?: string;
  mediaId?: string;
};

export type ParentPublishState = {
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
export async function parentPublishState(
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

  if (role === "litter_gallery") {
    // REGRA DUPLA: a foto só é pública se a NINHADA e o CANIL dela estiverem
    // publicados — ver `kennel_litters_select` na migration. Mover a foto ao
    // bucket público com só metade da regra satisfeita exporia um arquivo que
    // nenhuma página RLS deixa alguém enxergar.
    const { data } = await supabase
      .from("kennel_litters")
      .select("published_at, kennels(published_at, slug)")
      .eq("id", entityId)
      .maybeSingle();
    const kennel = kennelJoinOf(data?.kennels);
    return {
      isPublished: Boolean(data?.published_at) && Boolean(kennel?.published_at),
      publicPath: kennel?.slug ? `/c/${kennel.slug}` : null,
    };
  }

  if (role === "testimonial_avatar") {
    // REGRA DUPLA, mesmo molde de litter_gallery: o avatar só é público se o
    // DEPOIMENTO e o CANIL dele estiverem publicados — ver
    // `testimonials_select` na migration.
    const { data } = await supabase
      .from("testimonials")
      .select("published_at, kennels(published_at, slug)")
      .eq("id", entityId)
      .maybeSingle();
    const kennel = kennelJoinOf(data?.kennels);
    return {
      isPublished: Boolean(data?.published_at) && Boolean(kennel?.published_at),
      publicPath: kennel?.slug ? `/c/${kennel.slug}` : null,
    };
  }

  if (role === "measurement_photo") {
    // `entityId` aqui é o id da MEDIÇÃO, não do cão — precisa de um pulo a
    // mais antes de reaplicar a MESMA regra do braço de `dog_gallery` abaixo
    // (publicado, OU ancestral fantasma sem dono/canil).
    const { data: measurement } = await supabase
      .from("dog_measurements")
      .select("dog_id")
      .eq("id", entityId)
      .maybeSingle();
    if (!measurement) return { isPublished: false, publicPath: null };

    const { data: dog } = await supabase
      .from("dogs")
      .select("published_at, public_id, owner_id, kennel_id")
      .eq("id", measurement.dog_id)
      .maybeSingle();
    if (!dog) return { isPublished: false, publicPath: null };
    return {
      isPublished: Boolean(dog.published_at) || (dog.owner_id === null && dog.kennel_id === null),
      publicPath: dog.public_id ? `/d/${dog.public_id}` : null,
    };
  }

  const { data } = await supabase
    .from("dogs")
    .select("published_at, public_id, owner_id, kennel_id")
    .eq("id", entityId)
    .maybeSingle();
  if (!data) return { isPublished: false, publicPath: null };
  return {
    // Ancestral FANTASMA (sem dono e sem canil) é público mesmo sem
    // `published_at` — mesma exceção de `dog_is_public()` no banco. Sem
    // replicar isto aqui, a foto dele nunca saía do bucket privado: era o
    // bug relatado (a árvore de pedigree nunca via a foto, não só atrasada).
    isPublished: Boolean(data.published_at) || (data.owner_id === null && data.kennel_id === null),
    publicPath: data.public_id ? `/d/${data.public_id}` : null,
  };
}

/**
 * Revalida a árvore de pedigree de todo descendente do cão — o MESMO cão
 * pode ser sire/dam de vários descendentes publicados (linebreeding é
 * legítimo), então a foto de capa de um ancestral pode aparecer em mais de
 * UMA página. Sem isto, só a página do próprio cão era revalidada, e a
 * árvore de qualquer descendente ficava presa no HTML do ISR por até 300s
 * (`revalidate` de `/d/[public_id]`) — ou para sempre, no caso do fantasma
 * que `parentPublishState` corrige acima.
 *
 * `getDescendantIds` enxerga a árvore inteira (SECURITY DEFINER, ignora
 * RLS); o `.select` que segue passa pela RLS normal do chamador — só volta
 * `public_id` de quem já é alcançável, que é exatamente quem tem página
 * pública para revalidar. Um descendente ainda rascunho não devolve linha
 * aqui, e não precisa: não existe HTML publicado dele para ficar velho.
 */
async function revalidateDescendantPedigrees(
  supabase: SupabaseClientLike,
  dogId: string,
): Promise<void> {
  const ids = await getDescendantIds(dogId);
  if (ids.size === 0) return;

  const { data } = await supabase
    .from("dogs")
    .select("public_id")
    .in("id", [...ids]);
  for (const row of data ?? []) {
    if (row.public_id) revalidatePath(`/d/${row.public_id}`);
  }
}

/** O join do PostgREST vem como objeto ou array conforme a cardinalidade. */
function kennelJoinOf(
  k:
    | { published_at: string | null; slug: string }
    | { published_at: string | null; slug: string }[]
    | null
    | undefined,
) {
  if (!k) return null;
  return Array.isArray(k) ? (k[0] ?? null) : k;
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

  if (
    role !== "kennel_logo" &&
    role !== "dog_gallery" &&
    role !== "testimonial_avatar" &&
    role !== "measurement_photo"
  ) {
    return { error: "Tipo de mídia inválido." };
  }
  if (!entityId || !storagePath) return { error: "Envio incompleto." };

  // Avatar de depoimento é foto de TERCEIRO — o checkbox do `ImageUploader`
  // (prop `consent`) é só UI; esta é a checagem que de fato recusa. Sem ela,
  // um POST forjado contornaria o campo desabilitado no client. Mesma frase
  // de recusa que `addTestimonial` já usa para o texto, por consistência.
  if (role === "testimonial_avatar" && formData.get("lgpd_consent") !== "on") {
    return { error: "Confirme que você tem autorização desta pessoa para publicar a foto dela." };
  }

  const supabase = await createClient();
  const cleanup = async () => {
    const paths = [storagePath, thumbPath].filter((p): p is string => Boolean(p));
    await supabase.storage.from(BUCKET_PRIVATE).remove(paths);
  };

  // O DONO SAI DA ENTIDADE, não da sessão.
  //
  // Antes era `user.id`, e isso produziu um defeito real: um admin com acesso
  // ao painel do dono (por `created_by`) subiu quatro fotos no cão de um
  // criador, e as quatro nasceram com o ADMIN como dono — arquivo no prefixo
  // errado e quota cobrada de quem não devia. Para o próprio criador nada muda:
  // ele É o dono da entidade, então a consulta devolve o mesmo id de sempre.
  //
  // Fallback para `user.id` quando a entidade não tem dono: é o ancestral
  // fantasma, cujo `owner_id` é NULL por desenho.
  const ownerId = (await ownerOfMediaEntity(role, entityId)) ?? user.id;

  // O caminho tem de começar pelo prefixo do DONO. A policy do Storage já barra
  // o upload fora do prefixo, mas esta linha impede que a METADATA aponte para
  // o arquivo de outra pessoa.
  if (!pathBelongsTo(storagePath, ownerId) || (thumbPath && !pathBelongsTo(thumbPath, ownerId))) {
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

  // Quota do DONO da entidade — o arquivo ocupa o plano de quem vai ficar com ele.
  const used = await getUsedBytes(ownerId);
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

  // Logo, avatar e foto de medição são 1:1. O antigo sai antes do novo
  // entrar, senão o índice único parcial recusa a inserção.
  if (role === "kennel_logo" || role === "testimonial_avatar" || role === "measurement_photo") {
    const ownerColumn =
      role === "kennel_logo"
        ? "kennel_id"
        : role === "testimonial_avatar"
          ? "testimonial_id"
          : "measurement_id";
    await supabase
      .from("media")
      .update({ deleted_at: new Date().toISOString() })
      .eq(ownerColumn, entityId)
      .eq("role", role)
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
      testimonial_id: role === "testimonial_avatar" ? entityId : null,
      measurement_id: role === "measurement_photo" ? entityId : null,
      role,
      mime: full.mime,
      size_bytes: full.size,
      thumb_bytes: thumb?.size ?? null,
      width,
      height,
      alt,
      owner_id: ownerId,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    await cleanup();
    // O usuário só vê "não foi possível"; o motivo real (violação do índice
    // `media_one_logo_per_kennel`, quota, mime) só existe aqui.
    console.error(
      `[media:registerMedia] insert falhou para entity=${entityId}, role=${role}:`,
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
      if (role === "dog_gallery") await revalidateDescendantPedigrees(supabase, entityId);
    }
  }

  if (role === "kennel_logo") {
    revalidatePath(`/painel/canis/${entityId}`);
    revalidatePath("/painel/canis");
  } else if (role === "testimonial_avatar") {
    // `entityId` aqui é o id do DEPOIMENTO, não do canil — mesma pegadinha
    // que `litter_id` já tem em `deleteMedia`, abaixo.
    const { data: testimonial } = await supabase
      .from("testimonials")
      .select("kennel_id")
      .eq("id", entityId)
      .maybeSingle();
    if (testimonial?.kennel_id) revalidatePath(`/painel/canis/${testimonial.kennel_id}`);
  } else if (role === "measurement_photo") {
    // `entityId` aqui é o id da MEDIÇÃO, não do cão — mesma pegadinha.
    const { data: measurement } = await supabase
      .from("dog_measurements")
      .select("dog_id")
      .eq("id", entityId)
      .maybeSingle();
    if (measurement?.dog_id) revalidatePath(`/painel/caes/${measurement.dog_id}`);
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
    .select(
      "id, bucket_id, storage_path, thumb_path, kennel_id, dog_id, litter_id, testimonial_id, measurement_id",
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return;

  const { data: updated, error: updateError } = await supabase
    .from("media")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  // Falha aqui é silenciosa para o usuário (o botão é um `<form>` sem estado),
  // então sem log ela não existe em lugar nenhum — foi assim que a policy que
  // recusava a própria exclusão lógica passou despercebida até produção.
  if (updateError) {
    console.error(`[media:deleteMedia] UPDATE falhou para media id=${id}:`, updateError.message);
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

  // A foto de ninhada não carrega o `kennel_id` na própria linha (é um pulo a
  // mais: media → kennel_litters → kennels) — sem esta consulta, apagar a
  // capa de uma ninhada não atualizaria nem a própria tela da ninhada nem a
  // lista de ninhadas do canil.
  let litterKennelId: string | null = null;
  if (data.litter_id) {
    const { data: litter } = await supabase
      .from("kennel_litters")
      .select("kennel_id")
      .eq("id", data.litter_id)
      .maybeSingle();
    litterKennelId = litter?.kennel_id ?? null;

    if (litterKennelId) {
      revalidatePath(`/painel/canis/${litterKennelId}/ninhadas/${data.litter_id}`);
      revalidatePath(`/painel/canis/${litterKennelId}`);
    }
  }

  // Mesma pegadinha do `litter_id` acima: o avatar de depoimento não carrega
  // `kennel_id` na própria linha de `media`.
  if (data.testimonial_id) {
    const { data: testimonial } = await supabase
      .from("testimonials")
      .select("kennel_id")
      .eq("id", data.testimonial_id)
      .maybeSingle();

    if (testimonial?.kennel_id) revalidatePath(`/painel/canis/${testimonial.kennel_id}`);
  }

  // Mesma pegadinha, um pulo mais curto: a foto de medição não carrega
  // `dog_id` na própria linha de `media`.
  if (data.measurement_id) {
    const { data: measurement } = await supabase
      .from("dog_measurements")
      .select("dog_id")
      .eq("id", data.measurement_id)
      .maybeSingle();

    if (measurement?.dog_id) revalidatePath(`/painel/caes/${measurement.dog_id}`);
  }

  // Sem isto, remover o logo/foto de uma entidade JÁ PUBLICADA some no painel
  // mas o perfil público continua com a versão antiga até o ISR de 300s vencer
  // sozinho — a mesma classe de bug que `registerMedia` já trata do lado do
  // upload, só que faltando aqui do lado da remoção. Antes desta correção, uma
  // foto de ninhada (kennel_id e dog_id os dois nulos) caía no `else` e virava
  // "dog_gallery" com entityId nulo — a revalidação era pulada em silêncio.
  const role: MediaRole | null = data.kennel_id
    ? "kennel_logo"
    : data.dog_id
      ? "dog_gallery"
      : data.litter_id
        ? "litter_gallery"
        : data.testimonial_id
          ? "testimonial_avatar"
          : data.measurement_id
            ? "measurement_photo"
            : null;
  const entityId =
    data.kennel_id ?? data.dog_id ?? data.litter_id ?? data.testimonial_id ?? data.measurement_id;
  if (role && entityId) {
    const parent = await parentPublishState(supabase, role, entityId);
    if (parent.isPublished && parent.publicPath) {
      revalidatePath(parent.publicPath);
      if (role === "dog_gallery") await revalidateDescendantPedigrees(supabase, entityId);
    }
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
  if (parent.isPublished && parent.publicPath) {
    revalidatePath(parent.publicPath);
    await revalidateDescendantPedigrees(supabase, dogId);
  }
}

export type CaptionState = {
  error?: string;
  ok?: boolean;
};

/**
 * Grava (ou remove) a legenda de uma foto.
 *
 * QUEM AUTORIZA É O BANCO — e só ele. `media_update` já exige
 * `owner_id = auth.uid()` OU admin, E `not private.is_suspended()`, nas duas
 * pontas (`using` e `with check`). Por isso o UPDATE não repete
 * `.eq("owner_id", ...)`: uma segunda definição de "dono" aqui só divergiria
 * da primeira no dia em que a policy mudasse.
 *
 * O que esta função PRECISA fazer é falhar alto. Um UPDATE que a RLS recusa
 * não devolve erro pelo PostgREST: devolve sucesso com ZERO linha. Sem o
 * `.select()` + `if (!data)` abaixo, uma sessão suspensa, ou um id de foto
 * alheia, veria o diálogo fechar como se tivesse salvo — a mesma classe de
 * falha silenciosa que o log de `deleteMedia`, acima, existe para não deixar
 * passar batido de novo.
 *
 * O `select` também devolve `kennel_id`/`dog_id` na MESMA ida ao banco — é o
 * que decide o que revalidar, sem um segundo round-trip.
 */
export async function setMediaCaption(formData: FormData): Promise<CaptionState> {
  await requireUser("/painel");

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Foto não identificada." };

  const caption = normalizeCaption(String(formData.get("caption") ?? ""));
  if (!caption.ok) return { error: caption.reason };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("media")
    .update({ caption: caption.value })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, kennel_id, dog_id")
    .maybeSingle();

  if (error) {
    // O usuário só vê "não foi possível"; o motivo real (CHECK de tamanho,
    // id malformado) só existe aqui.
    console.error(`[media:setMediaCaption] UPDATE falhou para media id=${id}:`, error.message);
    return { error: "Não foi possível salvar a legenda." };
  }

  // Zero linha: a policy recusou (não é sua, ou você está suspenso) ou a foto
  // já foi removida. Mensagem única de propósito — distinguir os casos
  // contaria a um estranho que aquele id existe.
  if (!data) return { error: "Não foi possível salvar a legenda desta foto." };

  if (data.kennel_id) {
    revalidatePath(`/painel/canis/${data.kennel_id}`);
    revalidatePath("/painel/canis");
  }
  if (data.dog_id) revalidatePath(`/painel/caes/${data.dog_id}`);

  // Sem isto, a legenda aparece no painel e o perfil público segue sem ela
  // por até 300s (o ISR de `/d/[public_id]`) — a mesma classe de bug que
  // `registerMedia`/`deleteMedia` já tratam do lado deles.
  const role = data.kennel_id ? "kennel_logo" : "dog_gallery";
  const entityId = data.kennel_id ?? data.dog_id;
  if (entityId) {
    const parent = await parentPublishState(supabase, role, entityId);
    if (parent.isPublished && parent.publicPath) revalidatePath(parent.publicPath);
  }

  return { ok: true };
}
