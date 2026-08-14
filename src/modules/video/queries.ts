import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

import type { VideoStatus } from "./constraints";

/**
 * Acesso a dados do vídeo. Todo `.from("dog_videos")` do app passa por aqui.
 *
 * A consulta ANÔNIMA da página pública NÃO mora aqui: ela vive em
 * `modules/public/queries.ts`, junto de `getPublicMedia`, que é onde está todo
 * acesso com `createPublicClient`. A separação é a mesma que `media` já segue.
 */

export type SupabaseClientLike = SupabaseClient<Database>;

export const VIDEO_COLUMNS =
  "id, dog_id, provider, provider_uid, status, thumbnail_url, playback_origin, duration_seconds, error_reason, owner_id, created_at";

export type DogVideo = {
  id: string;
  dog_id: string;
  provider: string;
  provider_uid: string;
  status: VideoStatus;
  thumbnail_url: string | null;
  playback_origin: string | null;
  duration_seconds: number | null;
  error_reason: string | null;
  owner_id: string;
  created_at: string;
};

/**
 * O vídeo vivo de um cão, ou `null`.
 *
 * Sem `limit`: `dog_videos_one_per_dog` garante no máximo uma linha viva por
 * cão — o índice único parcial é o limite, e um `maybeSingle` que voltasse com
 * duas linhas seria bug de schema, não de consulta.
 *
 * NUNCA LEVANTA. Vídeo é acessório; a tela do cão não pode deixar de abrir
 * porque esta linha não veio.
 */
export async function getDogVideo(
  dogId: string,
  client?: SupabaseClientLike,
): Promise<DogVideo | null> {
  try {
    const supabase = client ?? (await createClient());
    const { data } = await supabase
      .from("dog_videos")
      .select(VIDEO_COLUMNS)
      .eq("dog_id", dogId)
      .is("deleted_at", null)
      .maybeSingle();

    return (data as DogVideo | null) ?? null;
  } catch {
    return null;
  }
}
