"use server";

import { revalidatePath } from "next/cache";

import { resolveOwnerId } from "@/lib/assist";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";
import { getManageableDogById } from "@/modules/dogs/queries";

import { MAX_VIDEO_SECONDS, type VideoStatus } from "./constraints";
import { getDogVideo } from "./queries";
import { createDirectUpload, deleteVideo } from "./stream";
import { reconcileDogVideo } from "./sync";

/**
 * ============================================================================
 * Server Actions do vídeo.
 * ============================================================================
 *
 * O ARQUIVO NUNCA PASSA POR AQUI. `requestVideoUpload` devolve ao navegador uma
 * URL de uso único do Cloudflare, e o navegador sobe direto para lá — mesma
 * regra do upload de imagem (`media/upload-one.ts`: "do navegador direto ao
 * Storage"). Passar um vídeo de até 200 MB por uma função serverless somaria
 * uma cópia em memória e estouraria o limite de corpo com folga.
 *
 * QUEM AUTORIZA É O BANCO. As policies `dog_videos_insert`/`dog_videos_update`
 * exigem posse do cão (`private.can_manage_dog`) e sessão não-suspensa, nas
 * duas pontas. As checagens aqui existem para dar MENSAGEM ao usuário, não para
 * substituir aquilo — uma segunda definição de "dono" neste arquivo só
 * divergiria da primeira no dia em que a policy mudasse.
 */

export type UploadTicket =
  | { ok: true; uploadUrl: string; providerUid: string }
  | { ok: false; error: string };

export type SyncResult =
  | { ok: true; status: VideoStatus; errorReason: string | null }
  | { ok: false; error: string };

export type RemoveResult = { ok: true } | { ok: false; error: string };

/**
 * Caminho público do cão, ou `null` se ele ainda não está publicado.
 *
 * Mesma função de `parentPublishState` em `media/actions.ts`: sai da consulta
 * que já foi feita, para não pagar um segundo round-trip só para saber o que
 * revalidar.
 */
function caminhoPublico(dog: { published_at: string | null; public_id: string }): string | null {
  return dog.published_at ? `/d/${dog.public_id}` : null;
}

function revalidar(dogId: string, publicPath: string | null): void {
  revalidatePath(`/painel/caes/${dogId}`);
  // Sem isto, o vídeo aparece no painel e o perfil público segue sem ele por
  // até 300s (o ISR de `/d/[public_id]`) — a mesma classe de bug que
  // `registerMedia`/`deleteMedia` já tratam do lado da imagem.
  if (publicPath) revalidatePath(publicPath);
}

// -----------------------------------------------------------------------------

/**
 * Reserva o vídeo no Cloudflare e devolve ao navegador a URL para onde subir.
 *
 * A `uploadUrl` NÃO É GRAVADA. É credencial de uso único, com uma hora de
 * validade; guardá-la seria guardar um segredo com prazo, sem nenhum uso
 * posterior. Uma abandonada (o usuário desistiu depois de escolher o arquivo)
 * morre sozinha, sem deixar nada para limpar.
 */
export async function requestVideoUpload(dogId: string): Promise<UploadTicket> {
  const user = await requireUser("/painel");

  const dog = await getManageableDogById(dogId, user.id);
  if (!dog) return { ok: false, error: "Cão não encontrado." };

  const supabase = await createClient();

  // Confere ANTES de criar no Cloudflare. Na ordem inversa, cada clique num
  // cão que já tem vídeo reservaria minutos do plano para um registro que o
  // índice único recusaria logo em seguida.
  const existente = await getDogVideo(dogId, supabase);
  if (existente) {
    return { ok: false, error: "Este cão já tem um vídeo. Remova o atual para enviar outro." };
  }

  const upload = await createDirectUpload({
    maxDurationSeconds: MAX_VIDEO_SECONDS,
    creator: user.id,
    meta: { dogId, name: dog.name },
  });
  if (!upload.ok) return { ok: false, error: upload.reason };

  const { uid, uploadUrl } = upload.value;

  const { error } = await supabase.from("dog_videos").insert({
    dog_id: dogId,
    provider_uid: uid,
    status: "pendingupload",
    owner_id: await resolveOwnerId(user.id),
    created_by: user.id,
  });

  if (error) {
    // O vídeo já existe do lado do Cloudflare e ninguém mais vai apontar para
    // ele: sem esta limpeza, cada corrida perdida contra `dog_videos_one_per_dog`
    // deixaria um vídeo órfão consumindo plano para sempre. Mesma disciplina do
    // `cleanup()` de `registerMedia`.
    await deleteVideo(uid);
    console.error(
      `[video:requestVideoUpload] insert falhou para dog=${dogId}:`,
      error.code,
      error.message,
    );
    return { ok: false, error: "Não foi possível iniciar o envio do vídeo." };
  }

  revalidatePath(`/painel/caes/${dogId}`);
  return { ok: true, uploadUrl, providerUid: uid };
}

