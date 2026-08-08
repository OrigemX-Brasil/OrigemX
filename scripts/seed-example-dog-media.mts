/**
 * OrigemX — sobe as fotos do cão de exemplo da home ("Veja como fica").
 *
 *     node --env-file=.env.production.local scripts/seed-example-dog-media.mts
 *
 * SCRIPT DE PRODUÇÃO, roda uma vez, depois que `supabase/tests/seed-example-dog.sql`
 * já criou o Thor. O cão nasce publicado, então as fotos vão direto pro
 * bucket público — sem passar pelo privado primeiro, que é o caminho de quem
 * ainda está rascunhando o cadastro (ver `targetBucketFor` em
 * `src/modules/media/constraints.ts`).
 *
 * Usa a chave secreta de propósito: grava `media` direto, sem passar pela API
 * autenticada (que de propósito não deixa o usuário escolher `dog_id`/bucket
 * à mão).
 */

import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SECRET) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.");
  process.exit(2);
}

const BUCKET_PUBLIC = "kennel-media-public";
const DOG_ID = "10000000-0000-4000-9000-000000000001";
const OWNER_ID = "58ce26b2-7fa1-4239-b7f0-0c223279eb74";

const PHOTOS = [
  {
    file: "perfil-exemplo.jpg",
    fileId: "principal",
    position: 0,
    width: 1000,
    height: 665,
    alt: "Thor, filhote de Rottweiler",
  },
  {
    file: "exemplo2.jpg",
    fileId: "galeria-1",
    position: 1,
    width: 551,
    height: 583,
    alt: "Thor no jardim",
  },
  {
    file: "exemplo3.jpg",
    fileId: "galeria-2",
    position: 2,
    width: 400,
    height: 400,
    alt: "Thor de perto",
  },
  {
    file: "exemplo4.jpg",
    fileId: "galeria-3",
    position: 3,
    width: 662,
    height: 463,
    alt: "Thor deitado na grama",
  },
] as const;

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`\nOrigemX — fotos do cão de exemplo\nProjeto: ${SUPABASE_URL}\n`);

  for (const photo of PHOTOS) {
    const localPath = new URL(`../assets/fotos/${photo.file}`, import.meta.url);
    const bytes = readFileSync(localPath);
    const storagePath = `${OWNER_ID}/caes/${DOG_ID}/${photo.fileId}.jpg`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET_PUBLIC)
      .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      console.error(`  FALHA no upload de ${photo.file}: ${uploadError.message}`);
      process.exitCode = 1;
      continue;
    }

    const { error: insertError } = await admin.from("media").insert({
      bucket_id: BUCKET_PUBLIC,
      storage_path: storagePath,
      dog_id: DOG_ID,
      role: "dog_gallery",
      mime: "image/jpeg",
      size_bytes: bytes.byteLength,
      width: photo.width,
      height: photo.height,
      alt: photo.alt,
      position: photo.position,
      owner_id: OWNER_ID,
      created_by: OWNER_ID,
    });
    if (insertError) {
      console.error(`  FALHA ao gravar a linha de ${photo.file}: ${insertError.message}`);
      process.exitCode = 1;
      continue;
    }

    console.log(`  ok  ${photo.file} -> ${storagePath}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
