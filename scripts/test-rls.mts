/**
 * OrigemX — evidência formal de RLS
 *
 * Exercita as políticas de segurança do banco pela MESMA porta que um atacante
 * usaria: a API REST do Supabase, com chave publishable e sessão de usuário
 * real. Nada aqui passa pela UI, e nada usa a chave secreta para provar acesso
 * — a chave secreta só cria e destrói as fixtures.
 *
 *     npm run test:rls
 *
 * Sai com código != 0 se qualquer cenário falhar, e escreve o relatório em
 * reports/rls-report.md e reports/rls-report.json.
 *
 * Este arquivo é documento de homologação. Ao mudar uma policy, o cenário
 * correspondente aqui muda junto — um relatório verde que não reflete o schema
 * é pior do que nenhum relatório.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// A tradução de erro é o que separa "ciclo genealógico" de um 500. Importada da
// aplicação de propósito: testar uma cópia provaria a cópia.
import { translateDogError } from "../src/modules/dogs/errors.ts";

// -----------------------------------------------------------------------------
// Ambiente
// -----------------------------------------------------------------------------

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL || !PUBLISHABLE || !SECRET) {
  console.error(
    "Faltam variáveis de ambiente. Esperado NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY em .env.local.",
  );
  process.exit(2);
}

const BUCKET = "kennel-media";
const RUN = Date.now().toString(36);
const PASSWORD = `rls-test-${RUN}-Aa1!`;

/** Chave secreta: SÓ para criar e destruir fixtures. Nunca para provar acesso. */
const admin = createClient(URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// -----------------------------------------------------------------------------
// Relatório
// -----------------------------------------------------------------------------

type Status = "PASS" | "FAIL";

type Check = {
  cenario: string;
  verificacao: string;
  esperado: string;
  obtido: string;
  status: Status;
};

const checks: Check[] = [];

function record(
  cenario: string,
  verificacao: string,
  esperado: string,
  obtido: string,
  ok: boolean,
) {
  checks.push({ cenario, verificacao, esperado, obtido, status: ok ? "PASS" : "FAIL" });
}

/** Descreve o resultado de uma operação PostgREST em uma linha legível. */
function describe(error: { code?: string; message: string } | null, rows?: unknown[]): string {
  if (error) return `erro ${error.code ?? "?"}: ${error.message}`;
  return `${rows?.length ?? 0} linha(s)`;
}

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

type Actor = { id: string; email: string; client: SupabaseClient };

async function createActor(label: string): Promise<Actor> {
  const email = `rls-${RUN}-${label}@origemx.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`não criou usuário ${label}: ${error?.message}`);

  const client = createClient(URL!, PUBLISHABLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw new Error(`não autenticou ${label}: ${signInError.message}`);

  return { id: data.user.id, email, client };
}

/** PNG 1x1 válido — o bucket só aceita mime de imagem. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  console.log(`\nOrigemX — evidência de RLS`);
  console.log(`Projeto: ${URL}`);
  console.log(`Execução: ${RUN}\n`);

  const anon = createClient(URL!, PUBLISHABLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const A = await createActor("a");
  const B = await createActor("b");

  // ---------------------------------------------------------------------------
  // Cenário 1 — A e B criam os próprios dados
  // ---------------------------------------------------------------------------

  const { data: kennelA, error: kennelAError } = await A.client
    .from("kennels")
    .insert({
      owner_id: A.id,
      created_by: A.id,
      name: "Canil A",
      slug: `rls-${RUN}-canil-a`,
      published_at: new Date().toISOString(),
    })
    .select()
    .single();
  record(
    "1. Criação",
    "A cria o próprio canil",
    "1 linha",
    kennelAError ? `erro: ${kennelAError.message}` : "1 linha",
    !kennelAError && !!kennelA,
  );
  if (!kennelA) throw new Error("fixture obrigatória falhou: canil de A");

  const { data: kennelB, error: kennelBError } = await B.client
    .from("kennels")
    .insert({
      owner_id: B.id,
      created_by: B.id,
      name: "Canil B",
      slug: `rls-${RUN}-canil-b`,
      published_at: new Date().toISOString(),
    })
    .select()
    .single();
  record(
    "1. Criação",
    "B cria o próprio canil",
    "1 linha",
    kennelBError ? `erro: ${kennelBError.message}` : "1 linha",
    !kennelBError && !!kennelB,
  );
  if (!kennelB) throw new Error("fixture obrigatória falhou: canil de B");

  // A: um cão publicado e um rascunho. A distinção é o coração do teste.
  const { data: dogAPub, error: dogAPubError } = await A.client
    .from("dogs")
    .insert({
      name: "Cão A Publicado",
      sex: "male",
      breed: "Teste",
      kennel_id: kennelA.id,
      owner_id: A.id,
      created_by: A.id,
      slug: `rls-${RUN}-pub`,
      published_at: new Date().toISOString(),
    })
    .select()
    .single();
  record(
    "1. Criação",
    "A cria cão PUBLICADO no próprio canil",
    "1 linha",
    dogAPubError ? `erro ${dogAPubError.code}: ${dogAPubError.message}` : "1 linha",
    !dogAPubError && !!dogAPub,
  );

  const { data: dogADraft, error: dogADraftError } = await A.client
    .from("dogs")
    .insert({
      name: "Cão A Rascunho",
      sex: "female",
      breed: "Teste",
      kennel_id: kennelA.id,
      owner_id: A.id,
      created_by: A.id,
      slug: `rls-${RUN}-rascunho`,
      published_at: null,
    })
    .select()
    .single();
  record(
    "1. Criação",
    "A cria cão RASCUNHO no próprio canil",
    "1 linha",
    dogADraftError ? `erro ${dogADraftError.code}: ${dogADraftError.message}` : "1 linha",
    !dogADraftError && !!dogADraft,
  );

  if (!dogAPub || !dogADraft) throw new Error("fixture obrigatória falhou: cães de A");

  const { data: dogB } = await B.client
    .from("dogs")
    .insert({
      name: "Cão B",
      sex: "male",
      breed: "Teste",
      kennel_id: kennelB.id,
      owner_id: B.id,
      created_by: B.id,
      slug: `rls-${RUN}-b`,
      published_at: new Date().toISOString(),
    })
    .select()
    .single();
  record("1. Criação", "B cria o próprio cão", "1 linha", dogB ? "1 linha" : "falhou", !!dogB);

  // Dado sensível de A: microchip.
  const { error: identError } = await A.client.from("dog_identifiers").insert({
    dog_id: dogAPub.id,
    kind: "microchip",
    value: `RLS-${RUN}-CHIP`,
    created_by: A.id,
  });
  record(
    "1. Criação",
    "A registra microchip do próprio cão",
    "sucesso",
    identError ? `erro: ${identError.message}` : "sucesso",
    !identError,
  );

  // ---------------------------------------------------------------------------
  // Cenário 2 — o que B enxerga de A
  //
  // ATENÇÃO, e isto é decisão de produto, não falha: canil e cão PUBLICADOS de A
  // são legíveis por qualquer pessoa, inclusive B. O produto é um diretório
  // público de canis. O isolamento que a RLS garante é sobre RASCUNHO e DADO
  // SENSÍVEL — é isso que os checks abaixo medem.
  // ---------------------------------------------------------------------------

  const draft = await B.client.from("dogs").select("id").eq("id", dogADraft.id);
  record(
    "2. Leitura de B sobre A",
    "B lê o cão RASCUNHO de A",
    "0 linhas",
    describe(draft.error, draft.data ?? []),
    !draft.error && (draft.data?.length ?? -1) === 0,
  );

  const idents = await B.client.from("dog_identifiers").select("id").eq("dog_id", dogAPub.id);
  record(
    "2. Leitura de B sobre A",
    "B lê o microchip do cão de A (dado sensível)",
    "0 linhas",
    describe(idents.error, idents.data ?? []),
    !idents.error && (idents.data?.length ?? -1) === 0,
  );

  const allDrafts = await B.client.from("dogs").select("id,name").is("published_at", null);
  const leaked = (allDrafts.data ?? []).filter((d: { id: string }) => d.id === dogADraft.id);
  record(
    "2. Leitura de B sobre A",
    "B varre TODOS os rascunhos da base procurando os de A",
    "nenhum rascunho de A",
    `${leaked.length} rascunho(s) de A em ${allDrafts.data?.length ?? 0} visíveis`,
    leaked.length === 0,
  );

  const pub = await B.client.from("dogs").select("id").eq("id", dogAPub.id);
  record(
    "2. Leitura de B sobre A",
    "B lê o cão PUBLICADO de A (comportamento esperado: diretório é público)",
    "1 linha",
    describe(pub.error, pub.data ?? []),
    !pub.error && (pub.data?.length ?? 0) === 1,
  );

  // ---------------------------------------------------------------------------
  // Cenário 3 — B tentando escrever em registro de A
  // ---------------------------------------------------------------------------

  const updKennel = await B.client
    .from("kennels")
    .update({ name: "INVADIDO POR B" })
    .eq("id", kennelA.id)
    .select();
  record(
    "3. Escrita de B sobre A",
    "B faz UPDATE no canil de A",
    "0 linhas afetadas",
    describe(updKennel.error, updKennel.data ?? []),
    !updKennel.error && (updKennel.data?.length ?? -1) === 0,
  );

  const updDog = await B.client
    .from("dogs")
    .update({ name: "INVADIDO POR B" })
    .eq("id", dogAPub.id)
    .select();
  record(
    "3. Escrita de B sobre A",
    "B faz UPDATE no cão publicado de A",
    "0 linhas afetadas",
    describe(updDog.error, updDog.data ?? []),
    !updDog.error && (updDog.data?.length ?? -1) === 0,
  );

  const steal = await B.client
    .from("dogs")
    .update({ kennel_id: kennelB.id })
    .eq("id", dogAPub.id)
    .select();
  record(
    "3. Escrita de B sobre A",
    "B move o cão de A para o próprio canil",
    "0 linhas afetadas",
    describe(steal.error, steal.data ?? []),
    !steal.error && (steal.data?.length ?? -1) === 0,
  );

  const delDog = await B.client.from("dogs").delete().eq("id", dogAPub.id).select();
  record(
    "3. Escrita de B sobre A",
    "B faz DELETE no cão de A",
    "erro de permissão (exclusão é lógica)",
    describe(delDog.error, delDog.data ?? []),
    !!delDog.error,
  );

  const delOwn = await B.client
    .from("dogs")
    .delete()
    .eq("id", dogB?.id ?? "")
    .select();
  record(
    "3. Escrita de B sobre A",
    "B faz DELETE no PRÓPRIO cão (DELETE físico é negado a todos)",
    "erro de permissão",
    describe(delOwn.error, delOwn.data ?? []),
    !!delOwn.error,
  );

  // ---------------------------------------------------------------------------
  // Cenário 4 — visitante anônimo
  // ---------------------------------------------------------------------------

  const anonPub = await anon.from("dogs").select("id").eq("id", dogAPub.id);
  record(
    "4. Anônimo",
    "anônimo lê cão publicado",
    "1 linha",
    describe(anonPub.error, anonPub.data ?? []),
    !anonPub.error && (anonPub.data?.length ?? 0) === 1,
  );

  const anonDraft = await anon.from("dogs").select("id").eq("id", dogADraft.id);
  record(
    "4. Anônimo",
    "anônimo lê cão em rascunho",
    "0 linhas",
    describe(anonDraft.error, anonDraft.data ?? []),
    !anonDraft.error && (anonDraft.data?.length ?? -1) === 0,
  );

  const anonIdent = await anon.from("dog_identifiers").select("id");
  record(
    "4. Anônimo",
    "anônimo lê dog_identifiers (microchip)",
    "0 linhas ou erro de permissão",
    describe(anonIdent.error, anonIdent.data ?? []),
    !!anonIdent.error || (anonIdent.data?.length ?? -1) === 0,
  );

  const anonWrite = await anon
    .from("dogs")
    .insert({ name: "Cão Anônimo", sex: "male", created_by: null })
    .select();
  record(
    "4. Anônimo",
    "anônimo tenta INSERT em dogs",
    "erro de permissão",
    describe(anonWrite.error, anonWrite.data ?? []),
    !!anonWrite.error,
  );

  // ---------------------------------------------------------------------------
  // Cenário 5 — Storage
  // ---------------------------------------------------------------------------

  const ownUpload = await B.client.storage
    .from(BUCKET)
    .upload(`${B.id}/proprio-${RUN}.png`, PNG, { contentType: "image/png" });
  record(
    "5. Storage",
    "B grava no PRÓPRIO prefixo (controle: precisa funcionar)",
    "sucesso",
    ownUpload.error ? `erro: ${ownUpload.error.message}` : "sucesso",
    !ownUpload.error,
  );

  const crossUpload = await B.client.storage
    .from(BUCKET)
    .upload(`${A.id}/invasao-${RUN}.png`, PNG, { contentType: "image/png" });
  record(
    "5. Storage",
    "B grava no prefixo de A",
    "erro de permissão",
    crossUpload.error ? `erro: ${crossUpload.error.message}` : "SUCESSO — PREFIXO INVADIDO",
    !!crossUpload.error,
  );

  await A.client.storage.from(BUCKET).upload(`${A.id}/de-a-${RUN}.png`, PNG, {
    contentType: "image/png",
  });

  const crossList = await B.client.storage.from(BUCKET).list(A.id);
  record(
    "5. Storage",
    "B lista o prefixo de A",
    "vazio ou erro",
    crossList.error
      ? `erro: ${crossList.error.message}`
      : `${crossList.data?.length ?? 0} objeto(s)`,
    !!crossList.error || (crossList.data?.length ?? -1) === 0,
  );

  const crossDownload = await B.client.storage.from(BUCKET).download(`${A.id}/de-a-${RUN}.png`);
  record(
    "5. Storage",
    "B baixa arquivo de A",
    "erro de permissão",
    crossDownload.error ? `erro: ${crossDownload.error.message}` : "BAIXOU — ARQUIVO VAZADO",
    !!crossDownload.error,
  );

  const anonDownload = await anon.storage.from(BUCKET).download(`${A.id}/de-a-${RUN}.png`);
  record(
    "5. Storage",
    "anônimo baixa arquivo de A",
    "erro de permissão",
    anonDownload.error ? `erro: ${anonDownload.error.message}` : "BAIXOU — ARQUIVO VAZADO",
    !!anonDownload.error,
  );

  // ---------------------------------------------------------------------------
  // Cenário 6 — usuário comum contra superfície de admin
  // ---------------------------------------------------------------------------

  const promote = await B.client.from("profiles").update({ role: "admin" }).eq("id", B.id).select();
  record(
    "6. Admin",
    "usuário comum se promove a admin",
    "erro de permissão de coluna",
    describe(promote.error, promote.data ?? []),
    !!promote.error,
  );

  const promoteOther = await B.client
    .from("profiles")
    .update({ full_name: "INVADIDO" })
    .eq("id", A.id)
    .select();
  record(
    "6. Admin",
    "usuário comum edita o perfil de outro",
    "0 linhas afetadas",
    describe(promoteOther.error, promoteOther.data ?? []),
    !!promoteOther.error || (promoteOther.data?.length ?? -1) === 0,
  );

  const rpcAdmin = await B.client.rpc("is_admin");
  record(
    "6. Admin",
    "usuário comum chama private.is_admin() via RPC",
    "erro — schema private não é exposto",
    rpcAdmin.error ? `erro: ${rpcAdmin.error.message}` : "RESPONDEU — SCHEMA PRIVADO EXPOSTO",
    !!rpcAdmin.error,
  );

  const rpcTrigger = await B.client.rpc("dogs_check_ancestry");
  record(
    "6. Admin",
    "usuário comum chama função de trigger via RPC",
    "erro — EXECUTE revogado",
    rpcTrigger.error ? `erro: ${rpcTrigger.error.message}` : "RESPONDEU — FUNÇÃO EXPOSTA",
    !!rpcTrigger.error,
  );

  // Confirma que o papel de B continua 'user' depois de todas as tentativas.
  const { data: roleCheck } = await admin.from("profiles").select("role").eq("id", B.id).single();
  record(
    "6. Admin",
    "papel de B no banco após as tentativas",
    "user",
    String(roleCheck?.role ?? "?"),
    roleCheck?.role === "user",
  );

  // ---------------------------------------------------------------------------
  // Cenário 7 — criação de conta e blindagem da role
  //
  // O trigger de profile roda no INSERT em auth.users, então cobre igualmente
  // o cadastro por e-mail e o retorno do OAuth: os dois criam a mesma linha.
  // Aqui simulamos os dois formatos de metadata que chegam na prática.
  // ---------------------------------------------------------------------------

  // Metadata hostil: o usuário pede para nascer admin.
  const hostileEmail = `rls-${RUN}-hostil@origemx.test`;
  const { data: hostile } = await admin.auth.admin.createUser({
    email: hostileEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "admin", full_name: "Tentativa Admin", is_admin: true },
  });

  if (hostile?.user) {
    const { data: hostileProfile } = await admin
      .from("profiles")
      .select("role, full_name")
      .eq("id", hostile.user.id)
      .single();
    record(
      "7. Criação de conta",
      "conta criada com user_metadata.role = 'admin'",
      "profile nasce com role = 'user'",
      `role = ${String(hostileProfile?.role)}`,
      hostileProfile?.role === "user",
    );
  } else {
    record("7. Criação de conta", "conta com metadata hostil", "criada", "não criou", false);
  }

  // Formato do Google: `name` e `picture`, sem `full_name` nem `avatar_url`.
  const oauthEmail = `rls-${RUN}-oauth@origemx.test`;
  const { data: oauthUser } = await admin.auth.admin.createUser({
    email: oauthEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      name: "Fulano do Google",
      picture: "https://example.test/foto.jpg",
      email_verified: true,
    },
  });

  if (oauthUser?.user) {
    const { data: oauthProfile } = await admin
      .from("profiles")
      .select("role, full_name, avatar_url")
      .eq("id", oauthUser.user.id)
      .single();
    record(
      "7. Criação de conta",
      "conta em formato OAuth (name/picture) gera profile preenchido",
      "full_name e avatar_url preenchidos",
      `full_name = ${String(oauthProfile?.full_name)}, avatar_url = ${
        oauthProfile?.avatar_url ? "preenchido" : "vazio"
      }`,
      oauthProfile?.full_name === "Fulano do Google" && Boolean(oauthProfile?.avatar_url),
    );
    record(
      "7. Criação de conta",
      "conta em formato OAuth nasce como usuário comum",
      "role = 'user'",
      `role = ${String(oauthProfile?.role)}`,
      oauthProfile?.role === "user",
    );
  }

  // ---------------------------------------------------------------------------
  // Cenário 8 — CRUD de canil: exclusão lógica e reserva de endereço
  // ---------------------------------------------------------------------------

  const softDeleted = await A.client
    .from("kennels")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", kennelA.id)
    .select("id");
  record(
    "8. CRUD de canil",
    "A exclui o próprio canil (lógico)",
    "1 linha marcada",
    describe(softDeleted.error, softDeleted.data ?? []),
    !softDeleted.error && (softDeleted.data?.length ?? 0) === 1,
  );

  const { data: stillThere } = await admin
    .from("kennels")
    .select("id, deleted_at")
    .eq("id", kennelA.id)
    .maybeSingle();
  record(
    "8. CRUD de canil",
    "linha continua na tabela — exclusão é lógica, nunca física",
    "linha existe com deleted_at preenchido",
    stillThere ? `existe, deleted_at ${stillThere.deleted_at ? "preenchido" : "nulo"}` : "SUMIU",
    Boolean(stillThere?.deleted_at),
  );

  const anonDeleted = await anon.from("kennels").select("id").eq("id", kennelA.id);
  record(
    "8. CRUD de canil",
    "anônimo lê canil excluído logicamente",
    "0 linhas",
    describe(anonDeleted.error, anonDeleted.data ?? []),
    !anonDeleted.error && (anonDeleted.data?.length ?? -1) === 0,
  );

  // O endereço não volta ao mercado: um link já divulgado não pode passar a
  // resolver para outro canil.
  const reuse = await B.client
    .from("kennels")
    .insert({
      owner_id: B.id,
      created_by: B.id,
      name: "Tentando reusar slug",
      slug: `rls-${RUN}-canil-a`,
    })
    .select();
  record(
    "8. CRUD de canil",
    "B tenta reusar o endereço de um canil excluído de A",
    "erro — slug fica reservado para sempre",
    describe(reuse.error, reuse.data ?? []),
    !!reuse.error,
  );

  // ---------------------------------------------------------------------------
  // Cenário 9 — genealogia pela API: fantasma, ciclo e descendentes
  // ---------------------------------------------------------------------------

  // Ancestral fantasma criado pelo usuário comum: sem dono, sem canil.
  const { data: ghost, error: ghostError } = await A.client
    .from("dogs")
    .insert({
      name: `Fantasma ${RUN}`,
      sex: "male",
      created_by: A.id,
      kennel_id: null,
      owner_id: null,
    })
    .select("id")
    .single();
  record(
    "9. Genealogia",
    "A cadastra ancestral fantasma (sem dono e sem canil)",
    "criado",
    ghostError ? `erro ${ghostError.code}: ${ghostError.message}` : "criado",
    !ghostError && !!ghost,
  );

  if (ghost) {
    const anonGhost = await anon.from("dogs").select("id").eq("id", ghost.id);
    record(
      "9. Genealogia",
      "anônimo lê o fantasma — é nó de árvore, não precisa estar publicado",
      "1 linha",
      describe(anonGhost.error, anonGhost.data ?? []),
      !anonGhost.error && (anonGhost.data?.length ?? 0) === 1,
    );

    // Filho do fantasma, para ter uma árvore de verdade.
    const { data: child } = await A.client
      .from("dogs")
      .insert({
        name: `Filho ${RUN}`,
        sex: "male",
        kennel_id: kennelB ? null : null,
        owner_id: A.id,
        created_by: A.id,
        sire_id: ghost.id,
      })
      .select("id")
      .single();

    if (child) {
      // A função de descendentes precisa enxergar o filho.
      const { data: descendants } = await A.client.rpc("dog_descendant_ids", {
        p_dog_id: ghost.id,
      });
      const ids = (descendants as string[] | null) ?? [];
      record(
        "9. Genealogia",
        "dog_descendant_ids devolve o descendente",
        "inclui o filho",
        ids.includes(child.id) ? "inclui" : `não inclui (${ids.length} ids)`,
        ids.includes(child.id),
      );

      // CICLO: tornar o fantasma filho do próprio filho.
      const cycle = await A.client
        .from("dogs")
        .update({ sire_id: child.id })
        .eq("id", ghost.id)
        .select();
      const translated = translateDogError(cycle.error);
      record(
        "9. Genealogia",
        "ciclo pela API vira mensagem legível, não 500",
        "erro traduzido, sem jargão de banco",
        cycle.error ? `[${cycle.error.code}] -> "${translated.message}"` : "ACEITOU O CICLO",
        Boolean(cycle.error) &&
          /descendente/i.test(translated.message) &&
          !/23514|constraint|uuid/i.test(translated.message),
      );

      // Sexo errado na posição de mãe.
      const wrongSex = await A.client
        .from("dogs")
        .update({ dam_id: ghost.id })
        .eq("id", child.id)
        .select();
      const translatedSex = translateDogError(wrongSex.error);
      record(
        "9. Genealogia",
        "macho na posição de mãe vira mensagem no campo certo",
        "campo dam_id, texto sobre fêmea",
        wrongSex.error ? `${translatedSex.field}: "${translatedSex.message}"` : "ACEITOU",
        Boolean(wrongSex.error) && translatedSex.field === "dam_id",
      );

      await admin.from("dogs").delete().eq("id", child.id);
    }

    await admin.from("dogs").delete().eq("id", ghost.id);
  }

  // ---------------------------------------------------------------------------
  // Cenário 10 — mídia: metadata isolada por dono, limites impostos pelo banco
  // ---------------------------------------------------------------------------

  // Canil próprio para este cenário. O de A foi excluído logicamente no
  // cenário 8, e `owns_kennel` exige deleted_at nulo — reaproveitá-lo mediria
  // a exclusão, não a política de mídia.
  const { data: kennelMedia } = await A.client
    .from("kennels")
    .insert({
      owner_id: A.id,
      created_by: A.id,
      name: "Canil Mídia",
      slug: `rls-${RUN}-canil-midia`,
    })
    .select("id")
    .single();

  if (!kennelMedia) throw new Error("fixture obrigatória falhou: canil de mídia");

  const { data: mediaRow, error: mediaError } = await A.client
    .from("media")
    .insert({
      bucket_id: BUCKET,
      storage_path: `${A.id}/canis/${kennelMedia.id}/evidencia-${RUN}.webp`,
      kennel_id: kennelMedia.id,
      role: "kennel_logo",
      mime: "image/webp",
      size_bytes: 12345,
      width: 800,
      height: 800,
      owner_id: A.id,
      created_by: A.id,
    })
    .select("id")
    .single();
  record(
    "10. Mídia",
    "A registra metadata do próprio logo",
    "criado",
    mediaError ? `erro ${mediaError.code}: ${mediaError.message}` : "criado",
    !mediaError && !!mediaRow,
  );

  // B tentando gravar metadata no canil de A, forjando owner_id.
  const forged = await B.client
    .from("media")
    .insert({
      bucket_id: BUCKET,
      storage_path: `${A.id}/canis/${kennelMedia.id}/forjado-${RUN}.webp`,
      kennel_id: kennelMedia.id,
      role: "kennel_logo",
      mime: "image/webp",
      size_bytes: 100,
      owner_id: A.id,
      created_by: A.id,
    })
    .select();
  record(
    "10. Mídia",
    "B grava metadata no canil de A",
    "erro de permissão",
    describe(forged.error, forged.data ?? []),
    !!forged.error,
  );

  // Mime fora da lista de imagem — o CHECK do banco recusa.
  const badMime = await A.client
    .from("media")
    .insert({
      bucket_id: BUCKET,
      storage_path: `${A.id}/canis/${kennelMedia.id}/ruim-${RUN}.txt`,
      kennel_id: kennelMedia.id,
      role: "kennel_logo",
      mime: "text/plain",
      size_bytes: 100,
      owner_id: A.id,
      created_by: A.id,
    })
    .select();
  record(
    "10. Mídia",
    "mime fora da lista de imagem",
    "erro CHECK media_mime_valid",
    describe(badMime.error, badMime.data ?? []),
    !!badMime.error,
  );

  // Teto por arquivo é do BANCO, não só do client.
  const tooBig = await A.client
    .from("media")
    .insert({
      bucket_id: BUCKET,
      storage_path: `${A.id}/canis/${kennelMedia.id}/grande-${RUN}.webp`,
      kennel_id: kennelMedia.id,
      role: "kennel_logo",
      mime: "image/webp",
      size_bytes: 99_000_000,
      owner_id: A.id,
      created_by: A.id,
    })
    .select();
  record(
    "10. Mídia",
    "arquivo acima do teto do banco",
    "erro CHECK media_size_positive",
    describe(tooBig.error, tooBig.data ?? []),
    !!tooBig.error,
  );

  if (mediaRow) {
    const { data: used } = await A.client.rpc("media_used_bytes", { p_owner_id: A.id });
    record(
      "10. Mídia",
      "quota do usuário soma o que ele gravou",
      "pelo menos 12345 bytes",
      String(used),
      typeof used === "number" && used >= 12345,
    );

    await admin.from("media").delete().eq("id", mediaRow.id);
  }

  await admin.from("kennels").delete().eq("id", kennelMedia.id);

  // ---------------------------------------------------------------------------
  // Cenário 11 — selo Criador Fundador sob CONCORRÊNCIA REAL
  //
  // A bateria SQL roda tudo numa sessão só e não prova concorrência. Aqui os
  // cadastros saem em paralelo pela API, que é onde a corrida existe de fato:
  // N canis a um cão de serem elegíveis, e o cão de todos entrando ao mesmo
  // tempo.
  //
  // ATENÇÃO: este cenário CONSOME números reais do pool de 100, e não há como
  // devolvê-los daqui — `nextval` não é transacional, e supabase-js não executa
  // SQL arbitrário para dar `setval`. É consequência do mecanismo, não descuido.
  //
  // Em dev, rodar `npm run db:founder-reset` depois de uma bateria de execuções
  // devolve a sequence ao zero. Em produção este script não roda.
  // ---------------------------------------------------------------------------

  const CONCURRENT = 5;

  // Cria N canis completos exceto pelo cão.
  const founderKennels = await Promise.all(
    Array.from({ length: CONCURRENT }, async (_unused, i) => {
      const { data: k } = await A.client
        .from("kennels")
        .insert({
          owner_id: A.id,
          created_by: A.id,
          name: `Canil Fundador ${i}`,
          slug: `rls-${RUN}-fundador-${i}`,
          city: "Campinas",
          state: "SP",
        })
        .select("id")
        .single();

      if (k) {
        await A.client.from("media").insert({
          bucket_id: BUCKET,
          storage_path: `${A.id}/canis/${k.id}/logo-${RUN}-${i}.webp`,
          kennel_id: k.id,
          role: "kennel_logo",
          mime: "image/webp",
          size_bytes: 1000,
          owner_id: A.id,
          created_by: A.id,
        });
      }
      return k?.id ?? null;
    }),
  );

  const kennelIds = founderKennels.filter((id): id is string => Boolean(id));

  // Nenhum tem selo ainda: falta o cão.
  const { data: beforeDogs } = await admin
    .from("kennels")
    .select("id, founder_number")
    .in("id", kennelIds);
  record(
    "11. Selo Fundador",
    "canil sem cão não recebe selo",
    "todos sem número",
    `${(beforeDogs ?? []).filter((k) => k.founder_number !== null).length} com número`,
    (beforeDogs ?? []).every((k) => k.founder_number === null),
  );

  // AQUI é a corrida: N inserções simultâneas, cada uma disparando o trigger.
  await Promise.all(
    kennelIds.map((kennelId, i) =>
      A.client.from("dogs").insert({
        name: `Cão Fundador ${i}`,
        sex: "male",
        kennel_id: kennelId,
        owner_id: A.id,
        created_by: A.id,
      }),
    ),
  );

  const { data: afterDogs } = await admin
    .from("kennels")
    .select("id, founder_number")
    .in("id", kennelIds);

  const numbers = (afterDogs ?? [])
    .map((k) => k.founder_number)
    .filter((n): n is number => n !== null);
  const unique = new Set(numbers);

  record(
    "11. Selo Fundador",
    `${CONCURRENT} atribuições CONCORRENTES não geram número duplicado`,
    `${CONCURRENT} números distintos`,
    `${numbers.length} atribuídos, ${unique.size} distintos`,
    numbers.length === unique.size && numbers.length > 0,
  );

  record(
    "11. Selo Fundador",
    "nenhum número fora do intervalo 1..100",
    "todos entre 1 e 100",
    numbers.length > 0 ? `min ${Math.min(...numbers)}, max ${Math.max(...numbers)}` : "nenhum",
    numbers.every((n) => n >= 1 && n <= 100),
  );

  // Usuário tentando escolher o próprio número pela API.
  const grabbed = await A.client
    .from("kennels")
    .update({ founder_number: 99 })
    .eq("id", kennelIds[0]!)
    .select();
  record(
    "11. Selo Fundador",
    "usuário grava founder_number pela API",
    "erro de permissão de coluna",
    describe(grabbed.error, grabbed.data ?? []),
    !!grabbed.error,
  );

  // E no canil de outra pessoa.
  const grabbedOther = await B.client
    .from("kennels")
    .update({ founder_number: 50 })
    .eq("id", kennelIds[0]!)
    .select();
  record(
    "11. Selo Fundador",
    "usuário grava founder_number no canil de outro",
    "erro de permissão",
    describe(grabbedOther.error, grabbedOther.data ?? []),
    !!grabbedOther.error,
  );

  // Exclusão lógica não devolve o número.
  const deletedKennel = kennelIds[0]!;
  await A.client
    .from("kennels")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", deletedKennel);

  const { data: afterDelete } = await admin
    .from("kennels")
    .select("founder_number")
    .eq("id", deletedKennel)
    .maybeSingle();
  record(
    "11. Selo Fundador",
    "exclusão lógica não devolve o número ao pool",
    "número permanece",
    afterDelete?.founder_number != null ? `nº ${afterDelete.founder_number}` : "PERDEU",
    afterDelete?.founder_number != null,
  );

  // ---------------------------------------------------------------------------
  // Cenário 12 — bucket público: URL sem expiração e isolamento de escrita
  // ---------------------------------------------------------------------------

  const PUBLIC_BUCKET = "kennel-media-public";
  const publicPath = `${A.id}/canis/publico-${RUN}.png`;

  const pubUpload = await A.client.storage
    .from(PUBLIC_BUCKET)
    .upload(publicPath, PNG, { contentType: "image/png" });
  record(
    "12. Bucket público",
    "A grava no próprio prefixo do bucket público",
    "sucesso",
    pubUpload.error ? `erro: ${pubUpload.error.message}` : "sucesso",
    !pubUpload.error,
  );

  const crossPublic = await B.client.storage
    .from(PUBLIC_BUCKET)
    .upload(`${A.id}/canis/invasao-${RUN}.png`, PNG, { contentType: "image/png" });
  record(
    "12. Bucket público",
    "B grava no prefixo de A no bucket público",
    "erro de permissão",
    crossPublic.error ? `erro: ${crossPublic.error.message}` : "SUCESSO — PREFIXO INVADIDO",
    !!crossPublic.error,
  );

  const anonWritePublic = await anon.storage
    .from(PUBLIC_BUCKET)
    .upload(`${A.id}/canis/anon-${RUN}.png`, PNG, { contentType: "image/png" });
  record(
    "12. Bucket público",
    "anônimo grava no bucket público",
    "erro de permissão",
    anonWritePublic.error ? `erro: ${anonWritePublic.error.message}` : "SUCESSO — ESCRITA ABERTA",
    !!anonWritePublic.error,
  );

  // A URL pública tem de ser estável: sem token, sem expiração. É o que torna
  // cache e QR impresso viáveis.
  const { data: publicUrlData } = anon.storage.from(PUBLIC_BUCKET).getPublicUrl(publicPath);
  const publicUrl = publicUrlData?.publicUrl ?? "";
  record(
    "12. Bucket público",
    "URL pública não carrega token nem expiração",
    "sem ?token= e sem expires",
    publicUrl ? publicUrl.replace(/^https?:\/\/[^/]+/, "") : "sem URL",
    Boolean(publicUrl) && !/token=|expires|X-Amz/i.test(publicUrl),
  );

  // E precisa abrir sem sessão nenhuma, direto pelo CDN.
  if (publicUrl) {
    try {
      const resp = await fetch(publicUrl);
      record(
        "12. Bucket público",
        "anônimo BAIXA o objeto pela URL pública, sem sessão",
        "HTTP 200",
        `HTTP ${resp.status}`,
        resp.ok,
      );
    } catch (err) {
      record(
        "12. Bucket público",
        "anônimo BAIXA o objeto pela URL pública, sem sessão",
        "HTTP 200",
        `falhou: ${err instanceof Error ? err.message : String(err)}`,
        false,
      );
    }
  }

  // Move de volta ao privado: é o passo de despublicar. Depois dele a URL
  // pública tem de morrer.
  const moveBack = await A.client.storage
    .from(PUBLIC_BUCKET)
    .move(publicPath, publicPath, { destinationBucket: BUCKET });
  record(
    "12. Bucket público",
    "A move o objeto de volta ao bucket privado (despublicar)",
    "sucesso",
    moveBack.error ? `erro: ${moveBack.error.message}` : "sucesso",
    !moveBack.error,
  );

  if (!moveBack.error) {
    // A fonte da verdade é o STORAGE, não o CDN.
    //
    // Medir o CDN aqui daria falso negativo: ele serve a cópia em cache até o
    // TTL vencer, e é por isso que o upload usa Cache-Control de 1 hora em vez
    // de "imutável". Despublicar remove o objeto na hora; a cópia no edge
    // expira dentro da janela. É propriedade de CDN, não bug — e está
    // documentado em supabase/README.md.
    const folder = publicPath.slice(0, publicPath.lastIndexOf("/"));
    const name = publicPath.slice(publicPath.lastIndexOf("/") + 1);
    const { data: listed } = await A.client.storage
      .from(PUBLIC_BUCKET)
      .list(folder, { search: name, limit: 100 });
    const aindaLa = (listed ?? []).some((f) => f.name === name);

    record(
      "12. Bucket público",
      "objeto sai do bucket público ao despublicar (fonte: Storage)",
      "não está mais lá",
      aindaLa ? "AINDA ESTÁ NO BUCKET PÚBLICO" : "removido",
      !aindaLa,
    );
    await admin.storage.from(BUCKET).remove([publicPath]);
  }

  // ---------------------------------------------------------------------------
  // Limpeza
  // ---------------------------------------------------------------------------

  await admin.storage
    .from(BUCKET)
    .remove([`${A.id}/de-a-${RUN}.png`, `${B.id}/proprio-${RUN}.png`]);
  // Metadata de mídia criada pelos cenários. Sem isto, cada execução deixa
  // linhas órfãs — a linha existe e o arquivo nunca foi enviado — e o
  // `media:reconcile` passa a relatar resíduo de teste como problema.
  await admin.from("media").delete().like("storage_path", `%${RUN}%`);
  await admin.from("dog_identifiers").delete().like("value", `RLS-${RUN}-%`);
  await admin.from("dogs").delete().like("slug", `rls-${RUN}-%`);
  await admin.from("kennels").delete().like("slug", `rls-${RUN}-%`);
  await admin.auth.admin.deleteUser(A.id);
  await admin.auth.admin.deleteUser(B.id);
  if (hostile?.user) await admin.auth.admin.deleteUser(hostile.user.id);
  if (oauthUser?.user) await admin.auth.admin.deleteUser(oauthUser.user.id);
}

// -----------------------------------------------------------------------------
// Saída
// -----------------------------------------------------------------------------

function writeReport(fatal?: string) {
  const failed = checks.filter((c) => c.status === "FAIL");
  const when = new Date().toISOString();

  const md = [
    `# OrigemX — Evidência de RLS`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Data | ${when} |`,
    `| Projeto | \`${URL}\` |`,
    `| Execução | \`${RUN}\` |`,
    `| Resultado | **${failed.length === 0 && !fatal ? "APROVADO" : "REPROVADO"}** — ${checks.length - failed.length}/${checks.length} PASS |`,
    ``,
    fatal ? `> **ERRO FATAL:** ${fatal}\n` : ``,
    `## Método`,
    ``,
    `Dois usuários reais (A e B) e um cliente anônimo, falando com a API REST do`,
    `Supabase pela chave publishable — a mesma porta que um atacante usaria. Nada`,
    `passa pela interface. A chave secreta é usada apenas para criar e destruir as`,
    `fixtures, nunca para provar acesso.`,
    ``,
    `## Escopo do isolamento`,
    ``,
    `O OrigemX é um **diretório público** de canis. Canil e cão marcados como`,
    `publicados são legíveis por qualquer pessoa — isso é o produto, não uma`,
    `falha. O que a RLS isola é:`,
    ``,
    `- registro em **rascunho** (\`published_at\` nulo) — só quem gerencia vê;`,
    `- **dado sensível** (\`dog_identifiers\`: microchip e registro) — nunca público;`,
    `- **escrita** — ninguém altera registro alheio;`,
    `- **arquivo no Storage** — cada usuário só acessa o próprio prefixo.`,
    ``,
    `## Resultado por cenário`,
    ``,
    `| Cenário | Verificação | Esperado | Obtido | |`,
    `|---|---|---|---|---|`,
    ...checks.map(
      (c) =>
        `| ${c.cenario} | ${c.verificacao} | ${c.esperado} | ${c.obtido.replace(/\|/g, "\\|")} | **${c.status}** |`,
    ),
    ``,
  ].join("\n");

  const out = join(process.cwd(), "reports", "rls-report.md");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md, "utf8");
  writeFileSync(
    join(process.cwd(), "reports", "rls-report.json"),
    JSON.stringify({ when, project: URL, run: RUN, fatal: fatal ?? null, checks }, null, 2),
    "utf8",
  );

  for (const c of checks) {
    console.log(`${c.status === "PASS" ? "  PASS" : "  FAIL"}  ${c.cenario} — ${c.verificacao}`);
    if (c.status === "FAIL")
      console.log(`        esperado: ${c.esperado}\n        obtido:   ${c.obtido}`);
  }
  console.log(
    `\n${checks.length - failed.length}/${checks.length} PASS · relatório em reports/rls-report.md\n`,
  );

  return failed.length === 0 && !fatal;
}

main()
  .then(() => process.exit(writeReport() ? 0 : 1))
  .catch((err: unknown) => {
    process.exit(writeReport(err instanceof Error ? err.message : String(err)) ? 0 : 1);
  });