// -----------------------------------------------------------------------------

/**
 * Lê o andamento da transcodificação e grava o que mudou.
 *
 * Chamada em laço pelo navegador durante a espera. É barata por construção: o
 * curto-circuito de `reconcileDogVideo` não toca em rede quando o status já é
 * terminal, então um cliente insistente não gera tráfego para o Cloudflare
 * depois que o vídeo ficou pronto.
 */
export async function syncVideoStatus(dogId: string): Promise<SyncResult> {
  const user = await requireUser("/painel");

  const supabase = await createClient();
  const video = await getDogVideo(dogId, supabase);
  if (!video) return { ok: false, error: "Vídeo não encontrado." };

  // `dog_videos_select` mostra a linha a quem enxerga o cão — inclusive a um
  // visitante, no caso de cão publicado. Ler não faz mal, mas gastar uma
  // chamada ao Cloudflare por conta de terceiro, sim. Quem sincroniza é quem
  // subiu; a policy de UPDATE já recusaria o resto de qualquer forma.
  if (video.owner_id !== user.id) return { ok: false, error: "Vídeo não encontrado." };

  const anterior = video.status;
  const atualizado = await reconcileDogVideo(supabase, video);

  if (atualizado.status !== anterior) {
    const dog = await getManageableDogById(dogId, user.id);
    revalidar(dogId, dog ? caminhoPublico(dog) : null);
  }

  return { ok: true, status: atualizado.status, errorReason: atualizado.error_reason };
}

// -----------------------------------------------------------------------------

/**
 * Remove o vídeo — do nosso banco E do Cloudflare.
 *
 * A ORDEM IMPORTA, e é a mesma de `deleteMedia`: primeiro a exclusão lógica com
 * `.select()` para PROVAR que a RLS deixou, e só então o DELETE remoto. Na
 * ordem inversa, uma policy negando deixaria a linha apontando para um vídeo
 * que não existe mais.
 *
 * Apagar no Cloudflare não é opcional: sem isso, cada remoção pela nossa tela
 * deixa um arquivo vivo lá consumindo armazenamento sem aparecer em lugar
 * nenhum.
 *
 * Se o DELETE remoto falhar, a linha JÁ SAIU e a operação é considerada bem
 * sucedida. Prender o usuário a um vídeo que ele mandou remover porque um
 * terceiro está fora do ar seria pior do que o custo do órfão, que fica no log
 * para ser limpo depois.
 */
export async function removeDogVideo(dogId: string): Promise<RemoveResult> {
  const user = await requireUser("/painel");

  const supabase = await createClient();
  const video = await getDogVideo(dogId, supabase);
  if (!video) return { ok: true }; // Já não existe: o objetivo está cumprido.

  const { data, error } = await supabase
    .from("dog_videos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", video.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error(
      `[video:removeDogVideo] exclusão lógica não afetou nada para video=${video.id}:`,
      error?.message ?? "zero linhas (RLS ou já removido)",
    );
    return { ok: false, error: "Não foi possível remover o vídeo." };
  }

  const remoto = await deleteVideo(video.provider_uid);
  if (!remoto.ok) {
    console.error(
      `[video:removeDogVideo] linha ${video.id} removida, mas o vídeo ${video.provider_uid} ` +
        `continua no Cloudflare consumindo armazenamento.`,
    );
  }

  const dog = await getManageableDogById(dogId, user.id);
  revalidar(dogId, dog ? caminhoPublico(dog) : null);

  return { ok: true };
}
