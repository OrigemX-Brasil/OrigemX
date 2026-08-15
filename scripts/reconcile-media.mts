/**
 * OrigemX — reconciliação de mídia entre os buckets privado e público.
 *
 *     npm run media:reconcile            # relatório, sem alterar nada
 *     npm run media:reconcile -- --apply # aplica as correções
 *
 * PARA QUE SERVE: o par "mover objeto no Storage" + "gravar media.bucket_id"
 * não é atômico. Se o processo cair entre os dois, a linha aponta para um
 * bucket e o arquivo está no outro — e a imagem quebra na página pública.
 *
 * As ações de publicar e despublicar já reconciliam a mídia da entidade que
 * tocam. Este script existe porque isso não basta: uma linha que caiu no meio
 * de um move só seria consertada no próximo publish daquele canil, e poderia
 * ficar meses quebrada. É o comando para rodar ANTES DE UM EVENTO.
 *
 * Usa a chave secreta de propósito: precisa enxergar e corrigir a mídia de
 * TODOS os usuários, não a de uma sessão.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL || !SECRET) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.");
  process.exit(2);
}

const BUCKET_PRIVATE = "kennel-media";
const BUCKET_PUBLIC = "kennel-media-public";

const apply = process.argv.includes("--apply");

const admin = createClient(URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Row = {
  id: string;
  bucket_id: string;
  storage_path: string;
  thumb_path: string | null;
  kennel_id: string | null;
  dog_id: string | null;
  litter_id: string | null;
};

async function objectExists(bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const folder = slash === -1 ? "" : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const { data } = await admin.storage.from(bucket).list(folder, { search: name, limit: 100 });
  return (data ?? []).some((f) => f.name === name);
}

async function main() {
  console.log(`\nOrigemX — reconciliação de mídia`);
  console.log(`Projeto: ${URL}`);
  console.log(apply ? "Modo: APLICAR\n" : "Modo: relatório (use --apply para corrigir)\n");

  const { data: rows, error } = await admin
    .from("media")
    .select("id, bucket_id, storage_path, thumb_path, kennel_id, dog_id, litter_id")
    .is("deleted_at", null);

  if (error || !rows) {
    console.error("Não foi possível ler a tabela media:", error?.message);
    process.exit(1);
  }

  // Estado de publicação das entidades donas, em duas consultas em vez de uma
  // por linha.
  const kennelIds = [...new Set(rows.map((r) => r.kennel_id).filter(Boolean))] as string[];
  const dogIds = [...new Set(rows.map((r) => r.dog_id).filter(Boolean))] as string[];
  const litterIds = [...new Set(rows.map((r) => r.litter_id).filter(Boolean))] as string[];

  const [kennels, dogs, litters] = await Promise.all([
    kennelIds.length
      ? admin.from("kennels").select("id, published_at, deleted_at").in("id", kennelIds)
      : Promise.resolve({ data: [] }),
    dogIds.length
      ? admin
          .from("dogs")
          .select("id, published_at, deleted_at, owner_id, kennel_id")
          .in("id", dogIds)
      : Promise.resolve({ data: [] }),
    litterIds.length
      ? admin.from("kennel_litters").select("id, published_at, deleted_at, kennel_id").in("id", litterIds)
      : Promise.resolve({ data: [] }),
  ]);

  const publishedKennel = new Map(
    (kennels.data ?? []).map((k) => [k.id, Boolean(k.published_at) && !k.deleted_at]),
  );
  // Ancestral FANTASMA (sem dono e sem canil) é público mesmo sem
  // `published_at` — mesma exceção de `dog_is_public()` no banco. Sem isto
  // aqui, o script achava a mídia dele "divergente" na direção errada: podia
  // devolver ao privado uma foto que por acaso estivesse no público.
  const publishedDog = new Map(
    (dogs.data ?? []).map((d) => [
      d.id,
      (Boolean(d.published_at) || (d.owner_id === null && d.kennel_id === null)) && !d.deleted_at,
    ]),
  );
  // REGRA DUPLA, mesma de `parentPublishState` em media/actions.ts: a foto só
  // é pública se a NINHADA e o CANIL dela estiverem publicados. `litter_id` é
  // o terceiro braço de posse (media_single_owner, desde a migration de
  // ninhadas) — sem esta entrada o script tratava toda foto de ninhada como
  // "deveria ser privada" incondicionalmente, movendo até foto já pública e
  // correta para o bucket errado.
  const publishedLitter = new Map(
    (litters.data ?? []).map((l) => [
      l.id,
      Boolean(l.published_at) && !l.deleted_at && (publishedKennel.get(l.kennel_id) ?? false),
    ]),
  );

  let ok = 0;
  let corrigidas = 0;
  let divergentes = 0;
  let orfas = 0;
  let falhas = 0;

  for (const row of rows as Row[]) {
    const isPublished = row.kennel_id
      ? (publishedKennel.get(row.kennel_id) ?? false)
      : row.dog_id
        ? (publishedDog.get(row.dog_id) ?? false)
        : row.litter_id
          ? (publishedLitter.get(row.litter_id) ?? false)
          : false;

    const target = isPublished ? BUCKET_PUBLIC : BUCKET_PRIVATE;
    const source = target === BUCKET_PUBLIC ? BUCKET_PRIVATE : BUCKET_PUBLIC;
    const paths = [row.storage_path, row.thumb_path].filter((p): p is string => Boolean(p));

    // Onde os arquivos REALMENTE estão — nos DOIS buckets, não só no alvo.
    // Sem olhar a origem também, não dá para distinguir "está no lugar errado"
    // de "não existe em lugar nenhum", e os dois exigem tratamento oposto.
    const located = await Promise.all(
      paths.map(async (p) => ({
        path: p,
        inTarget: await objectExists(target, p),
        inSource: await objectExists(source, p),
      })),
    );

    const allInTarget = located.every((l) => l.inTarget);
    const nowhere = located.filter((l) => !l.inTarget && !l.inSource);

    if (allInTarget && row.bucket_id === target) {
      ok += 1;
      continue;
    }

    const dono = row.kennel_id
      ? `canil ${row.kennel_id}`
      : row.dog_id
        ? `cão ${row.dog_id}`
        : `ninhada ${row.litter_id}`;

    // ÓRFÃ: a linha existe, o arquivo não está em bucket nenhum. Mover é
    // impossível e tentar só geraria erro. Só relata — apagar metadata é
    // destrutivo e precisa de decisão humana.
    if (nowhere.length === paths.length) {
      orfas += 1;
      console.log(
        `  ${row.id}  ${dono}\n    ÓRFÃ: arquivo não existe em nenhum bucket (${row.storage_path})`,
      );
      continue;
    }

    divergentes += 1;
    console.log(
      `  ${row.id}  ${dono}\n    linha diz "${row.bucket_id}", deveria ser "${target}"` +
        `\n    arquivos no destino: ${located.filter((l) => l.inTarget).length}/${located.length}` +
        (nowhere.length > 0 ? `\n    ${nowhere.length} arquivo(s) sumido(s)` : ""),
    );

    if (!apply) continue;

    let moveOk = true;
    for (const { path, inTarget } of located) {
      if (inTarget) continue;
      const { error: moveError } = await admin.storage
        .from(source)
        .move(path, path, { destinationBucket: target });
      if (moveError && !(await objectExists(target, path))) {
        moveOk = false;
        falhas += 1;
        console.log(`    FALHA ao mover ${path}: ${moveError.message}`);
      }
    }

    // Só grava a linha se TODOS os arquivos chegaram — metade movida com a
    // linha atualizada esconderia o problema restante da próxima varredura.
    if (moveOk) {
      const { error: updateError } = await admin
        .from("media")
        .update({ bucket_id: target })
        .eq("id", row.id);
      if (updateError) {
        falhas += 1;
        console.log(`    FALHA ao gravar a linha: ${updateError.message}`);
      } else {
        corrigidas += 1;
        console.log(`    corrigida`);
      }
    }
  }

  console.log(
    `\n${rows.length} linha(s): ${ok} em ordem, ${divergentes} divergente(s), ${orfas} órfã(s)` +
      (apply ? `, ${corrigidas} corrigida(s), ${falhas} falha(s)` : ""),
  );

  if (!apply && divergentes > 0) {
    console.log(`\nRode com --apply para corrigir as divergentes.`);
  }

  if (orfas > 0) {
    console.log(
      `\nÓrfãs não são corrigidas automaticamente: a linha aponta para um arquivo que\n` +
        `não existe, e apagar metadata é decisão humana. Em dev costuma ser resíduo de\n` +
        `teste; em produção, investigue antes de remover.`,
    );
  }

  // `process.exitCode` em vez de `process.exit()`: encerrar de imediato com
  // conexões do client ainda abertas derruba o libuv com assert no Windows.
  // Assim o Node drena os handles e sai com o código certo.
  process.exitCode = falhas > 0 ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
