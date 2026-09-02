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

type Status = "PASS" | "FAIL" | "PULADO";

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

/**
 * Registra o que NÃO foi verificado, e por quê.
 *
 * Cenário pulado entra no relatório como linha própria em vez de sumir. Um
 * documento de homologação que omite em silêncio o que deixou de testar é pior
 * que um que reprova: quem lê conclui cobertura que não houve.
 *
 * `PULADO` não conta como falha — mas aparece no cabeçalho, para ninguém
 * assinar "APROVADO" achando que a bateria foi inteira.
 */
function skip(cenario: string, verificacao: string, motivo: string) {
  checks.push({
    cenario,
    verificacao,
    esperado: "—",
    obtido: motivo,
    status: "PULADO",
  });
}

/**
 * Pula o que CONSOME os selos de Fundador.
 *
 * O pool é de 100, `nextval` não volta atrás, e devolver os números exige
 * `setval` com a trigger de congelamento desabilitada — operação delicada
 * demais para um banco de produção. Contra produção, ligar esta flag.
 *
 * O que se perde é a prova de concorrência do `nextval`, que é comportamento do
 * Postgres e idêntico em qualquer instância — já provado no projeto de dev. O
 * que NÃO se perde: as checagens de autorização do próprio cenário 11 continuam
 * rodando, com um canil sem selo, porque provar que ninguém grava
 * `founder_number` pela API é justamente o tipo de coisa que precisa valer no
 * banco real.
 */
const PULAR_SELO = process.env.RLS_PULAR_SELO_FUNDADOR === "1";

/**
 * O piso da EMISSÃO nova.
 *
 * Não existe mais teto: `20260806234150_founder_number_sem_teto.sql` removeu o
 * `maxvalue` e a borda superior do CHECK, a pedido do produto. Então a asserção
 * deixou de ser "está dentro da janela" e passou a ser a exigência de verdade —
 * **número emitido nunca abaixo de 100**.
 *
 * É a asserção mais forte, e não a mais fraca: um teto de 2147483647 tornaria a
 * verificação vazia, enquanto o piso pega o defeito que realmente pode acontecer
 * — a sequence voltar ao começo por um `setval` errado e emitir 2, 3, 4.
 *
 * O canil nº 1 é anterior à mudança de janela e não passa por esta regra: ela
 * vale para o que é emitido de agora em diante.
 */
const EMISSAO_MIN = 100;

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

  // Um canil VIVO por dono (`kennels_owner_uk`), então cada canil que o roteiro
  // precisa manter simultaneamente exige um ator próprio. Não é inflação de
  // fixture: é o roteiro passando a refletir a invariante.
  //
  //   A — cenários 1-3, 8, 9, 10 (canis serializados por exclusão)
  //   B — o "outro": escrita cruzada, storage, admin
  //   C — SEM canil, dedicado ao reuso de slug do cenário 8
  //   S — dono do canil do selo (11a)
  //   U — cenário 13, um canil por dono
  const A = await createActor("a");
  const B = await createActor("b");
  const C = await createActor("c");
  const S = await createActor("s");
  const U = await createActor("u");

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

  // Espelha o payload REAL de updateKennel: TODOS os KENNEL_FORM_FIELDS de uma
  // vez, não um subconjunto. É o único jeito de pegar um GRANT de coluna
  // faltando — um update estreito, como os demais deste arquivo, não teria
  // acusado o bug real (instagram_handle/registration_number sem GRANT, que
  // derrubava TODA gravação de perfil em produção, não só a desses campos).
  const fullUpdate = await A.client
    .from("kennels")
    .update({
      name: "Canil A Atualizado",
      slug: `rls-${RUN}-canil-a`,
      description: "Descrição de teste",
      city: "Campinas",
      state: "SP",
      website_url: "https://example.test",
      instagram_handle: "canil.teste",
      registration_number: "REG-123",
    })
    .eq("id", kennelA.id)
    .select();
  record(
    "8. CRUD de canil",
    "A atualiza TODOS os campos editáveis de uma vez (payload real de updateKennel)",
    "1 linha — nenhuma coluna sem GRANT",
    describe(fullUpdate.error, fullUpdate.data ?? []),
    !fullUpdate.error && (fullUpdate.data?.length ?? 0) === 1,
  );

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
  //
  // Quem tenta é C, que NÃO tem canil, e a asserção cobra o NOME da constraint.
  // Se fosse B — que já tem o dele — a inserção violaria duas constraints
  // (`kennels_slug_key` e `kennels_owner_uk`), o Postgres reportaria a que
  // encontrasse primeiro, e um "houve erro" passaria pelo motivo errado.
  const reuse = await C.client
    .from("kennels")
    .insert({
      owner_id: C.id,
      created_by: C.id,
      name: "Tentando reusar slug",
      slug: `rls-${RUN}-canil-a`,
    })
    .select();
  record(
    "8. CRUD de canil",
    "C (sem canil) tenta reusar o endereço de um canil excluído de A",
    "erro em kennels_slug_key — slug fica reservado para sempre",
    describe(reuse.error, reuse.data ?? []),
    Boolean(reuse.error?.message.includes("kennels_slug_key")),
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
  //
  // E é justamente aquela exclusão que LIBERA A VAGA de `kennels_owner_uk`:
  // sem ela este INSERT falharia por dono, não por mídia. A dependência entre
  // os cenários 8 e 10 passou a ser real — está dita aqui para não ser
  // descoberta por quem reordenar o roteiro.
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
    // B tentando gravar LEGENDA na foto de A. `media_update` recusa pela
    // LINHA (owner_id = auth.uid()), e o PostgREST não devolve erro nesse
    // caso: devolve sucesso com ZERO linha afetada. É por isso que
    // `setMediaCaption` (src/modules/media/actions.ts) confere `data` depois
    // do UPDATE em vez de só o `.error` — a mesma classe de falha silenciosa
    // que o log de `deleteMedia` já existe para não deixar passar batido.
    const alheia = await B.client
      .from("media")
      .update({ caption: "legenda forjada" })
      .eq("id", mediaRow.id)
      .select("id");
    record(
      "10. Mídia",
      "B escreve legenda na mídia de A",
      "0 linhas afetadas",
      describe(alheia.error, alheia.data ?? []),
      !alheia.error && (alheia.data ?? []).length === 0,
    );

    // Não basta "0 linhas devolvidas" — tem de ser 0 linhas GRAVADAS.
    const { data: aposTentativa } = await admin
      .from("media")
      .select("caption")
      .eq("id", mediaRow.id)
      .single();
    record(
      "10. Mídia",
      "legenda de A permanece intacta após a tentativa de B",
      "null",
      aposTentativa?.caption ?? "null",
      aposTentativa?.caption === null,
    );

    // A gravando a própria legenda — a mesma porta, agora com o dono certo.
    const propria = await A.client
      .from("media")
      .update({ caption: "Campeão Brasileiro 2024" })
      .eq("id", mediaRow.id)
      .select("id, caption");
    record(
      "10. Mídia",
      "A escreve legenda na própria mídia",
      "1 linha, legenda gravada",
      describe(propria.error, propria.data ?? []),
      !propria.error &&
        propria.data?.length === 1 &&
        propria.data[0].caption === "Campeão Brasileiro 2024",
    );

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

  // Mídia de um ANCESTRAL FANTASMA — sem dono, sem canil. Quem o criou
  // (`created_by`) é quem pode gerenciá-lo, para sempre — é a suposição em
  // que a foto inline do fantasma (`ParentPicker`, tela de cadastro do cão)
  // se apoia inteira. Nenhuma policy nova para esta feature: só confirmar
  // que `can_manage_dog` já cobre este caso, pela porta real.
  const { data: photoGhost, error: photoGhostError } = await A.client
    .from("dogs")
    .insert({
      name: "Fantasma RLS",
      sex: "male",
      owner_id: null,
      kennel_id: null,
      created_by: A.id,
    })
    .select("id")
    .single();
  record(
    "10. Mídia",
    "A cria um ancestral fantasma (sem dono, sem canil)",
    "criado",
    photoGhostError ? `erro ${photoGhostError.code}: ${photoGhostError.message}` : "criado",
    !photoGhostError && !!photoGhost,
  );

  if (photoGhost) {
    const propriaFoto = await A.client
      .from("media")
      .insert({
        bucket_id: BUCKET,
        storage_path: `${A.id}/caes/${photoGhost.id}/foto-${RUN}.webp`,
        dog_id: photoGhost.id,
        role: "dog_gallery",
        mime: "image/webp",
        size_bytes: 5000,
        owner_id: A.id,
        created_by: A.id,
      })
      .select("id");
    record(
      "10. Mídia",
      "A (criador do fantasma) grava foto nele",
      "criado",
      describe(propriaFoto.error, propriaFoto.data ?? []),
      !propriaFoto.error && (propriaFoto.data ?? []).length === 1,
    );

    // B é honesto sobre a própria identidade (owner_id/created_by = B) — o
    // que está sob teste é `can_manage_dog`, não a checagem de forjar dono
    // alheio, que já é coberta noutro caso.
    const alheiaFoto = await B.client
      .from("media")
      .insert({
        bucket_id: BUCKET,
        storage_path: `${B.id}/caes/${photoGhost.id}/forjada-${RUN}.webp`,
        dog_id: photoGhost.id,
        role: "dog_gallery",
        mime: "image/webp",
        size_bytes: 100,
        owner_id: B.id,
        created_by: B.id,
      })
      .select("id");
    record(
      "10. Mídia",
      "B (não é quem criou o fantasma) tenta gravar foto nele",
      "erro de permissão",
      describe(alheiaFoto.error, alheiaFoto.data ?? []),
      !!alheiaFoto.error,
    );

    await admin.from("media").delete().eq("dog_id", photoGhost.id);
    await admin.from("dogs").delete().eq("id", photoGhost.id);
  }

  // ---------------------------------------------------------------------------
  // Cenário 11 — selo Criador Fundador
  //
  // Dividido em dois por natureza, e não por gosto:
  //
  //   11a. AUTORIZAÇÃO — ninguém grava `founder_number` pela API, nem no próprio
  //        canil nem no de outro. É RLS e GRANT de coluna, não custa selo
  //        nenhum, e roda SEMPRE. É o que precisa valer no banco real.
  //
  //   11b. CONCORRÊNCIA — N cadastros em paralelo, cada um disparando o trigger,
  //        para provar que `nextval` não gera número duplicado sob corrida. A
  //        bateria SQL roda tudo numa sessão só e não provaria isso.
  //
  // 11b CONSOME números reais do pool de 100, e não há como devolvê-los daqui:
  // `nextval` não é transacional, e supabase-js não executa SQL arbitrário para
  // dar `setval`. É consequência do mecanismo, não descuido. Em dev,
  // `npm run db:founder-reset` devolve a sequence ao zero.
  //
  // Contra PRODUÇÃO, `RLS_PULAR_SELO_FUNDADOR=1` pula 11b e mantém 11a. O que
  // deixa de ser provado ali é atomicidade de sequence do Postgres — idêntica em
  // qualquer instância e já verificada em dev —, e o relatório declara a lacuna
  // em vez de omiti-la.
  // ---------------------------------------------------------------------------

  const CONCURRENT = 5;

  // Declarado aqui fora porque a LIMPEZA precisa deles. Fica vazio quando 11b é
  // pulado, e limpar lista vazia é no-op.
  let founders: Actor[] = [];

  // Kennel ids dos founders, expostos para o cenário 17 reaproveitar números
  // JÁ emitidos por 11b em vez de inventar novos — mesmo raciocínio: gastar
  // do pool de verdade só quando o próprio mecanismo pede.
  let founderKennelIds: string[] = [];

  // Canil sem cão e, portanto, SEM selo — o suficiente para 11a. Fica fora do
  // `if` de propósito: é o que permite provar a proteção de escrita mesmo
  // quando a parte que consome o pool não roda.
  //
  // Dono é S, não A. Com `kennels_owner_uk` este canil só caberia em A porque os
  // cenários 8 e 10 esvaziaram a vaga dele — dependência invisível que quebraria
  // na primeira reordenação do roteiro. Um ator próprio torna o cenário
  // independente, e 11a continua provando o que precisa: GRANT de coluna e
  // policy, com S tentando gravar no próprio canil e B no alheio.
  const { data: kennelSelo } = await S.client
    .from("kennels")
    .insert({
      owner_id: S.id,
      created_by: S.id,
      name: "Canil Selo",
      slug: `rls-${RUN}-selo`,
      city: "Campinas",
      state: "SP",
    })
    .select("id")
    .single();

  // ── 11b. Concorrência — só fora de produção, porque gasta selo ──────────────
  if (PULAR_SELO) {
    const motivo = `pulado por RLS_PULAR_SELO_FUNDADOR=1 — consumiria ${CONCURRENT} dos 100 selos, sem como devolvê-los sem setval`;
    skip("11b. Selo Fundador (concorrência)", "canil sem cão não recebe selo", motivo);
    skip(
      "11b. Selo Fundador (concorrência)",
      `${CONCURRENT} atribuições CONCORRENTES não geram número duplicado`,
      motivo,
    );
    skip(
      "11b. Selo Fundador (concorrência)",
      `nenhum número emitido abaixo de ${EMISSAO_MIN}`,
      motivo,
    );
    skip(
      "11b. Selo Fundador (concorrência)",
      "exclusão lógica não devolve o número ao pool",
      motivo,
    );
  } else {
    // Um DONO por canil: `kennels_owner_uk` impede que um único usuário abra os
    // N canis desta corrida.
    //
    // A prova NÃO enfraqueceu — ficou mais forte. Continuam sendo CONCURRENT
    // chamadas simultâneas de `try_assign_founder_number` pelo trigger, e agora
    // a contenção de `nextval` acontece entre sessões de usuários DIFERENTES,
    // que é o modelo real de produção. Um usuário martelando a própria conta era
    // a aproximação, não o alvo.
    founders = await Promise.all(
      Array.from({ length: CONCURRENT }, (_unused, i) => createActor(`f${i}`)),
    );

    // Cria N canis completos exceto pelo cão.
    const founderKennels = await Promise.all(
      founders.map(async (F, i) => {
        const { data: k } = await F.client
          .from("kennels")
          .insert({
            owner_id: F.id,
            created_by: F.id,
            name: `Canil Fundador ${i}`,
            slug: `rls-${RUN}-fundador-${i}`,
            city: "Campinas",
            state: "SP",
          })
          .select("id")
          .single();

        if (k) {
          await F.client.from("media").insert({
            bucket_id: BUCKET,
            storage_path: `${F.id}/canis/${k.id}/logo-${RUN}-${i}.webp`,
            kennel_id: k.id,
            role: "kennel_logo",
            mime: "image/webp",
            size_bytes: 1000,
            owner_id: F.id,
            created_by: F.id,
          });
        }
        return k?.id ?? null;
      }),
    );

    // Par ator↔canil, e não duas listas: filtrar só os ids desalinharia os
    // índices se uma criação falhasse, e o cão iria para o canil de outro dono —
    // que a RLS recusaria, transformando falha de fixture em falha de teste.
    const founderPairs = founderKennels
      .map((id, i) => ({ actor: founders[i]!, kennelId: id }))
      .filter((p): p is { actor: Actor; kennelId: string } => Boolean(p.kennelId));

    const kennelIds = founderPairs.map((p) => p.kennelId);
    founderKennelIds = kennelIds;

    // Nenhum tem selo ainda: falta o cão.
    const { data: beforeDogs } = await admin
      .from("kennels")
      .select("id, founder_number")
      .in("id", kennelIds);
    record(
      "11b. Selo Fundador (concorrência)",
      "canil sem cão não recebe selo",
      "todos sem número",
      `${(beforeDogs ?? []).filter((k) => k.founder_number !== null).length} com número`,
      (beforeDogs ?? []).every((k) => k.founder_number === null),
    );

    // AQUI é a corrida: N inserções simultâneas, cada uma disparando o trigger,
    // agora vindas de N sessões de usuários distintos.
    await Promise.all(
      founderPairs.map(({ actor, kennelId }, i) =>
        actor.client.from("dogs").insert({
          name: `Cão Fundador ${i}`,
          sex: "male",
          kennel_id: kennelId,
          owner_id: actor.id,
          created_by: actor.id,
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
      "11b. Selo Fundador (concorrência)",
      `${CONCURRENT} atribuições CONCORRENTES não geram número duplicado`,
      `${CONCURRENT} números distintos`,
      `${numbers.length} atribuídos, ${unique.size} distintos`,
      numbers.length === unique.size && numbers.length > 0,
    );

    record(
      "11b. Selo Fundador (concorrência)",
      `nenhum número emitido abaixo de ${EMISSAO_MIN}`,
      `todos >= ${EMISSAO_MIN}`,
      numbers.length > 0 ? `min ${Math.min(...numbers)}, max ${Math.max(...numbers)}` : "nenhum",
      numbers.every((n) => n >= EMISSAO_MIN),
    );

    // Exclusão lógica não devolve o número. Precisa de um canil COM selo, então
    // só faz sentido aqui dentro. Quem exclui é o DONO dele.
    const primeiro = founderPairs[0]!;
    const deletedKennel = primeiro.kennelId;
    await primeiro.actor.client
      .from("kennels")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", deletedKennel);

    const { data: afterDelete } = await admin
      .from("kennels")
      .select("founder_number")
      .eq("id", deletedKennel)
      .maybeSingle();
    record(
      "11b. Selo Fundador (concorrência)",
      "exclusão lógica não devolve o número ao pool",
      "número permanece",
      afterDelete?.founder_number != null ? `nº ${afterDelete.founder_number}` : "PERDEU",
      afterDelete?.founder_number != null,
    );
  }

  // ── 11a. Autorização — roda SEMPRE, inclusive em produção ───────────────────
  //
  // Um canil sem selo prova a mesma coisa: o que se testa é o GRANT de coluna e
  // a policy, não o valor gravado. `founder_number` continuar nulo depois da
  // tentativa é parte do resultado esperado.
  const idSelo = kennelSelo?.id ?? "";

  // Usuário tentando escolher o próprio número pela API.
  const grabbed = await A.client
    .from("kennels")
    .update({ founder_number: 99 })
    .eq("id", idSelo)
    .select();
  record(
    "11a. Selo Fundador (autorização)",
    "usuário grava founder_number no PRÓPRIO canil",
    "erro de permissão de coluna",
    describe(grabbed.error, grabbed.data ?? []),
    !!grabbed.error,
  );

  // E no canil de outra pessoa.
  const grabbedOther = await B.client
    .from("kennels")
    .update({ founder_number: 50 })
    .eq("id", idSelo)
    .select();
  record(
    "11a. Selo Fundador (autorização)",
    "usuário grava founder_number no canil de OUTRO",
    "erro de permissão",
    describe(grabbedOther.error, grabbedOther.data ?? []),
    !!grabbedOther.error,
  );

  // A prova de que nenhuma das duas tentativas passou de fato — erro devolvido
  // pela API não basta se a linha tiver mudado assim mesmo.
  const { data: seloDepois } = await admin
    .from("kennels")
    .select("founder_number")
    .eq("id", idSelo)
    .maybeSingle();
  record(
    "11a. Selo Fundador (autorização)",
    "após as duas tentativas, o número no banco não mudou",
    "continua nulo",
    seloDepois?.founder_number == null ? "nulo" : `GRAVOU nº ${seloDepois.founder_number}`,
    seloDepois?.founder_number == null,
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
  // Cenário 13 — um canil por dono
  //
  // O mecanismo é o índice único PARCIAL `kennels_owner_uk`, e a assimetria com
  // o slug é o ponto: a VAGA volta quando a relação acaba, o ENDEREÇO nunca
  // volta. As duas metades precisam de prova, senão metade da regra vive só no
  // comentário da migration.
  // ---------------------------------------------------------------------------

  const { error: u1Error } = await U.client.from("kennels").insert({
    owner_id: U.id,
    created_by: U.id,
    name: "Canil de U",
    slug: `rls-${RUN}-u-1`,
  });
  record(
    "13. Um canil por dono",
    "U cria o primeiro canil",
    "sucesso",
    u1Error ? `erro: ${u1Error.message}` : "sucesso",
    !u1Error,
  );

  // Slug NOVO de propósito: com slug repetido, um erro qualquer passaria por
  // certo. Por isso a asserção cobra o nome da constraint, não só "houve erro".
  const u2 = await U.client
    .from("kennels")
    .insert({
      owner_id: U.id,
      created_by: U.id,
      name: "Segundo canil de U",
      slug: `rls-${RUN}-u-2`,
    })
    .select();
  record(
    "13. Um canil por dono",
    "U cria um SEGUNDO canil, com endereço novo",
    "erro em kennels_owner_uk",
    describe(u2.error, u2.data ?? []),
    Boolean(u2.error?.message.includes("kennels_owner_uk")),
  );

  const b2 = await B.client
    .from("kennels")
    .insert({
      owner_id: B.id,
      created_by: B.id,
      name: "Outro canil de B",
      slug: `rls-${RUN}-b-2`,
    })
    .select();
  record(
    "13. Um canil por dono",
    "B, que já tem canil, também é barrado — o limite é por dono, não global",
    "erro em kennels_owner_uk",
    describe(b2.error, b2.data ?? []),
    Boolean(b2.error?.message.includes("kennels_owner_uk")),
  );

  await U.client
    .from("kennels")
    .update({ deleted_at: new Date().toISOString() })
    .eq("slug", `rls-${RUN}-u-1`);

  const u3 = await U.client
    .from("kennels")
    .insert({
      owner_id: U.id,
      created_by: U.id,
      name: "Canil novo de U",
      slug: `rls-${RUN}-u-3`,
    })
    .select();
  record(
    "13. Um canil por dono",
    "depois de excluir logicamente, U cadastra outro canil",
    "sucesso — a exclusão libera a vaga",
    describe(u3.error, u3.data ?? []),
    !u3.error && (u3.data?.length ?? 0) === 1,
  );

  const u4 = await C.client
    .from("kennels")
    .insert({
      owner_id: C.id,
      created_by: C.id,
      name: "Tentando o endereço de U",
      slug: `rls-${RUN}-u-1`,
    })
    .select();
  record(
    "13. Um canil por dono",
    "o endereço do canil excluído de U continua reservado",
    "erro em kennels_slug_key — a vaga volta, o endereço não",
    describe(u4.error, u4.data ?? []),
    Boolean(u4.error?.message.includes("kennels_slug_key")),
  );

  // ESTA é a que prova que o mecanismo é o índice e não uma policy de INSERT:
  // `deleted_at` é coluna com GRANT de UPDATE, então "desexcluir" é um caminho
  // que nenhum WITH CHECK de inserção enxergaria.
  const u5 = await U.client
    .from("kennels")
    .update({ deleted_at: null })
    .eq("slug", `rls-${RUN}-u-1`)
    .select();
  record(
    "13. Um canil por dono",
    "U tenta REVERTER a exclusão tendo outro canil vivo",
    "erro em kennels_owner_uk — o índice cobre o UPDATE, não só o INSERT",
    describe(u5.error, u5.data ?? []),
    Boolean(u5.error?.message.includes("kennels_owner_uk")),
  );

  // ---------------------------------------------------------------------------
  // Cenário 14 — superfície admin_* pela API, com sessão de usuário comum
  //
  // `supabase/tests/battery.sql` já prova que estas quatro RPCs recusam
  // usuário comum, mas roda como POSTGRES na mesma sessão SQL — nunca prova o
  // caminho que um ataque real usaria: a API REST, chave publishable, sessão
  // de B. É exatamente "manipular a request diretamente", a mesma porta que
  // as Server Actions futuras do painel admin vão reabrir se esquecerem de
  // chamar requireAdmin() — a RLS é a rede que pega mesmo assim.
  //
  // O admin de fixture é promovido pela chave secreta (bypassa RLS por
  // desenho, não é um bug sendo explorado) — mesmo mecanismo que
  // `battery.sql` já usa "como superusuário" na camada SQL. É a primeira vez
  // que este arquivo faz essa promoção, então o erro é checado como em toda
  // outra operação daqui, não presumido como sucesso silencioso.
  // ---------------------------------------------------------------------------

  const ADMIN = await createActor("admin");
  const { error: promoteAdminError } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", ADMIN.id);
  if (promoteAdminError) {
    throw new Error(`fixture obrigatória falhou: promover admin de teste: ${promoteAdminError.message}`);
  }

  const rpcSuspend = await B.client.rpc("admin_set_profile_suspended", {
    p_profile_id: B.id,
    p_suspended: true,
    p_reason: "tentativa de usuário comum via RPC",
  });
  record(
    "14. Superfície admin_*",
    "usuário comum chama admin_set_profile_suspended",
    "erro — insufficient_privilege",
    rpcSuspend.error ? `erro: ${rpcSuspend.error.message}` : "EXECUTOU — SUSPENSÃO SEM ADMIN",
    !!rpcSuspend.error,
  );

  const rpcFounder = await B.client.rpc("admin_set_founder_number", {
    p_kennel_id: kennelB.id,
    p_number: 999999,
    p_reason: "tentativa de usuário comum via RPC",
  });
  record(
    "14. Superfície admin_*",
    "usuário comum chama admin_set_founder_number",
    "erro — insufficient_privilege",
    rpcFounder.error ? `erro: ${rpcFounder.error.message}` : "EXECUTOU — NÚMERO GRAVADO SEM ADMIN",
    !!rpcFounder.error,
  );

  const rpcHideKennel = await B.client.rpc("admin_set_kennel_hidden", {
    p_kennel_id: kennelB.id,
    p_hidden: true,
    p_reason: "tentativa de usuário comum via RPC",
  });
  record(
    "14. Superfície admin_*",
    "usuário comum chama admin_set_kennel_hidden",
    "erro — insufficient_privilege",
    rpcHideKennel.error ? `erro: ${rpcHideKennel.error.message}` : "EXECUTOU — CANIL OCULTADO SEM ADMIN",
    !!rpcHideKennel.error,
  );

  const rpcHideDog = await B.client.rpc("admin_set_dog_hidden", {
    p_dog_id: dogB!.id,
    p_hidden: true,
    p_reason: "tentativa de usuário comum via RPC",
  });
  record(
    "14. Superfície admin_*",
    "usuário comum chama admin_set_dog_hidden",
    "erro — insufficient_privilege",
    rpcHideDog.error ? `erro: ${rpcHideDog.error.message}` : "EXECUTOU — CÃO OCULTADO SEM ADMIN",
    !!rpcHideDog.error,
  );

  // Confirma pela chave secreta que NADA das quatro tentativas gravou —
  // mesmo formato do "papel de B... após as tentativas" do cenário 6.
  const { data: bAfter } = await admin
    .from("profiles")
    .select("suspended_at")
    .eq("id", B.id)
    .single();
  const { data: kennelBAfter } = await admin
    .from("kennels")
    .select("founder_number, hidden_at")
    .eq("id", kennelB.id)
    .single();
  const { data: dogBAfter } = await admin
    .from("dogs")
    .select("hidden_at")
    .eq("id", dogB!.id)
    .single();
  const nadaMudou =
    bAfter?.suspended_at === null &&
    kennelBAfter?.founder_number === null &&
    kennelBAfter?.hidden_at === null &&
    dogBAfter?.hidden_at === null;
  record(
    "14. Superfície admin_*",
    "estado de B, do canil e do cão após as quatro tentativas",
    "nada mudou",
    nadaMudou
      ? "nada mudou"
      : `suspended_at=${bAfter?.suspended_at} founder_number=${kennelBAfter?.founder_number} kennel.hidden_at=${kennelBAfter?.hidden_at} dog.hidden_at=${dogBAfter?.hidden_at}`,
    nadaMudou,
  );

  // `admin_get_profile_email` — a quinta função admin_*, nascida na tela de
  // detalhe do usuário. Mesma dupla checagem das outras quatro: usuário comum
  // recusado, e — pela primeira vez neste arquivo — uma chamada admin_* de
  // SUCESSO sendo provada (até aqui só se provava rejeição).
  const rpcEmailDenied = await B.client.rpc("admin_get_profile_email", {
    p_profile_id: B.id,
  });
  record(
    "14. Superfície admin_*",
    "usuário comum chama admin_get_profile_email",
    "erro — insufficient_privilege",
    rpcEmailDenied.error ? `erro: ${rpcEmailDenied.error.message}` : "EXECUTOU — E-MAIL LIDO SEM ADMIN",
    !!rpcEmailDenied.error,
  );

  const rpcEmailOk = await ADMIN.client.rpc("admin_get_profile_email", {
    p_profile_id: B.id,
  });
  record(
    "14. Superfície admin_*",
    "admin chama admin_get_profile_email para B",
    B.email,
    rpcEmailOk.error ? `erro: ${rpcEmailOk.error.message}` : String(rpcEmailOk.data),
    !rpcEmailOk.error && rpcEmailOk.data === B.email,
  );

  // ---------------------------------------------------------------------------
  // Cenário 15 — ciclo completo de suspensão, com sessões reais dos dois lados
  //
  // O cenário 14 prova AUTORIZAÇÃO (quem pode chamar a RPC). Este prova EFEITO:
  // um admin de verdade suspende um usuário de verdade, e o alvo perde a
  // capacidade de agir E de logar — as duas metades do pedido "usuário
  // bloqueado não consegue mais logar/agir". `battery.sql` já prova o
  // mecanismo de RLS por trás disso (casos 33-41), como POSTGRES; aqui é a
  // MESMA porta que um atacante ou uma Server Action com bug usaria — a API
  // REST, sessão real.
  // ---------------------------------------------------------------------------

  const suspendReal = await ADMIN.client.rpc("admin_set_profile_suspended", {
    p_profile_id: B.id,
    p_suspended: true,
    p_reason: "cenário 15 — suspensão real via API",
  });
  record(
    "15. Ciclo de suspensão",
    "admin suspende B de verdade, pela RPC",
    "sucesso",
    suspendReal.error ? `erro: ${suspendReal.error.message}` : "sucesso",
    !suspendReal.error,
  );

  const { data: auditRows } = await admin
    .from("audit_log")
    .select("id")
    .eq("entity_type", "profile")
    .eq("entity_id", B.id)
    .eq("action", "profile.suspend");
  record(
    "15. Ciclo de suspensão",
    "audit_log tem exatamente 1 linha para esta suspensão",
    "1 linha",
    `${auditRows?.length ?? 0} linha(s)`,
    (auditRows?.length ?? 0) === 1,
  );

  // "Não consegue mais agir" — a SESSÃO de B, que já estava aberta antes da
  // suspensão, tenta escrever. `is_suspended()` na RLS barra na hora, sem
  // precisar de um logout/login para valer.
  const bWriteAfterSuspend = await B.client
    .from("kennels")
    .update({ description: "tentativa depois de suspenso" })
    .eq("id", kennelB.id)
    .select();
  record(
    "15. Ciclo de suspensão",
    "B (já suspenso) tenta escrever com a sessão que já tinha aberta",
    "0 linhas",
    describe(bWriteAfterSuspend.error, bWriteAfterSuspend.data ?? []),
    !bWriteAfterSuspend.error && (bWriteAfterSuspend.data?.length ?? -1) === 0,
  );

  // "Não consegue mais logar" — prova o `banned_until` pela porta real: uma
  // sessão NOVA, não a que já estava aberta. É o que distingue isto de só
  // conferir a coluna no banco.
  const loginAfterSuspend = await createClient(URL!, PUBLISHABLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.signInWithPassword({ email: B.email, password: PASSWORD });
  record(
    "15. Ciclo de suspensão",
    "B tenta logar de novo (sessão nova) enquanto suspenso",
    "erro — banido",
    loginAfterSuspend.error
      ? `erro: ${loginAfterSuspend.error.message}`
      : "LOGOU — SUSPENSÃO NÃO BLOQUEIA LOGIN",
    !!loginAfterSuspend.error,
  );

  // Fecha o ciclo: reativa, e as duas metades voltam a funcionar.
  const unsuspendReal = await ADMIN.client.rpc("admin_set_profile_suspended", {
    p_profile_id: B.id,
    p_suspended: false,
    p_reason: "cenário 15 — reativação real via API",
  });
  record(
    "15. Ciclo de suspensão",
    "admin reativa B de verdade, pela RPC",
    "sucesso",
    unsuspendReal.error ? `erro: ${unsuspendReal.error.message}` : "sucesso",
    !unsuspendReal.error,
  );

  const loginAfterUnsuspend = await createClient(URL!, PUBLISHABLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.signInWithPassword({ email: B.email, password: PASSWORD });
  record(
    "15. Ciclo de suspensão",
    "B loga de novo depois de reativado",
    "sucesso",
    loginAfterUnsuspend.error ? `erro: ${loginAfterUnsuspend.error.message}` : "sucesso",
    !loginAfterUnsuspend.error,
  );

  const bWriteAfterUnsuspend = await B.client
    .from("kennels")
    .update({ description: "voltou a funcionar" })
    .eq("id", kennelB.id)
    .select();
  record(
    "15. Ciclo de suspensão",
    "B volta a conseguir escrever, com a sessão antiga, depois de reativado",
    "1 linha",
    describe(bWriteAfterUnsuspend.error, bWriteAfterUnsuspend.data ?? []),
    !bWriteAfterUnsuspend.error && (bWriteAfterUnsuspend.data?.length ?? 0) === 1,
  );

  // ---------------------------------------------------------------------------
  // Cenário 16 — ciclo completo de ocultar/reativar canil e cão, pela API real
  //
  // Mesmo espírito do cenário 15, para as outras duas RPCs de moderação. O
  // cenário 14 já provou AUTORIZAÇÃO (B não consegue); este prova EFEITO: um
  // admin de verdade oculta o canil e o cão publicados de B, e os dois somem
  // da sessão anônima, mas B — o dono — continua enxergando (mesma
  // propriedade que `battery.sql` casos 48/49/51 já provam em SQL puro, aqui
  // pela porta real). `battery.sql` também não tinha nenhum caso de
  // REATIVAR canil/cão até agora — cobre-se os dois lados aqui.
  // ---------------------------------------------------------------------------

  const hideKennelReal = await ADMIN.client.rpc("admin_set_kennel_hidden", {
    p_kennel_id: kennelB.id,
    p_hidden: true,
    p_reason: "cenário 16 — ocultar real via API",
  });
  record(
    "16. Ciclo de ocultar canil e cão",
    "admin oculta o canil de B de verdade, pela RPC",
    "sucesso",
    hideKennelReal.error ? `erro: ${hideKennelReal.error.message}` : "sucesso",
    !hideKennelReal.error,
  );

  const hideDogReal = await ADMIN.client.rpc("admin_set_dog_hidden", {
    p_dog_id: dogB!.id,
    p_hidden: true,
    p_reason: "cenário 16 — ocultar real via API",
  });
  record(
    "16. Ciclo de ocultar canil e cão",
    "admin oculta o cão de B de verdade, pela RPC",
    "sucesso",
    hideDogReal.error ? `erro: ${hideDogReal.error.message}` : "sucesso",
    !hideDogReal.error,
  );

  const { data: hideAuditRows } = await admin
    .from("audit_log")
    .select("id, entity_type, action")
    .in("entity_id", [kennelB.id, dogB!.id])
    .in("action", ["kennel.hide", "dog.hide"]);
  record(
    "16. Ciclo de ocultar canil e cão",
    "audit_log tem exatamente 1 linha para cada ocultação",
    "2 linhas",
    `${hideAuditRows?.length ?? 0} linha(s)`,
    (hideAuditRows?.length ?? 0) === 2,
  );

  const anonKennelHidden = await anon.from("kennels").select("id").eq("id", kennelB.id);
  record(
    "16. Ciclo de ocultar canil e cão",
    "sessão anônima não vê mais o canil oculto",
    "0 linhas",
    describe(anonKennelHidden.error, anonKennelHidden.data ?? []),
    !anonKennelHidden.error && (anonKennelHidden.data?.length ?? -1) === 0,
  );

  const anonDogHidden = await anon.from("dogs").select("id").eq("id", dogB!.id);
  record(
    "16. Ciclo de ocultar canil e cão",
    "sessão anônima não vê mais o cão oculto",
    "0 linhas",
    describe(anonDogHidden.error, anonDogHidden.data ?? []),
    !anonDogHidden.error && (anonDogHidden.data?.length ?? -1) === 0,
  );

  const ownerSeesKennelHidden = await B.client.from("kennels").select("id").eq("id", kennelB.id);
  record(
    "16. Ciclo de ocultar canil e cão",
    "o DONO continua enxergando o próprio canil oculto",
    "1 linha",
    describe(ownerSeesKennelHidden.error, ownerSeesKennelHidden.data ?? []),
    !ownerSeesKennelHidden.error && (ownerSeesKennelHidden.data?.length ?? 0) === 1,
  );

  const ownerSeesDogHidden = await B.client.from("dogs").select("id").eq("id", dogB!.id);
  record(
    "16. Ciclo de ocultar canil e cão",
    "o DONO continua enxergando o próprio cão oculto",
    "1 linha",
    describe(ownerSeesDogHidden.error, ownerSeesDogHidden.data ?? []),
    !ownerSeesDogHidden.error && (ownerSeesDogHidden.data?.length ?? 0) === 1,
  );

  // Fecha o ciclo: reativa os dois, e a sessão anônima volta a enxergar.
  const unhideKennelReal = await ADMIN.client.rpc("admin_set_kennel_hidden", {
    p_kennel_id: kennelB.id,
    p_hidden: false,
    p_reason: "cenário 16 — reativação real via API",
  });
  record(
    "16. Ciclo de ocultar canil e cão",
    "admin reativa o canil de B de verdade, pela RPC",
    "sucesso",
    unhideKennelReal.error ? `erro: ${unhideKennelReal.error.message}` : "sucesso",
    !unhideKennelReal.error,
  );

  const unhideDogReal = await ADMIN.client.rpc("admin_set_dog_hidden", {
    p_dog_id: dogB!.id,
    p_hidden: false,
    p_reason: "cenário 16 — reativação real via API",
  });
  record(
    "16. Ciclo de ocultar canil e cão",
    "admin reativa o cão de B de verdade, pela RPC",
    "sucesso",
    unhideDogReal.error ? `erro: ${unhideDogReal.error.message}` : "sucesso",
    !unhideDogReal.error,
  );

  const { data: unhideAuditRows } = await admin
    .from("audit_log")
    .select("id")
    .in("entity_id", [kennelB.id, dogB!.id])
    .in("action", ["kennel.unhide", "dog.unhide"]);
  record(
    "16. Ciclo de ocultar canil e cão",
    "audit_log tem exatamente 1 linha para cada reativação",
    "2 linhas",
    `${unhideAuditRows?.length ?? 0} linha(s)`,
    (unhideAuditRows?.length ?? 0) === 2,
  );

  const anonKennelBack = await anon.from("kennels").select("id").eq("id", kennelB.id);
  record(
    "16. Ciclo de ocultar canil e cão",
    "sessão anônima volta a ver o canil, reativado",
    "1 linha",
    describe(anonKennelBack.error, anonKennelBack.data ?? []),
    !anonKennelBack.error && (anonKennelBack.data?.length ?? 0) === 1,
  );

  const anonDogBack = await anon.from("dogs").select("id").eq("id", dogB!.id);
  record(
    "16. Ciclo de ocultar canil e cão",
    "sessão anônima volta a ver o cão, reativado",
    "1 linha",
    describe(anonDogBack.error, anonDogBack.data ?? []),
    !anonDogBack.error && (anonDogBack.data?.length ?? 0) === 1,
  );

  // ---------------------------------------------------------------------------
  // Cenário 17 — corrigir founder_number pela API real, com sessão de admin
  //
  // Não-admin bloqueado já está provado no cenário 14 (B chamando
  // admin_set_founder_number é rejeitado) — nada repetido aqui.
  //
  // Reaproveita os kennels de 11b (`founderKennelIds`) em vez de inventar
  // números novos: números novos gastariam do pool de verdade e empurrariam
  // `kennel_founder_seq` para um valor artificial que só
  // `npm run db:founder-reset` desfaria depois. Índice 0 já foi excluído
  // logicamente por 11b (sobra o número, mas não é um bom sujeito de teste
  // aqui) — uso 1, 2 e 3.
  //
  // O round-trip nulo→número evita QUALQUER bump de sequence: `p_number
  // null` pula o bloco de `setval` por completo, e devolver o número
  // original não dispara `setval` porque ele já é menor que o `last_value`
  // atual (foi emitido antes, a sequence só cresce). Fecha sem deixar
  // rastro no estado nem na sequence.
  // ---------------------------------------------------------------------------

  if (PULAR_SELO || founderKennelIds.length < 4) {
    const motivo = PULAR_SELO
      ? "pulado por RLS_PULAR_SELO_FUNDADOR=1 — depende dos kennels de 11b"
      : "11b não deixou kennels suficientes para o cenário 17";
    skip("17. Corrigir número do selo", "duplicidade é impedida mesmo pelo caminho admin", motivo);
    skip("17. Corrigir número do selo", "correção real grava histórico, de→para", motivo);
  } else {
    const alvo = founderKennelIds[1]!;
    const outro = founderKennelIds[2]!;
    const livre = founderKennelIds[3]!;

    const { data: numerosAntes } = await admin
      .from("kennels")
      .select("id, founder_number")
      .in("id", [alvo, outro, livre]);
    const numeroAlvo = numerosAntes?.find((k) => k.id === alvo)?.founder_number ?? null;
    const numeroOutro = numerosAntes?.find((k) => k.id === outro)?.founder_number ?? null;
    const numeroLivre = numerosAntes?.find((k) => k.id === livre)?.founder_number ?? null;

    // Duplicidade — mesmo pelo caminho admin.
    const dupTentativa = await ADMIN.client.rpc("admin_set_founder_number", {
      p_kennel_id: alvo,
      p_number: numeroOutro,
      p_reason: "cenário 17 — tentativa de duplicidade",
    });
    record(
      "17. Corrigir número do selo",
      "admin tenta atribuir a um canil o número que já pertence a outro",
      "erro — número já pertence a outro canil",
      dupTentativa.error ? `erro: ${dupTentativa.error.message}` : "EXECUTOU — DUPLICOU O NÚMERO",
      !!dupTentativa.error && dupTentativa.error.message.includes("já pertence a outro canil"),
    );

    const { data: alvoAposDup } = await admin
      .from("kennels")
      .select("founder_number")
      .eq("id", alvo)
      .single();
    record(
      "17. Corrigir número do selo",
      "número do canil-alvo não mudou depois da tentativa de duplicidade",
      `nº ${numeroAlvo}`,
      `nº ${alvoAposDup?.founder_number}`,
      alvoAposDup?.founder_number === numeroAlvo,
    );

    // Correção real: libera (para null) e devolve — dois `de/para` reais,
    // sem tocar a sequence em nenhum dos dois.
    const libera = await ADMIN.client.rpc("admin_set_founder_number", {
      p_kennel_id: livre,
      p_number: null,
      p_reason: "cenário 17 — libera temporariamente para provar a correção",
    });
    record(
      "17. Corrigir número do selo",
      "admin libera o número do canil (correção real, primeira metade)",
      "sucesso",
      libera.error ? `erro: ${libera.error.message}` : "sucesso",
      !libera.error,
    );

    const devolve = await ADMIN.client.rpc("admin_set_founder_number", {
      p_kennel_id: livre,
      p_number: numeroLivre,
      p_reason: "cenário 17 — devolve o número correto",
    });
    record(
      "17. Corrigir número do selo",
      "admin devolve o número certo (correção real, segunda metade)",
      "sucesso",
      devolve.error ? `erro: ${devolve.error.message}` : "sucesso",
      !devolve.error,
    );

    const { data: auditFounder } = await admin
      .from("audit_log")
      .select("id, details")
      .eq("entity_id", livre)
      .eq("action", "kennel.founder_number.set")
      .order("id", { ascending: true });
    const deParaCorretos =
      (auditFounder?.length ?? 0) === 2 &&
      (auditFounder![0]!.details as { de: unknown; para: unknown }).de === numeroLivre &&
      (auditFounder![0]!.details as { de: unknown; para: unknown }).para === null &&
      (auditFounder![1]!.details as { de: unknown; para: unknown }).de === null &&
      (auditFounder![1]!.details as { de: unknown; para: unknown }).para === numeroLivre;
    record(
      "17. Corrigir número do selo",
      "audit_log grava as duas correções, de→para corretos",
      `2 linhas: {de:${numeroLivre},para:null} e {de:null,para:${numeroLivre}}`,
      `${auditFounder?.length ?? 0} linha(s): ${JSON.stringify(auditFounder?.map((a) => a.details))}`,
      deParaCorretos,
    );

    const { data: livreFinal } = await admin
      .from("kennels")
      .select("founder_number")
      .eq("id", livre)
      .single();
    record(
      "17. Corrigir número do selo",
      "canil termina com o número original — round-trip fechado",
      `nº ${numeroLivre}`,
      `nº ${livreFinal?.founder_number}`,
      livreFinal?.founder_number === numeroLivre,
    );
  }

  // ---------------------------------------------------------------------------
  // Cenário 18 — vídeo do cão: posse na escrita, visibilidade herdada na leitura
  //
  // A tabela é nova e a policy dela DELEGA a visibilidade a `dogs` (o `exists`
  // de `dog_videos_select`), exatamente como `media_select` já fazia. Delegar é
  // barato de escrever e caro de errar: se a delegação não funcionar, o vídeo
  // de um cão em RASCUNHO vaza para o visitante anônimo. É o que o par
  // publicado/rascunho abaixo mede — e é a razão de este cenário existir.
  //
  // Reusa `dogAPub` e `dogADraft` do cenário 1 de propósito: são o mesmo par
  // que já provou a regra do lado de `dogs`, então uma divergência entre as
  // duas tabelas aparece como diferença no relatório, não como suposição.
  // ---------------------------------------------------------------------------

  const { data: videoA, error: videoAError } = await A.client
    .from("dog_videos")
    .insert({
      dog_id: dogAPub.id,
      provider_uid: `rls-${RUN}-video-a`,
      status: "ready",
      thumbnail_url: "https://customer-rls1.cloudflarestream.com/x/thumbnails/thumbnail.jpg",
      playback_origin: "https://customer-rls1.cloudflarestream.com",
      duration_seconds: 12.5,
      owner_id: A.id,
      created_by: A.id,
    })
    .select("id")
    .single();
  record(
    "18. Vídeo",
    "A registra o vídeo do próprio cão",
    "criado",
    videoAError ? `erro ${videoAError.code}: ${videoAError.message}` : "criado",
    !videoAError && !!videoA,
  );

  // B tentando gravar vídeo no cão de A, assumindo a própria posse.
  const videoForjado = await B.client
    .from("dog_videos")
    .insert({
      dog_id: dogAPub.id,
      provider_uid: `rls-${RUN}-video-forjado`,
      status: "pendingupload",
      owner_id: B.id,
      created_by: B.id,
    })
    .select("id");
  record(
    "18. Vídeo",
    "B registra vídeo no cão de A",
    "negado (42501)",
    describe(videoForjado.error, videoForjado.data ?? undefined),
    videoForjado.error?.code === "42501",
  );

  // E agora forjando o owner_id como se fosse A — `dog_videos_insert` compara
  // com `auth.uid()`, então a mentira não passa nem com o cão certo.
  const videoOwnerForjado = await B.client
    .from("dog_videos")
    .insert({
      dog_id: dogAPub.id,
      provider_uid: `rls-${RUN}-video-owner-forjado`,
      status: "pendingupload",
      owner_id: A.id,
      created_by: A.id,
    })
    .select("id");
  record(
    "18. Vídeo",
    "B registra vídeo forjando owner_id de A",
    "negado (42501)",
    describe(videoOwnerForjado.error, videoOwnerForjado.data ?? undefined),
    videoOwnerForjado.error?.code === "42501",
  );

  if (videoA) {
    // UPDATE recusado pela RLS não devolve erro pelo PostgREST: devolve sucesso
    // com ZERO linha. Por isso o critério aqui é a CONTAGEM, não o `error` —
    // foi essa distinção que deixou passar despercebida a policy que recusava a
    // própria exclusão lógica de mídia até produção.
    const videoUpdateB = await B.client
      .from("dog_videos")
      .update({ status: "error", error_reason: "sabotagem" })
      .eq("id", videoA.id)
      .select("id");
    record(
      "18. Vídeo",
      "B altera o status do vídeo de A",
      "0 linhas",
      describe(videoUpdateB.error, videoUpdateB.data ?? undefined),
      !videoUpdateB.error && (videoUpdateB.data ?? []).length === 0,
    );

    // Sem grant de DELETE para ninguém: a invariante de exclusão lógica é
    // privilégio do Postgres, não convenção de código.
    const videoDelete = await A.client.from("dog_videos").delete().eq("id", videoA.id).select();
    record(
      "18. Vídeo",
      "A apaga fisicamente o próprio vídeo",
      "negado (42501)",
      describe(videoDelete.error, videoDelete.data ?? undefined),
      videoDelete.error?.code === "42501",
    );

    // Um vídeo vivo por cão — `dog_videos_one_per_dog`.
    const videoSegundo = await A.client
      .from("dog_videos")
      .insert({
        dog_id: dogAPub.id,
        provider_uid: `rls-${RUN}-video-segundo`,
        status: "pendingupload",
        owner_id: A.id,
        created_by: A.id,
      })
      .select("id");
    record(
      "18. Vídeo",
      "A registra um SEGUNDO vídeo no mesmo cão",
      "negado (23505)",
      describe(videoSegundo.error, videoSegundo.data ?? undefined),
      videoSegundo.error?.code === "23505",
    );
  }

  // O vídeo de um cão em RASCUNHO. Existe para o dono; o visitante não pode
  // nem saber que existe.
  const { data: videoDraft } = await A.client
    .from("dog_videos")
    .insert({
      dog_id: dogADraft.id,
      provider_uid: `rls-${RUN}-video-rascunho`,
      status: "pendingupload",
      owner_id: A.id,
      created_by: A.id,
    })
    .select("id")
    .single();

  const anonVideoPub = await anon.from("dog_videos").select("id").eq("dog_id", dogAPub.id);
  record(
    "18. Vídeo",
    "anônimo lê o vídeo de cão PUBLICADO",
    "1 linha",
    describe(anonVideoPub.error, anonVideoPub.data ?? undefined),
    !anonVideoPub.error && (anonVideoPub.data ?? []).length === 1,
  );

  const anonVideoDraft = await anon.from("dog_videos").select("id").eq("dog_id", dogADraft.id);
  record(
    "18. Vídeo",
    "anônimo lê o vídeo de cão em RASCUNHO",
    "0 linhas",
    describe(anonVideoDraft.error, anonVideoDraft.data ?? undefined),
    !anonVideoDraft.error && (anonVideoDraft.data ?? []).length === 0,
  );

  // Varredura: nenhum vídeo de rascunho pode aparecer numa listagem aberta.
  const anonVideoTodos = await anon.from("dog_videos").select("id");
  const vazados = (anonVideoTodos.data ?? []).filter(
    (v: { id: string }) => v.id === videoDraft?.id,
  );
  record(
    "18. Vídeo",
    "listagem anônima sem filtro traz vídeo de rascunho",
    "0 linhas do rascunho",
    `${vazados.length} linha(s)`,
    vazados.length === 0,
  );

  // A EXCLUSÃO LÓGICA PELO PRÓPRIO DONO.
  //
  // Este caso existe porque o projeto já foi mordido por ele uma vez, em
  // `media` (migration `fix_media_select_soft_delete`): toda mutação do
  // PostgREST vira `UPDATE ... RETURNING`, e o Postgres exige que a linha
  // RESULTANTE ainda satisfaça a policy de SELECT. Uma policy que começa com
  // `deleted_at is null`, sem exceção para o dono, torna a linha invisível no
  // instante em que ela é marcada como excluída — e aí o próprio UPDATE que a
  // exclui volta com ZERO linha.
  //
  // O critério é a CONTAGEM, não o `error`: a RLS não devolve erro nesse caso,
  // devolve sucesso vazio. Foi exatamente assim que a falha passou despercebida
  // até produção da primeira vez.
  if (videoA) {
    const videoSoftDelete = await A.client
      .from("dog_videos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", videoA.id)
      .is("deleted_at", null)
      .select("id");
    record(
      "18. Vídeo",
      "A exclui logicamente o PRÓPRIO vídeo (RETURNING precisa voltar a linha)",
      "1 linha",
      describe(videoSoftDelete.error, videoSoftDelete.data ?? undefined),
      !videoSoftDelete.error && (videoSoftDelete.data ?? []).length === 1,
    );

    const anonVideoRemovido = await anon.from("dog_videos").select("id").eq("id", videoA.id);
    record(
      "18. Vídeo",
      "anônimo lê vídeo já excluído logicamente",
      "0 linhas",
      describe(anonVideoRemovido.error, anonVideoRemovido.data ?? undefined),
      !anonVideoRemovido.error && (anonVideoRemovido.data ?? []).length === 0,
    );

    // A vaga do índice único parcial volta — é o que faz "trocar o vídeo"
    // funcionar sem apagar histórico.
    const videoSubstituto = await A.client
      .from("dog_videos")
      .insert({
        dog_id: dogAPub.id,
        provider_uid: `rls-${RUN}-video-substituto`,
        status: "pendingupload",
        owner_id: A.id,
        created_by: A.id,
      })
      .select("id");
    record(
      "18. Vídeo",
      "A envia outro vídeo depois de remover o anterior",
      "criado",
      describe(videoSubstituto.error, videoSubstituto.data ?? undefined),
      !videoSubstituto.error && (videoSubstituto.data ?? []).length === 1,
    );
  }

  // ---------------------------------------------------------------------------
  // Cenário 19 — ninhadas do canil: posse via CANIL (sem owner_id próprio),
  // publicação ENCADEADA (ninhada e canil, as duas), e o teto de 4 fotos
  // garantido pelo banco por índice único parcial, não por contagem.
  //
  // Canil PRÓPRIO para este cenário. `kennelA` está excluído desde o cenário 8
  // e `kennelMedia` foi apagado ao fim do cenário 10 — a vaga de A está livre,
  // mesmo raciocínio já registrado lá.
  //
  // `kennel_litters` não tem `owner_id`: toda posse passa por
  // `private.owns_kennel(kennel_id)`. Por isso os dois lados do teste de posse
  // cruzada usam CANIS diferentes (o de A e o de B, ambos vivos), não o mesmo
  // canil com um "owner_id" forjado — não existe coluna para forjar.
  // ---------------------------------------------------------------------------

  const { data: kennelLitters, error: kennelLittersError } = await A.client
    .from("kennels")
    .insert({
      owner_id: A.id,
      created_by: A.id,
      name: "Canil Ninhadas",
      slug: `rls-${RUN}-canil-ninhadas`,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  record(
    "19. Ninhadas",
    "A cria o canil deste cenário (a vaga estava livre desde o cenário 10)",
    "1 linha",
    kennelLittersError ? `erro: ${kennelLittersError.message}` : "1 linha",
    !kennelLittersError && !!kennelLitters,
  );
  if (!kennelLitters) throw new Error("fixture obrigatória falhou: canil de ninhadas");

  const { data: litterA, error: litterAError } = await A.client
    .from("kennel_litters")
    .insert({
      kennel_id: kennelLitters.id,
      description: "Ninhada de outubro, quatro filhotes.",
      created_by: A.id,
    })
    .select("id")
    .single();
  record(
    "19. Ninhadas",
    "A cria ninhada RASCUNHO no próprio canil",
    "criada",
    litterAError ? `erro ${litterAError.code}: ${litterAError.message}` : "criada",
    !litterAError && !!litterA,
  );

  // B tentando criar ninhada no canil de A — sem owner_id na tabela, quem nega
  // é exclusivamente `private.owns_kennel(kennel_id)`.
  const litterForjada = await B.client
    .from("kennel_litters")
    .insert({ kennel_id: kennelLitters.id, description: "forjada", created_by: B.id })
    .select("id");
  record(
    "19. Ninhadas",
    "B cria ninhada no canil de A",
    "negado (42501)",
    describe(litterForjada.error, litterForjada.data ?? undefined),
    litterForjada.error?.code === "42501",
  );

  // Agora B usa o PRÓPRIO canil (kennelB, dono de verdade) mas forja
  // `created_by` como A. `kennel_litters_insert` compara com `auth.uid()`, e
  // isto isola a checagem de identidade da checagem de posse do canil.
  const litterCreatedByForjado = await B.client
    .from("kennel_litters")
    .insert({ kennel_id: kennelB.id, description: "identidade forjada", created_by: A.id })
    .select("id");
  record(
    "19. Ninhadas",
    "B cria ninhada no PRÓPRIO canil forjando created_by de A",
    "negado (42501)",
    describe(litterCreatedByForjado.error, litterCreatedByForjado.data ?? undefined),
    litterCreatedByForjado.error?.code === "42501",
  );

  if (litterA) {
    // B — AUTENTICADO, não anônimo — lendo a ninhada RASCUNHO de A. A
    // policy trata `anon` e `authenticated` na MESMA cláusula pública
    // (`kennel_litters_select` não abre uma exceção para "qualquer
    // logado"), mas isso é fato sobre o SQL, não sobre o comportamento
    // observado — este é o teste que mede o comportamento em vez de
    // confiar na leitura da policy.
    const litterReadB = await B.client.from("kennel_litters").select("id").eq("id", litterA.id);
    record(
      "19. Ninhadas",
      "B (autenticado, não dono) lê a ninhada RASCUNHO de A",
      "0 linhas",
      describe(litterReadB.error, litterReadB.data ?? undefined),
      !litterReadB.error && (litterReadB.data ?? []).length === 0,
    );

    // UPDATE recusado pela RLS não devolve erro — devolve sucesso com ZERO
    // linha. O critério é a CONTAGEM, mesma classe de falha silenciosa já
    // registrada em `media`/`dog_videos`.
    const litterUpdateB = await B.client
      .from("kennel_litters")
      .update({ description: "sabotagem" })
      .eq("id", litterA.id)
      .select("id");
    record(
      "19. Ninhadas",
      "B altera a descrição da ninhada de A",
      "0 linhas",
      describe(litterUpdateB.error, litterUpdateB.data ?? undefined),
      !litterUpdateB.error && (litterUpdateB.data ?? []).length === 0,
    );

    const publicaLitterA = await A.client
      .from("kennel_litters")
      .update({ published_at: new Date().toISOString() })
      .eq("id", litterA.id)
      .select("id");
    record(
      "19. Ninhadas",
      "A publica a própria ninhada",
      "1 linha",
      describe(publicaLitterA.error, publicaLitterA.data ?? undefined),
      !publicaLitterA.error && (publicaLitterA.data ?? []).length === 1,
    );

    const anonLitterPub = await anon.from("kennel_litters").select("id").eq("id", litterA.id);
    record(
      "19. Ninhadas",
      "anônimo lê ninhada publicada, com canil publicado",
      "1 linha",
      describe(anonLitterPub.error, anonLitterPub.data ?? undefined),
      !anonLitterPub.error && (anonLitterPub.data ?? []).length === 1,
    );

    // O ENCADEAMENTO — a razão de existir de kennel_litters_select ter DUAS
    // condições, não uma. Despublica o CANIL (a ninhada continua com
    // `published_at` preenchido) e confirma que a visibilidade cai junto,
    // mesmo sem tocar na ninhada. Sem este teste, um `exists` sem checar
    // `published_at` do canil passaria despercebido — o mesmo tipo de furo
    // que a delegação de `dog_videos_select` para `dogs` evita, aqui do lado
    // que `dogs_select` nem precisa considerar (cão não tem uma segunda
    // publicação "por cima").
    await A.client
      .from("kennels")
      .update({ published_at: null })
      .eq("id", kennelLitters.id);

    const anonLitterCanilRascunho = await anon
      .from("kennel_litters")
      .select("id")
      .eq("id", litterA.id);
    record(
      "19. Ninhadas",
      "ninhada PUBLICADA some da leitura anônima quando o CANIL volta a rascunho",
      "0 linhas",
      describe(anonLitterCanilRascunho.error, anonLitterCanilRascunho.data ?? undefined),
      !anonLitterCanilRascunho.error && (anonLitterCanilRascunho.data ?? []).length === 0,
    );

    const donoAindaVe = await A.client.from("kennel_litters").select("id").eq("id", litterA.id);
    record(
      "19. Ninhadas",
      "o DONO continua vendo a própria ninhada com o canil em rascunho",
      "1 linha",
      describe(donoAindaVe.error, donoAindaVe.data ?? undefined),
      !donoAindaVe.error && (donoAindaVe.data ?? []).length === 1,
    );

    // Republica o canil — o resto do cenário (fotos, exclusão lógica) espera a
    // visibilidade pública normal.
    await A.client
      .from("kennels")
      .update({ published_at: new Date().toISOString() })
      .eq("id", kennelLitters.id);
  }

  // ---------------------------------------------------------------------------
  // FILHOTE NA NINHADA ALHEIA — o buraco que `dogs.litter_id` abriria.
  //
  // Antes da migration `ninhada_completa_estrutura`, `dogs_insert` validava
  // `kennel_id` (via owns_kennel) e NADA olhava `litter_id`. B conseguiria
  // inserir um cão apontando para a ninhada de A, e ele apareceria na página
  // pública dela — conteúdo de terceiro dentro do canil de outro criador.
  //
  // O conserto é a cláusula `private.owns_litter(litter_id)` no WITH CHECK das
  // duas policies. Isto é RLS pura: a bateria SQL roda como superusuário e não
  // alcança este caso. Se algum dia alguém recriar `dogs_insert` sem a
  // cláusula, é AQUI que aparece.
  // ---------------------------------------------------------------------------
  if (litterA) {
    const invasao = await B.client
      .from("dogs")
      .insert({
        name: "Filhote Invasor",
        sex: "male",
        litter_id: litterA.id,
        litter_status: "available",
        created_by: B.id,
        owner_id: B.id,
      })
      .select("id");

    record(
      "19. Ninhadas",
      "B NÃO consegue cadastrar filhote na ninhada de A (owns_litter no WITH CHECK)",
      "recusado",
      describe(invasao.error, invasao.data ?? undefined),
      Boolean(invasao.error) || (invasao.data ?? []).length === 0,
    );

    // O contraste que prova que a cláusula não bloqueia o caso legítimo: A, dona
    // da ninhada, cadastra normalmente. Sem este par, uma policy que recusasse
    // TODO mundo passaria no teste acima e ninguém notaria até a tela quebrar.
    const legitimo = await A.client
      .from("dogs")
      .insert({
        name: "Filhote Legítimo",
        sex: "female",
        kennel_id: kennelLitters.id,
        litter_id: litterA.id,
        litter_status: "available",
        created_by: A.id,
        owner_id: A.id,
      })
      .select("id");

    record(
      "19. Ninhadas",
      "A (dona) cadastra filhote na própria ninhada",
      "criado",
      describe(legitimo.error, legitimo.data ?? undefined),
      !legitimo.error && (legitimo.data ?? []).length === 1,
    );

    // Preço só existe DENTRO de ninhada — a fronteira do aditivo contratual.
    // Aqui a prova é pela API, com RLS e grant por coluna no caminho: o CHECK
    // `dogs_price_requires_litter` continua valendo para quem passa pelo
    // PostgREST, não só para quem escreve SQL direto.
    const precoForaDeNinhada = await A.client
      .from("dogs")
      .insert({
        name: "Cao Com Preco Indevido",
        sex: "male",
        kennel_id: kennelLitters.id,
        price_brl: 4500,
        created_by: A.id,
        owner_id: A.id,
      })
      .select("id");

    record(
      "19. Ninhadas",
      "preço em cão FORA de ninhada é recusado (fronteira do aditivo)",
      "recusado",
      describe(precoForaDeNinhada.error, precoForaDeNinhada.data ?? undefined),
      Boolean(precoForaDeNinhada.error) || (precoForaDeNinhada.data ?? []).length === 0,
    );
  }

  // A SEGUNDA ninhada — fica em rascunho de propósito, é o fixture dos testes
  // de foto abaixo (posse e o teto de 4 não dependem de publicação).
  const { data: litterFotos, error: litterFotosError } = await A.client
    .from("kennel_litters")
    .insert({ kennel_id: kennelLitters.id, description: "Ninhada com fotos", created_by: A.id })
    .select("id")
    .single();
  record(
    "19. Ninhadas",
    "A cria uma SEGUNDA ninhada no mesmo canil — sem unicidade entre ninhadas",
    "criada",
    litterFotosError ? `erro: ${litterFotosError.message}` : "criada",
    !litterFotosError && !!litterFotos,
  );

  if (litterFotos) {
    // Quatro fotos, posições 1 a 4 — todas devem caber.
    const posicoes = [1, 2, 3, 4];
    const resultados = await Promise.all(
      posicoes.map((pos) =>
        A.client
          .from("media")
          .insert({
            bucket_id: BUCKET,
            storage_path: `${A.id}/ninhadas/${litterFotos.id}/foto-${pos}-${RUN}.webp`,
            litter_id: litterFotos.id,
            role: "litter_gallery",
            position: pos,
            mime: "image/webp",
            size_bytes: 12345,
            owner_id: A.id,
            created_by: A.id,
          })
          .select("id"),
      ),
    );
    const todasCriadas = resultados.every((r) => !r.error && (r.data ?? []).length === 1);
    record(
      "19. Ninhadas",
      "A grava as 4 fotos da ninhada, uma por posição",
      "4 criadas",
      `${resultados.filter((r) => !r.error).length} criada(s)`,
      todasCriadas,
    );

    // A 5ª foto: nem posição fora do intervalo, nem repetir uma ocupada,
    // conseguem entrar. É o CHECK e o índice único fazendo o teto sozinhos —
    // nenhuma consulta de contagem roda para isto.
    const quintaForaDoIntervalo = await A.client
      .from("media")
      .insert({
        bucket_id: BUCKET,
        storage_path: `${A.id}/ninhadas/${litterFotos.id}/foto-5-${RUN}.webp`,
        litter_id: litterFotos.id,
        role: "litter_gallery",
        position: 5,
        mime: "image/webp",
        size_bytes: 12345,
        owner_id: A.id,
        created_by: A.id,
      })
      .select();
    record(
      "19. Ninhadas",
      "5ª foto em position=5 (fora do intervalo 1-4)",
      "erro CHECK media_litter_position_valid",
      describe(quintaForaDoIntervalo.error, quintaForaDoIntervalo.data ?? []),
      quintaForaDoIntervalo.error?.code === "23514",
    );

    const quintaRepetida = await A.client
      .from("media")
      .insert({
        bucket_id: BUCKET,
        storage_path: `${A.id}/ninhadas/${litterFotos.id}/foto-1b-${RUN}.webp`,
        litter_id: litterFotos.id,
        role: "litter_gallery",
        position: 1,
        mime: "image/webp",
        size_bytes: 12345,
        owner_id: A.id,
        created_by: A.id,
      })
      .select();
    record(
      "19. Ninhadas",
      "5ª foto reaproveitando position=1, já ocupada por linha viva",
      "erro em media_litter_position_uk",
      describe(quintaRepetida.error, quintaRepetida.data ?? []),
      Boolean(quintaRepetida.error?.message.includes("media_litter_position_uk")),
    );

    // B tentando gravar foto na ninhada de A — dois saltos
    // (media.litter_id → kennel_litters.kennel_id → kennels.owner_id), quem
    // nega é `private.owns_litter()`.
    const fotoForjada = await B.client
      .from("media")
      .insert({
        bucket_id: BUCKET,
        storage_path: `${A.id}/ninhadas/${litterFotos.id}/forjada-${RUN}.webp`,
        litter_id: litterFotos.id,
        role: "litter_gallery",
        position: 1,
        mime: "image/webp",
        size_bytes: 12345,
        owner_id: B.id,
        created_by: B.id,
      })
      .select();
    record(
      "19. Ninhadas",
      "B grava foto na ninhada de A",
      "negado (42501)",
      describe(fotoForjada.error, fotoForjada.data ?? []),
      fotoForjada.error?.code === "42501",
    );

    // Foto ainda em RASCUNHO (a ninhada não foi publicada): invisível para
    // anônimo, mesmo o canil estando publicado.
    const anonFotoRascunho = await anon
      .from("media")
      .select("id")
      .eq("litter_id", litterFotos.id);
    record(
      "19. Ninhadas",
      "anônimo lê fotos de ninhada em RASCUNHO",
      "0 linhas",
      describe(anonFotoRascunho.error, anonFotoRascunho.data ?? undefined),
      !anonFotoRascunho.error && (anonFotoRascunho.data ?? []).length === 0,
    );

    // Exclui logicamente a foto da posição 1 e confirma que a vaga reabre —
    // é o que faz o índice único parcial (`where deleted_at is null`) diferente
    // de um índice único cru, e é o mecanismo que permite substituir uma foto
    // sem esbarrar no teto.
    const fotoPos1 = await A.client
      .from("media")
      .select("id")
      .eq("litter_id", litterFotos.id)
      .eq("position", 1)
      .single();
    if (fotoPos1.data) {
      const excluiPos1 = await A.client
        .from("media")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", fotoPos1.data.id)
        .select("id");
      record(
        "19. Ninhadas",
        "A exclui logicamente a foto da posição 1",
        "1 linha",
        describe(excluiPos1.error, excluiPos1.data ?? undefined),
        !excluiPos1.error && (excluiPos1.data ?? []).length === 1,
      );

      const novaPos1 = await A.client
        .from("media")
        .insert({
          bucket_id: BUCKET,
          storage_path: `${A.id}/ninhadas/${litterFotos.id}/foto-1-nova-${RUN}.webp`,
          litter_id: litterFotos.id,
          role: "litter_gallery",
          position: 1,
          mime: "image/webp",
          size_bytes: 12345,
          owner_id: A.id,
          created_by: A.id,
        })
        .select("id");
      record(
        "19. Ninhadas",
        "A grava outra foto na posição 1, depois de excluir a anterior",
        "criada",
        describe(novaPos1.error, novaPos1.data ?? undefined),
        !novaPos1.error && (novaPos1.data ?? []).length === 1,
      );
    }

    // Publica a ninhada e confirma que as fotos vivas ficam visíveis —
    // fechando o encadeamento media → kennel_litters → kennels do lado
    // positivo (o lado negativo já foi provado acima, em rascunho).
    await A.client
      .from("kennel_litters")
      .update({ published_at: new Date().toISOString() })
      .eq("id", litterFotos.id);

    const anonFotoPublicada = await anon
      .from("media")
      .select("id")
      .eq("litter_id", litterFotos.id);
    record(
      "19. Ninhadas",
      "anônimo lê as fotos depois de a ninhada ser publicada",
      "4 linhas",
      describe(anonFotoPublicada.error, anonFotoPublicada.data ?? undefined),
      !anonFotoPublicada.error && (anonFotoPublicada.data ?? []).length === 4,
    );
  }

  if (litterA) {
    // A EXCLUSÃO LÓGICA PELO PRÓPRIO DONO — o caso que `media`/`dog_videos` já
    // pagaram uma vez cada: `owns_kennel()` na cláusula do dono nem MENCIONA
    // `deleted_at` da ninhada, então não há como esta policy repetir o bug.
    const litterSoftDelete = await A.client
      .from("kennel_litters")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", litterA.id)
      .is("deleted_at", null)
      .select("id");
    record(
      "19. Ninhadas",
      "A exclui logicamente a PRÓPRIA ninhada (RETURNING precisa voltar a linha)",
      "1 linha",
      describe(litterSoftDelete.error, litterSoftDelete.data ?? undefined),
      !litterSoftDelete.error && (litterSoftDelete.data ?? []).length === 1,
    );

    const anonLitterRemovida = await anon
      .from("kennel_litters")
      .select("id")
      .eq("id", litterA.id);
    record(
      "19. Ninhadas",
      "anônimo lê ninhada já excluída logicamente",
      "0 linhas",
      describe(anonLitterRemovida.error, anonLitterRemovida.data ?? undefined),
      !anonLitterRemovida.error && (anonLitterRemovida.data ?? []).length === 0,
    );

    // Sem GRANT de DELETE para ninguém — exclusão é sempre lógica.
    const litterDelete = await A.client
      .from("kennel_litters")
      .delete()
      .eq("id", litterA.id)
      .select();
    record(
      "19. Ninhadas",
      "A apaga fisicamente a própria ninhada",
      "negado (42501)",
      describe(litterDelete.error, litterDelete.data ?? undefined),
      litterDelete.error?.code === "42501",
    );
  }

  // ---------------------------------------------------------------------------
  // 20. Exames genéticos e saúde
  //
  // A REGRA DE VISIBILIDADE NÃO ESTÁ EM TYPESCRIPT — está na policy, e é por
  // isso que precisa ser provada aqui. `dog_genetic_tests_select` e
  // `dog_health_records_select` não rederivam `dog_is_public`: elas DELEGAM,
  // com um `exists (select 1 from public.dogs d where d.id = dog_id)` que roda
  // sob a RLS de quem consulta. Para o anônimo — o único client que as páginas
  // públicas usam — aquele `exists` só devolve linha quando `dogs_select`
  // aprova o cão.
  //
  // É o desenho certo (uma fonte de verdade para "público") e é frágil de um
  // jeito perigoso: alguém que "simplifique" aquele `exists` um dia continua
  // compilando, continua passando em todo teste existente, e passa a vazar
  // laudo de cão em RASCUNHO em silêncio. Estes casos existem para essa
  // regressão ter onde falhar alto.
  // ---------------------------------------------------------------------------
  {
    // Dois cães de A: um publicado, um em rascunho. Mesmo dono, mesma tabela,
    // mesma policy — a ÚNICA diferença entre eles é `published_at`, que é
    // exatamente a variável que o teste isola.
    const { data: caoPublicado } = await A.client
      .from("dogs")
      .insert({ name: `RLS ${RUN} Reprodutor`, sex: "male", created_by: A.id, owner_id: A.id })
      .select("id")
      .single();

    const { data: caoRascunho } = await A.client
      .from("dogs")
      .insert({ name: `RLS ${RUN} Rascunho`, sex: "male", created_by: A.id, owner_id: A.id })
      .select("id")
      .single();

    // `owner_id` preenchido impede que o cão caia na regra do ancestral
    // FANTASMA (`owner_id is null and kennel_id is null`), que é pública mesmo
    // sem `published_at` — sem isso o caso do rascunho passaria por engano.
    await admin
      .from("dogs")
      .update({ published_at: new Date().toISOString() })
      .eq("id", caoPublicado!.id);

    const { data: examePublicado } = await A.client
      .from("dog_genetic_tests")
      .insert({
        dog_id: caoPublicado!.id,
        name: "L2HGA",
        result: "Livre",
        created_by: A.id,
      })
      .select("id")
      .single();

    await A.client.from("dog_genetic_tests").insert({
      dog_id: caoRascunho!.id,
      name: "L2HGA",
      result: "Portador",
      created_by: A.id,
    });

    await A.client.from("dog_health_records").insert({
      dog_id: caoRascunho!.id,
      kind: "vaccine",
      applied_on: "2026-08-12",
      product: "V10",
      created_by: A.id,
    });

    const { data: saudePublicada } = await A.client
      .from("dog_health_records")
      .insert({
        dog_id: caoPublicado!.id,
        kind: "deworming",
        applied_on: "2026-08-10",
        product: "Drontal",
        created_by: A.id,
      })
      .select("id")
      .single();

    const anonExamePublico = await anon
      .from("dog_genetic_tests")
      .select("id")
      .eq("dog_id", caoPublicado!.id);
    record(
      "20. Exames genéticos",
      "anônimo lê exame de cão PUBLICADO",
      "1 linha",
      describe(anonExamePublico.error, anonExamePublico.data ?? undefined),
      !anonExamePublico.error && (anonExamePublico.data ?? []).length === 1,
    );

    // O caso central do pedido: laudo de cão não publicado não vaza.
    const anonExameRascunho = await anon
      .from("dog_genetic_tests")
      .select("id")
      .eq("dog_id", caoRascunho!.id);
    record(
      "20. Exames genéticos",
      "anônimo lê exame de cão em RASCUNHO",
      "0 linhas",
      describe(anonExameRascunho.error, anonExameRascunho.data ?? undefined),
      !anonExameRascunho.error && (anonExameRascunho.data ?? []).length === 0,
    );

    const anonSaudeRascunho = await anon
      .from("dog_health_records")
      .select("id")
      .eq("dog_id", caoRascunho!.id);
    record(
      "20. Exames genéticos",
      "anônimo lê registro de saúde de cão em RASCUNHO (mesma delegação)",
      "0 linhas",
      describe(anonSaudeRascunho.error, anonSaudeRascunho.data ?? undefined),
      !anonSaudeRascunho.error && (anonSaudeRascunho.data ?? []).length === 0,
    );

    // Uma listagem SEM filtro é o teste mais duro: prova que o rascunho não
    // aparece nem quando ninguém pediu por id — que é como um bug de policy
    // costuma vazar de verdade.
    const anonListaGeral = await anon.from("dog_genetic_tests").select("dog_id");
    record(
      "20. Exames genéticos",
      "listagem anônima sem filtro NÃO traz exame de cão em rascunho",
      "nenhuma linha do cão em rascunho",
      describe(anonListaGeral.error, anonListaGeral.data ?? undefined),
      !anonListaGeral.error &&
        !(anonListaGeral.data ?? []).some((r) => r.dog_id === caoRascunho!.id),
    );

    const bInsere = await B.client
      .from("dog_genetic_tests")
      .insert({
        dog_id: caoPublicado!.id,
        name: "Displasia coxofemoral",
        result: "A/A",
        created_by: B.id,
      })
      .select("id");
    record(
      "20. Exames genéticos",
      "B cadastra exame no cão de A",
      "recusado",
      describe(bInsere.error, bInsere.data ?? undefined),
      Boolean(bInsere.error) || (bInsere.data ?? []).length === 0,
    );

    // Cobre a action `updateGeneticTest`, que é nova. O UPDATE existe desde a
    // migration, mas até agora nenhum código da aplicação o exercia.
    const bEdita = await B.client
      .from("dog_genetic_tests")
      .update({ result: "Afetado" })
      .eq("id", examePublicado!.id)
      .select("id");
    record(
      "20. Exames genéticos",
      "B edita exame do cão de A",
      "recusado (0 linhas)",
      describe(bEdita.error, bEdita.data ?? undefined),
      Boolean(bEdita.error) || (bEdita.data ?? []).length === 0,
    );

    // O contraste — sem ele, uma policy que negasse TODO MUNDO passaria nos
    // casos acima e ninguém notaria até o criador reclamar.
    const aEdita = await A.client
      .from("dog_genetic_tests")
      .update({ result: "Portador" })
      .eq("id", examePublicado!.id)
      .select("id");
    record(
      "20. Exames genéticos",
      "A edita o PRÓPRIO exame",
      "1 linha",
      describe(aEdita.error, aEdita.data ?? undefined),
      !aEdita.error && (aEdita.data ?? []).length === 1,
    );

    // Exclusão é lógica aqui também: nenhuma das duas tabelas concede DELETE.
    const aApaga = await A.client
      .from("dog_genetic_tests")
      .delete()
      .eq("id", examePublicado!.id)
      .select();
    record(
      "20. Exames genéticos",
      "A apaga fisicamente o próprio exame",
      "negado (42501)",
      describe(aApaga.error, aApaga.data ?? undefined),
      aApaga.error?.code === "42501",
    );

    // -------------------------------------------------------------------------
    // `dog_health_records` — o CAMINHO DE ESCRITA POR TERCEIRO.
    //
    // Até esta auditoria a tabela só era exercida por "A insere" e "anônimo lê
    // rascunho". As policies dela são gêmeas das de `dog_genetic_tests`, mas
    // gêmeas por CÓPIA, não por compartilhamento — nada garante que continuem
    // iguais depois da próxima migration. Provar as duas separadamente é o que
    // transforma a semelhança em fato verificado.
    //
    // O caso de B editando cobre `updateHealthRecord`, action criada nesta
    // sessão e que até aqui não tinha nenhuma prova de RLS.
    // -------------------------------------------------------------------------
    const anonSaudePublica = await anon
      .from("dog_health_records")
      .select("id")
      .eq("dog_id", caoPublicado!.id);
    record(
      "20. Exames genéticos",
      "anônimo lê saúde de cão PUBLICADO",
      "1 linha",
      describe(anonSaudePublica.error, anonSaudePublica.data ?? undefined),
      !anonSaudePublica.error && (anonSaudePublica.data ?? []).length === 1,
    );

    const bInsereSaude = await B.client
      .from("dog_health_records")
      .insert({
        dog_id: caoPublicado!.id,
        kind: "vaccine",
        applied_on: "2026-08-15",
        product: "V8",
        created_by: B.id,
      })
      .select("id");
    record(
      "20. Exames genéticos",
      "B cadastra registro de saúde no cão de A",
      "recusado",
      describe(bInsereSaude.error, bInsereSaude.data ?? undefined),
      Boolean(bInsereSaude.error) || (bInsereSaude.data ?? []).length === 0,
    );

    const bEditaSaude = await B.client
      .from("dog_health_records")
      .update({ product: "adulterado" })
      .eq("id", saudePublicada!.id)
      .select("id");
    record(
      "20. Exames genéticos",
      "B edita registro de saúde do cão de A",
      "recusado (0 linhas)",
      describe(bEditaSaude.error, bEditaSaude.data ?? undefined),
      Boolean(bEditaSaude.error) || (bEditaSaude.data ?? []).length === 0,
    );

    const aEditaSaude = await A.client
      .from("dog_health_records")
      .update({ product: "Drontal Plus" })
      .eq("id", saudePublicada!.id)
      .select("id");
    record(
      "20. Exames genéticos",
      "A edita o PRÓPRIO registro de saúde",
      "1 linha",
      describe(aEditaSaude.error, aEditaSaude.data ?? undefined),
      !aEditaSaude.error && (aEditaSaude.data ?? []).length === 1,
    );

    const aApagaSaude = await A.client
      .from("dog_health_records")
      .delete()
      .eq("id", saudePublicada!.id)
      .select();
    record(
      "20. Exames genéticos",
      "A apaga fisicamente o próprio registro de saúde",
      "negado (42501)",
      describe(aApagaSaude.error, aApagaSaude.data ?? undefined),
      aApagaSaude.error?.code === "42501",
    );
  }

  // ---------------------------------------------------------------------------
  // Cenário 21 — admin cadastra cão, ninhada e filhote em nome de outro usuário
  //
  // `supabase/tests/battery.sql` (Grupo 10) já prova a regra inteira — de onde
  // vem `owner_id`, o teto de filhotes, a ninhada de canil errado, a herança de
  // publicação — mas roda como POSTGRES na mesma sessão SQL. Este cenário prova
  // só o que aquele NÃO alcança: a porta real. Chave publishable, sessão de B
  // (não-admin) tentando as duas RPCs novas e o INSERT direto que o buraco de
  // `owner_id` desta mesma migration fecha; sessão de ADMIN de verdade criando
  // para D; e — o requisito central do pedido — a sessão de D, o DONO,
  // funcionando normalmente depois. Sem esta última prova, "cadastrar em nome
  // de alguém" seria só um registro que passa no INSERT e que ninguém no
  // painel do dono consegue tocar.
  //
  // D é canil PRÓPRIO, sem cidade/estado/logo — mesma escolha do Grupo 10 da
  // bateria SQL, para não consumir um número real da sequence do selo Fundador
  // por um cadastro de teste.
  // ---------------------------------------------------------------------------

  const D = await createActor("d");

  const { data: kennelD, error: kennelDError } = await D.client
    .from("kennels")
    .insert({
      owner_id: D.id,
      created_by: D.id,
      name: "Canil Destino",
      slug: `rls-${RUN}-canil-destino`,
    })
    .select("id")
    .single();
  if (kennelDError || !kennelD) {
    throw new Error(`fixture obrigatória falhou: canil de destino: ${kennelDError?.message}`);
  }

  // Progenitores para a ninhada — próprios de D, sem vínculo com o canil
  // (sire_id/dam_id não são escopados a canil, e não é isto que este cenário
  // testa).
  const { data: paiDestino } = await D.client
    .from("dogs")
    .insert({ name: "Pai Destino", sex: "male", owner_id: D.id, created_by: D.id })
    .select("id")
    .single();
  const { data: maeDestino } = await D.client
    .from("dogs")
    .insert({ name: "Mae Destino", sex: "female", owner_id: D.id, created_by: D.id })
    .select("id")
    .single();

  // --- quem NÃO é admin continua recusado, pelas duas portas -----------------

  const bRpcDog = await B.client.rpc("admin_create_dog_for_kennel", {
    p_kennel_id: kennelD.id,
    p_name: "Tentativa Não-Admin",
    p_sex: "male",
    p_reason: "tentativa de usuário comum via RPC",
  });
  record(
    "21. Admin cadastra para outro usuário",
    "usuário comum chama admin_create_dog_for_kennel",
    "erro — insufficient_privilege",
    bRpcDog.error ? `erro: ${bRpcDog.error.message}` : "EXECUTOU — CÃO CADASTRADO SEM ADMIN",
    !!bRpcDog.error,
  );

  const bRpcLitter = await B.client.rpc("admin_create_litter_for_kennel", {
    p_kennel_id: kennelD.id,
    p_reason: "tentativa de usuário comum via RPC",
  });
  record(
    "21. Admin cadastra para outro usuário",
    "usuário comum chama admin_create_litter_for_kennel",
    "erro — insufficient_privilege",
    bRpcLitter.error
      ? `erro: ${bRpcLitter.error.message}`
      : "EXECUTOU — NINHADA CADASTRADA SEM ADMIN",
    !!bRpcLitter.error,
  );

  // Confirma pela chave secreta que as duas tentativas não gravaram nada —
  // mesmo formato do cenário 14.
  const { data: tentativaGravada } = await admin
    .from("dogs")
    .select("id")
    .eq("kennel_id", kennelD.id)
    .eq("name", "Tentativa Não-Admin");
  record(
    "21. Admin cadastra para outro usuário",
    "nada foi gravado pelas duas tentativas negadas",
    "0 linhas",
    `${tentativaGravada?.length ?? 0} linha(s)`,
    (tentativaGravada?.length ?? 0) === 0,
  );

  // O buraco que esta mesma migration fecha, agora pela porta real: B
  // cadastrando um cão com `owner_id` de OUTRA pessoa, sem passar por RPC
  // nenhuma.
  const bPlanta = await B.client
    .from("dogs")
    .insert({ name: "Rls Plantado", sex: "male", owner_id: A.id, created_by: B.id })
    .select("id");
  record(
    "21. Admin cadastra para outro usuário",
    "B cadastra cão com owner_id de outra pessoa, direto pela API",
    "negado (42501)",
    describe(bPlanta.error, bPlanta.data ?? undefined),
    bPlanta.error?.code === "42501",
  );

  // O que o cenário 19 já provava para NINHADA e faltava para CÃO: inserir num
  // canil que não é seu, direto pela API. `dogs_insert` só aceita `kennel_id`
  // de quem passa em `owns_kennel` ou é admin — B não é nenhum dos dois.
  const bNoCanilAlheio = await B.client
    .from("dogs")
    .insert({
      name: "Rls Invasor de Canil",
      sex: "male",
      kennel_id: kennelD.id,
      created_by: B.id,
      owner_id: B.id,
    })
    .select("id");
  record(
    "21. Admin cadastra para outro usuário",
    "B cadastra cão no canil de D, direto pela API",
    "negado (42501)",
    describe(bNoCanilAlheio.error, bNoCanilAlheio.data ?? undefined),
    bNoCanilAlheio.error?.code === "42501",
  );

  // --- admin SUSPENSO ---------------------------------------------------------
  //
  // Dentro de uma SECURITY DEFINER não sobra RLS: a cláusula
  // `not private.is_suspended()` que as policies carregam simplesmente não roda.
  // O guard `private.is_admin()` — que exige `suspended_at is null` — é a ÚNICA
  // barreira, e é ela que está sob teste.
  //
  // A suspensão é feita pela chave secreta, como FIXTURE: mesmo mecanismo que já
  // promove o ADMIN no cenário 14, não uma prova de acesso.
  const { error: suspendeAdminError } = await admin
    .from("profiles")
    .update({ suspended_at: new Date().toISOString() })
    .eq("id", ADMIN.id);
  if (suspendeAdminError) {
    throw new Error(`fixture obrigatória falhou: suspender admin: ${suspendeAdminError.message}`);
  }

  const rpcDogSuspenso = await ADMIN.client.rpc("admin_create_dog_for_kennel", {
    p_kennel_id: kennelD.id,
    p_name: "Rls Admin Suspenso",
    p_sex: "male",
    p_reason: "admin suspenso tentando cadastrar — caso de evidência",
  });
  record(
    "21. Admin cadastra para outro usuário",
    "admin SUSPENSO chama admin_create_dog_for_kennel",
    "erro — insufficient_privilege",
    rpcDogSuspenso.error
      ? `erro: ${rpcDogSuspenso.error.message}`
      : "EXECUTOU — SUSPENSÃO NÃO BARRA O ADMIN",
    !!rpcDogSuspenso.error,
  );

  const rpcLitterSuspenso = await ADMIN.client.rpc("admin_create_litter_for_kennel", {
    p_kennel_id: kennelD.id,
    p_reason: "admin suspenso tentando cadastrar — caso de evidência",
  });
  record(
    "21. Admin cadastra para outro usuário",
    "admin SUSPENSO chama admin_create_litter_for_kennel",
    "erro — insufficient_privilege",
    rpcLitterSuspenso.error
      ? `erro: ${rpcLitterSuspenso.error.message}`
      : "EXECUTOU — SUSPENSÃO NÃO BARRA O ADMIN",
    !!rpcLitterSuspenso.error,
  );

  // Reativa ANTES do resto: tudo abaixo depende de o ADMIN voltar a ser admin.
  const { error: reativaAdminError } = await admin
    .from("profiles")
    .update({ suspended_at: null })
    .eq("id", ADMIN.id);
  if (reativaAdminError) {
    throw new Error(`fixture obrigatória falhou: reativar admin: ${reativaAdminError.message}`);
  }

  // --- ADMIN de verdade cadastra para D ---------------------------------------

  const adminCriaCao = await ADMIN.client.rpc("admin_create_dog_for_kennel", {
    p_kennel_id: kennelD.id,
    p_name: "Rls Cadastrado Pelo Admin",
    p_sex: "male",
    p_reason: "cliente pediu por telefone — caso de evidência",
  });
  record(
    "21. Admin cadastra para outro usuário",
    "admin cadastra cão comum no canil de outro usuário",
    "sucesso — id devolvido",
    adminCriaCao.error ? `erro: ${adminCriaCao.error.message}` : `id ${adminCriaCao.data}`,
    !adminCriaCao.error && !!adminCriaCao.data,
  );
  const dogParaD = (adminCriaCao.data as string | null) ?? null;

  if (dogParaD) {
    const { data: dogGravado } = await admin
      .from("dogs")
      .select("owner_id, kennel_id, created_by")
      .eq("id", dogParaD)
      .single();
    const owoCorreto =
      dogGravado?.owner_id === D.id &&
      dogGravado?.kennel_id === kennelD.id &&
      dogGravado?.created_by === ADMIN.id;
    record(
      "21. Admin cadastra para outro usuário",
      "owner_id vem do canil de destino, created_by é o admin",
      `owner=${D.id} kennel=${kennelD.id} created_by=${ADMIN.id}`,
      `owner=${dogGravado?.owner_id} kennel=${dogGravado?.kennel_id} created_by=${dogGravado?.created_by}`,
      owoCorreto,
    );

    const { data: auditCao } = await admin
      .from("audit_log")
      .select("id, reason")
      .eq("entity_type", "dog")
      .eq("entity_id", dogParaD)
      .eq("action", "dog.create_for_user");
    record(
      "21. Admin cadastra para outro usuário",
      "cadastro do cão gera exatamente 1 linha de auditoria, com o motivo",
      "1 linha, motivo preservado",
      `${auditCao?.length ?? 0} linha(s), motivo: ${auditCao?.[0]?.reason ?? "NENHUM"}`,
      (auditCao?.length ?? 0) === 1 &&
        auditCao?.[0]?.reason === "cliente pediu por telefone — caso de evidência",
    );
  }

  const adminCriaNinhada = await ADMIN.client.rpc("admin_create_litter_for_kennel", {
    p_kennel_id: kennelD.id,
    p_reason: "criador pediu ajuda para cadastrar — caso de evidência",
    p_sire_id: paiDestino?.id,
    p_dam_id: maeDestino?.id,
  });
  record(
    "21. Admin cadastra para outro usuário",
    "admin cadastra ninhada no canil de outro usuário",
    "sucesso — id devolvido",
    adminCriaNinhada.error
      ? `erro: ${adminCriaNinhada.error.message}`
      : `id ${adminCriaNinhada.data}`,
    !adminCriaNinhada.error && !!adminCriaNinhada.data,
  );
  const litterParaD = (adminCriaNinhada.data as string | null) ?? null;

  if (litterParaD) {
    const { data: litterGravada } = await admin
      .from("kennel_litters")
      .select("created_by, published_at")
      .eq("id", litterParaD)
      .single();
    record(
      "21. Admin cadastra para outro usuário",
      "ninhada nasce SEMPRE rascunho — publicar continua sendo do dono",
      `created_by=${ADMIN.id} published_at=nulo`,
      `created_by=${litterGravada?.created_by} published_at=${litterGravada?.published_at ?? "nulo"}`,
      litterGravada?.created_by === ADMIN.id && litterGravada?.published_at === null,
    );

    const { data: auditNinhada } = await admin
      .from("audit_log")
      .select("id")
      .eq("entity_type", "litter")
      .eq("entity_id", litterParaD)
      .eq("action", "litter.create_for_user");
    record(
      "21. Admin cadastra para outro usuário",
      "cadastro da ninhada gera exatamente 1 linha de auditoria",
      "1 linha",
      `${auditNinhada?.length ?? 0} linha(s)`,
      (auditNinhada?.length ?? 0) === 1,
    );

    // Filhote dentro dessa ninhada: par e status vêm da ninhada, nunca do
    // parâmetro — `battery.sql` já prova isso exaustivamente; aqui só confirma
    // que a mesma regra vale quando a chamada entra pela API real.
    const adminCriaFilhote = await ADMIN.client.rpc("admin_create_dog_for_kennel", {
      p_kennel_id: kennelD.id,
      p_name: "Rls Filhote Pelo Admin",
      p_sex: "female",
      p_reason: "filhote cadastrado pelo admin — caso de evidência",
      p_litter_id: litterParaD,
    });
    const filhoteParaD = (adminCriaFilhote.data as string | null) ?? null;
    if (filhoteParaD) {
      const { data: filhoteGravado } = await admin
        .from("dogs")
        .select("litter_id, litter_status, sire_id, dam_id")
        .eq("id", filhoteParaD)
        .single();
      record(
        "21. Admin cadastra para outro usuário",
        "filhote cadastrado pelo admin herda par e status da ninhada",
        `litter=${litterParaD} status=available par=${paiDestino?.id}/${maeDestino?.id}`,
        `litter=${filhoteGravado?.litter_id} status=${filhoteGravado?.litter_status} ` +
          `sire=${filhoteGravado?.sire_id} dam=${filhoteGravado?.dam_id}`,
        filhoteGravado?.litter_id === litterParaD &&
          filhoteGravado?.litter_status === "available" &&
          filhoteGravado?.sire_id === paiDestino?.id &&
          filhoteGravado?.dam_id === maeDestino?.id,
      );
    } else {
      record(
        "21. Admin cadastra para outro usuário",
        "admin cadastra filhote na ninhada criada para D",
        "sucesso — id devolvido",
        adminCriaFilhote.error ? `erro: ${adminCriaFilhote.error.message}` : "sem id devolvido",
        false,
      );
    }
  }

  // --- O REQUISITO CENTRAL: o DONO, não o admin, controla o registro depois ---
  //
  // Sessão de D de verdade — não a chave secreta. Sem isto, tudo acima provaria
  // só que o INSERT funcionou, não que "o dono vê e edita normalmente" é
  // verdade pela porta que o painel dele realmente usa.
  if (dogParaD) {
    const dVeCao = await D.client.from("dogs").select("id").eq("id", dogParaD);
    record(
      "21. Admin cadastra para outro usuário",
      "D (dono) LÊ o cão que o admin cadastrou em nome dele",
      "1 linha",
      describe(dVeCao.error, dVeCao.data ?? undefined),
      !dVeCao.error && (dVeCao.data ?? []).length === 1,
    );

    const dEditaCao = await D.client
      .from("dogs")
      .update({ breed: "Atualizado pelo dono" })
      .eq("id", dogParaD)
      .select("id");
    record(
      "21. Admin cadastra para outro usuário",
      "D (dono) EDITA o cão que o admin cadastrou em nome dele",
      "1 linha",
      describe(dEditaCao.error, dEditaCao.data ?? undefined),
      !dEditaCao.error && (dEditaCao.data ?? []).length === 1,
    );
  }

  if (litterParaD) {
    const dEditaNinhada = await D.client
      .from("kennel_litters")
      .update({ description: "Atualizado pelo dono" })
      .eq("id", litterParaD)
      .select("id");
    record(
      "21. Admin cadastra para outro usuário",
      "D (dono) EDITA a ninhada que o admin cadastrou em nome dele",
      "1 linha",
      describe(dEditaNinhada.error, dEditaNinhada.data ?? undefined),
      !dEditaNinhada.error && (dEditaNinhada.data ?? []).length === 1,
    );
  }

  // ---------------------------------------------------------------------------
  // Cenário 22 — admin cadastra CANIL e MÍDIA, e PUBLICA, em nome do dono
  //
  // `supabase/tests/battery.sql` (Grupo 11) já prova a regra inteira, mas roda
  // como POSTGRES na mesma sessão SQL — e há uma coisa que ele NÃO consegue
  // alcançar de jeito nenhum: as policies de `storage.objects`. O upload não
  // passa por Postgres, vai do navegador direto para a API do Storage. Só aqui,
  // com chave publishable e sessão de verdade, dá para provar que a policy
  // alargada faz o que deve:
  //
  //   * quem NÃO é admin continua sem escrever no prefixo alheio;
  //   * o ADMIN escreve no prefixo do DONO — é o que a decisão de mídia exige;
  //   * o ADMIN **não** escreve num prefixo que não é de ninguém, que é a
  //     mitigação de `private.can_write_storage_prefix`. Sem ela, um caminho
  //     inventado viraria arquivo que `media:reconcile` nunca encontra (ele
  //     lista PELO PREFIXO DO DONO) e que consome plano até aparecer na fatura.
  //
  // E: usuário novo SEM canil, que é o caso que motivou a feature inteira — o
  // painel mostrava "Canis 0" e não oferecia nenhum primeiro passo.
  //
  // Nem o canil de E nem o de D recebem cidade/estado, então nenhum fica
  // elegível ao selo Fundador mesmo com o logo enviado abaixo — mesma escolha
  // dos cenários anteriores, para não queimar número real da sequence.
  // ---------------------------------------------------------------------------

  const E = await createActor("e");
  const CENARIO_22 = "22. Admin cadastra canil, mídia e publica";

  // --- quem NÃO é admin continua recusado, nas quatro portas novas -----------

  const bRpcKennel = await B.client.rpc("admin_create_kennel_for_user", {
    p_owner_id: E.id,
    p_name: "Canil Tentativa",
    p_slug: `rls-${RUN}-tentativa-comum`,
    p_reason: "tentativa de usuário comum via RPC",
  });
  record(
    CENARIO_22,
    "usuário comum chama admin_create_kennel_for_user",
    "erro — insufficient_privilege",
    bRpcKennel.error ? `erro: ${bRpcKennel.error.message}` : "EXECUTOU — CANIL CRIADO SEM ADMIN",
    !!bRpcKennel.error,
  );

  const bRpcMedia = await B.client.rpc("admin_register_media_for_user", {
    p_role: "kennel_logo",
    p_entity_id: kennelD.id,
    p_storage_path: `${D.id}/qualquer.png`,
    p_reason: "tentativa de usuário comum via RPC",
  });
  record(
    CENARIO_22,
    "usuário comum chama admin_register_media_for_user",
    "erro — insufficient_privilege",
    bRpcMedia.error ? `erro: ${bRpcMedia.error.message}` : "EXECUTOU — MÍDIA REGISTRADA SEM ADMIN",
    !!bRpcMedia.error,
  );

  const bRpcPubKennel = await B.client.rpc("admin_set_kennel_published", {
    p_kennel_id: kennelD.id,
    p_published: true,
    p_reason: "tentativa de usuário comum via RPC",
  });
  record(
    CENARIO_22,
    "usuário comum chama admin_set_kennel_published",
    "erro — insufficient_privilege",
    bRpcPubKennel.error
      ? `erro: ${bRpcPubKennel.error.message}`
      : "EXECUTOU — CANIL DE TERCEIRO PUBLICADO SEM ADMIN",
    !!bRpcPubKennel.error,
  );

  if (dogParaD) {
    const bRpcPubDog = await B.client.rpc("admin_set_dog_published", {
      p_dog_id: dogParaD,
      p_published: true,
      p_reason: "tentativa de usuário comum via RPC",
    });
    record(
      CENARIO_22,
      "usuário comum chama admin_set_dog_published",
      "erro — insufficient_privilege",
      bRpcPubDog.error
        ? `erro: ${bRpcPubDog.error.message}`
        : "EXECUTOU — CÃO DE TERCEIRO PUBLICADO SEM ADMIN",
      !!bRpcPubDog.error,
    );
  }

  // --- as policies de storage, que só existem nesta camada -------------------

  const logoPath = `${D.id}/kennel_logo/${kennelD.id}/logo-${RUN}.png`;

  const comumNoPrefixoAlheio = await B.client.storage
    .from(BUCKET)
    .upload(`${D.id}/kennel_logo/invasao-${RUN}.png`, PNG, { contentType: "image/png" });
  record(
    CENARIO_22,
    "usuário comum grava no prefixo de D (a policy alargou só para admin)",
    "erro de permissão",
    comumNoPrefixoAlheio.error
      ? `erro: ${comumNoPrefixoAlheio.error.message}`
      : "SUCESSO — PREFIXO INVADIDO POR NÃO-ADMIN",
    !!comumNoPrefixoAlheio.error,
  );

  const adminPrefixoInexistente = await ADMIN.client.storage
    .from(BUCKET)
    .upload(`00000000-0000-4000-8000-00000000dead/orfao-${RUN}.png`, PNG, {
      contentType: "image/png",
    });
  record(
    CENARIO_22,
    "admin grava sob prefixo que não é de nenhum perfil",
    "erro de permissão",
    adminPrefixoInexistente.error
      ? `erro: ${adminPrefixoInexistente.error.message}`
      : "SUCESSO — ARQUIVO ÓRFÃO QUE A RECONCILIAÇÃO NUNCA ACHA",
    !!adminPrefixoInexistente.error,
  );

  const adminNoPrefixoDoDono = await ADMIN.client.storage
    .from(BUCKET)
    .upload(logoPath, PNG, { contentType: "image/png" });
  record(
    CENARIO_22,
    "admin grava no prefixo do DONO (controle: precisa funcionar)",
    "sucesso",
    adminNoPrefixoDoDono.error ? `erro: ${adminNoPrefixoDoDono.error.message}` : "sucesso",
    !adminNoPrefixoDoDono.error,
  );

  // --- LER também é parte de escrever -----------------------------------------
  //
  // Estes quatro casos existem por causa de um bug que chegou em produção: a
  // primeira versão alargou INSERT/UPDATE/DELETE para admin e deixou o SELECT
  // intacto, "porque ler não é agir". Só que `statStorageObject` faz
  // `storage.list()` para reler mime e tamanho do que subiu, e `list` é SELECT —
  // então o upload passava e o registro seguinte falhava com "Arquivo não
  // encontrado no armazenamento", logo depois de um envio bem-sucedido.
  //
  // O Cenário 22 não pegou aquilo porque chamava a RPC DIRETO: ela é SECURITY
  // DEFINER e lê `storage.objects` com direitos de postgres, ignorando RLS.
  // Testava o lado errado da porta. Os casos abaixo testam o lado certo.
  const pastaDoLogo = logoPath.slice(0, logoPath.lastIndexOf("/"));

  const adminLista = await ADMIN.client.storage.from(BUCKET).list(pastaDoLogo);
  const achou = (adminLista.data ?? []).some((f) => logoPath.endsWith(f.name));
  record(
    CENARIO_22,
    "admin LISTA o prefixo do dono (é o que statStorageObject faz)",
    "encontra o arquivo que acabou de enviar",
    adminLista.error
      ? `erro: ${adminLista.error.message}`
      : achou
        ? "encontrou"
        : "lista vazia — SELECT NEGADO AO ADMIN",
    !adminLista.error && achou,
  );

  const adminBaixa = await ADMIN.client.storage.from(BUCKET).download(logoPath);
  record(
    CENARIO_22,
    "admin BAIXA arquivo sob o prefixo do dono",
    "sucesso",
    adminBaixa.error ? `erro: ${adminBaixa.error.message}` : "sucesso",
    !adminBaixa.error,
  );

  const comumLista = await B.client.storage.from(BUCKET).list(pastaDoLogo);
  record(
    CENARIO_22,
    "usuário comum lista o prefixo de D (o alargamento é só para admin)",
    "lista vazia ou erro",
    comumLista.error
      ? `erro: ${comumLista.error.message}`
      : `${(comumLista.data ?? []).length} item(ns)` +
        ((comumLista.data ?? []).length > 0 ? " — PREFIXO ALHEIO VISÍVEL" : ""),
    !!comumLista.error || (comumLista.data ?? []).length === 0,
  );

  const adminListaInexistente = await ADMIN.client.storage
    .from(BUCKET)
    .list("00000000-0000-4000-8000-00000000dead");
  record(
    CENARIO_22,
    "admin lista prefixo que não é de nenhum perfil",
    "lista vazia ou erro",
    adminListaInexistente.error
      ? `erro: ${adminListaInexistente.error.message}`
      : `${(adminListaInexistente.data ?? []).length} item(ns)` +
        ((adminListaInexistente.data ?? []).length > 0 ? " — PREFIXO INVENTADO VISÍVEL" : ""),
    !!adminListaInexistente.error || (adminListaInexistente.data ?? []).length === 0,
  );

  // O segundo caminho quebrado pelo mesmo bug: `reconcileMediaBucket` move o
  // arquivo entre buckets ao publicar, e move exige enxergar a origem. Sem
  // isto, publicar por admin QUALQUER registro com imagem falhava com "Não foi
  // possível preparar as imagens para o acesso público".
  const adminMove = await ADMIN.client.storage
    .from(BUCKET)
    .move(logoPath, logoPath, { destinationBucket: PUBLIC_BUCKET });
  record(
    CENARIO_22,
    "admin move arquivo do dono para o bucket público (o que publicar faz)",
    "sucesso",
    adminMove.error ? `erro: ${adminMove.error.message}` : "sucesso",
    !adminMove.error,
  );

  // De volta ao privado — é onde a RPC de mídia vai procurá-lo, e é o estado que
  // a limpeza no fim deste arquivo espera encontrar.
  if (!adminMove.error) {
    const adminMoveDeVolta = await ADMIN.client.storage
      .from(PUBLIC_BUCKET)
      .move(logoPath, logoPath, { destinationBucket: BUCKET });
    record(
      CENARIO_22,
      "admin devolve o arquivo ao privado (o que despublicar faz)",
      "sucesso",
      adminMoveDeVolta.error ? `erro: ${adminMoveDeVolta.error.message}` : "sucesso",
      !adminMoveDeVolta.error,
    );
  }

  // --- canil para quem ainda não tem nenhum ----------------------------------

  const adminCriaCanil = await ADMIN.client.rpc("admin_create_kennel_for_user", {
    p_owner_id: E.id,
    p_name: "Canil de E",
    p_slug: `rls-${RUN}-canil-de-e`,
    p_reason: "criador sem canil pediu ajuda — caso de evidência",
  });
  const canilParaE = (adminCriaCanil.data as string | null) ?? null;

  if (canilParaE) {
    const { data: canilGravado } = await admin
      .from("kennels")
      .select("owner_id, created_by, published_at")
      .eq("id", canilParaE)
      .single();
    record(
      CENARIO_22,
      "canil criado pelo admin pertence a E, com autoria do admin e em rascunho",
      `owner=${E.id} created_by=${ADMIN.id} published_at=null`,
      `owner=${canilGravado?.owner_id} created_by=${canilGravado?.created_by} ` +
        `published_at=${canilGravado?.published_at}`,
      canilGravado?.owner_id === E.id &&
        canilGravado?.created_by === ADMIN.id &&
        canilGravado?.published_at === null,
    );

    const segundoCanil = await ADMIN.client.rpc("admin_create_kennel_for_user", {
      p_owner_id: E.id,
      p_name: "Canil de E Bis",
      p_slug: `rls-${RUN}-canil-de-e-bis`,
      p_reason: "tentativa de segundo canil — caso de evidência",
    });
    record(
      CENARIO_22,
      "segundo canil para o mesmo dono (kennels_owner_uk)",
      "erro — unique_violation",
      segundoCanil.error
        ? `erro: ${segundoCanil.error.message}`
        : "EXECUTOU — DOIS CANIS VIVOS PARA O MESMO CRIADOR",
      !!segundoCanil.error,
    );

    // O REQUISITO CENTRAL, na sessão de E de verdade — não pela chave secreta.
    const eEditaCanil = await E.client
      .from("kennels")
      .update({ description: "Atualizado pelo dono" })
      .eq("id", canilParaE)
      .select("id");
    record(
      CENARIO_22,
      "E (dono) EDITA o canil que o admin criou em nome dele",
      "1 linha",
      describe(eEditaCanil.error, eEditaCanil.data ?? undefined),
      !eEditaCanil.error && (eEditaCanil.data ?? []).length === 1,
    );

    const adminPublica = await ADMIN.client.rpc("admin_set_kennel_published", {
      p_kennel_id: canilParaE,
      p_published: true,
      p_reason: "dono pediu para colocar no ar — caso de evidência",
    });
    const { data: canilPublicado } = await admin
      .from("kennels")
      .select("published_at")
      .eq("id", canilParaE)
      .single();
    record(
      CENARIO_22,
      "admin publica o canil de E, e a decisão fica na trilha",
      "published_at preenchido",
      adminPublica.error
        ? `erro: ${adminPublica.error.message}`
        : `published_at=${canilPublicado?.published_at}`,
      !adminPublica.error && !!canilPublicado?.published_at,
    );

    const { data: trilhaPublicacao } = await admin
      .from("audit_log")
      .select("actor_id, reason")
      .eq("action", "kennel.publish")
      .eq("entity_id", canilParaE);
    record(
      CENARIO_22,
      "publicação por admin gera 1 linha de auditoria identificando o admin",
      `1 linha, ator=${ADMIN.id}`,
      `${(trilhaPublicacao ?? []).length} linha(s), ator=${trilhaPublicacao?.[0]?.actor_id}`,
      (trilhaPublicacao ?? []).length === 1 && trilhaPublicacao?.[0]?.actor_id === ADMIN.id,
    );
  } else {
    record(
      CENARIO_22,
      "admin cria canil para usuário sem canil",
      "sucesso — id devolvido",
      adminCriaCanil.error ? `erro: ${adminCriaCanil.error.message}` : "sem id devolvido",
      false,
    );
  }

  // --- metadata da mídia: o dono sai da ENTIDADE ------------------------------

  const midiaPrefixoErrado = await ADMIN.client.rpc("admin_register_media_for_user", {
    p_role: "kennel_logo",
    p_entity_id: kennelD.id,
    p_storage_path: `${ADMIN.id}/kennel_logo/${kennelD.id}/logo-${RUN}.png`,
    p_reason: "caminho no prefixo do admin — caso de evidência",
  });
  record(
    CENARIO_22,
    "mídia com caminho no prefixo do ADMIN, e não do dono",
    "erro — check_violation",
    midiaPrefixoErrado.error
      ? `erro: ${midiaPrefixoErrado.error.message}`
      : "EXECUTOU — METADATA APONTANDO PARA ARQUIVO DE OUTRA PESSOA",
    !!midiaPrefixoErrado.error,
  );

  const adminRegistraMidia = await ADMIN.client.rpc("admin_register_media_for_user", {
    p_role: "kennel_logo",
    p_entity_id: kennelD.id,
    p_storage_path: logoPath,
    p_reason: "logo enviado pelo admin — caso de evidência",
  });
  const midiaParaD = (adminRegistraMidia.data as string | null) ?? null;

  if (midiaParaD) {
    const { data: midiaGravada } = await admin
      .from("media")
      .select("owner_id, created_by, mime, role")
      .eq("id", midiaParaD)
      .single();
    record(
      CENARIO_22,
      "mídia registrada pelo admin pertence ao DONO, com mime lido do Storage",
      `owner=${D.id} created_by=${ADMIN.id} mime=image/png`,
      `owner=${midiaGravada?.owner_id} created_by=${midiaGravada?.created_by} ` +
        `mime=${midiaGravada?.mime}`,
      midiaGravada?.owner_id === D.id &&
        midiaGravada?.created_by === ADMIN.id &&
        midiaGravada?.mime === "image/png",
    );
  } else {
    record(
      CENARIO_22,
      "admin registra logo em nome de D",
      "sucesso — id devolvido",
      adminRegistraMidia.error ? `erro: ${adminRegistraMidia.error.message}` : "sem id devolvido",
      false,
    );
  }

  // ---------------------------------------------------------------------------
  // Cenário 23 — cadastro assistido
  //
  // A bateria SQL (Grupo 12) prova a regra inteira, mas roda como POSTGRES, que
  // ignora RLS. Aqui é a porta real: chave publishable, sessão de verdade.
  //
  // O caso que justifica este cenário existir é o do `owner_id` da mídia. Quatro
  // fotos chegaram a produção gravadas no nome do ADMIN em vez do criador,
  // porque `registerMedia` estampava `user.id`. Nenhum teste pegou — a bateria
  // não passa pela Server Action, e o Cenário 22 chamava a RPC direto.
  // ---------------------------------------------------------------------------

  const CENARIO_23 = "23. Cadastro assistido";

  const comumAbreSessao = await B.client.rpc("admin_start_assist_session", {
    p_target_profile_id: A.id,
    p_reason: "tentativa de usuário comum",
  });
  record(
    CENARIO_23,
    "usuário comum abre cadastro assistido",
    "erro — insufficient_privilege",
    comumAbreSessao.error
      ? `erro: ${comumAbreSessao.error.message}`
      : "EXECUTOU — QUALQUER UM ASSISTE QUALQUER UM",
    !!comumAbreSessao.error,
  );

  // SEM sessão: é o estreitamento. Antes desta migration passava.
  const semSessao = await ADMIN.client
    .from("kennels")
    .update({ city: "Sem Sessao" })
    .eq("id", kennelA.id)
    .select("id");
  record(
    CENARIO_23,
    "admin SEM sessão edita o canil de A",
    "0 linhas — policy nega",
    semSessao.error
      ? `erro: ${semSessao.error.message}`
      : `${(semSessao.data ?? []).length} linha(s)` +
        ((semSessao.data ?? []).length > 0 ? " — ESCRITA SILENCIOSA CONTINUA" : ""),
    !!semSessao.error || (semSessao.data ?? []).length === 0,
  );

  const abre = await ADMIN.client.rpc("admin_start_assist_session", {
    p_target_profile_id: A.id,
    p_reason: "criador pediu ajuda — caso de evidência",
  });
  record(
    CENARIO_23,
    "admin abre cadastro assistido para A",
    "sucesso",
    abre.error ? `erro: ${abre.error.message}` : "sucesso",
    !abre.error,
  );

  if (!abre.error) {
    const comSessao = await ADMIN.client
      .from("kennels")
      .update({ city: "Com Sessao" })
      .eq("id", kennelA.id)
      .select("id");
    record(
      CENARIO_23,
      "admin COM sessão edita o canil de A",
      "1 linha",
      describe(comSessao.error, comSessao.data ?? undefined),
      !comSessao.error && (comSessao.data ?? []).length === 1,
    );

    // A sessão é de A, então o canil de D continua fora de alcance — é o que
    // separa "assistir alguém" de "poder tudo".
    const foraDoAlvo = await ADMIN.client
      .from("kennels")
      .update({ city: "Fora do Alvo" })
      .eq("id", kennelD.id)
      .select("id");
    record(
      CENARIO_23,
      "sessão de A NÃO alcança o canil de D",
      "0 linhas",
      foraDoAlvo.error
        ? `erro: ${foraDoAlvo.error.message}`
        : `${(foraDoAlvo.data ?? []).length} linha(s)` +
          ((foraDoAlvo.data ?? []).length > 0 ? " — SESSÃO VIROU PODER GERAL" : ""),
      !!foraDoAlvo.error || (foraDoAlvo.data ?? []).length === 0,
    );

    const { data: trilha } = await admin
      .from("audit_log")
      .select("actor_id, reason")
      .eq("action", "kennel.assist_write")
      .eq("entity_id", kennelA.id);
    record(
      CENARIO_23,
      "escrita sob sessão vira trilha com o motivo da sessão",
      `>=1 linha, ator=${ADMIN.id}`,
      `${(trilha ?? []).length} linha(s), ator=${trilha?.[0]?.actor_id}, motivo=${String(trilha?.[0]?.reason ?? "").slice(0, 18)}`,
      (trilha ?? []).length >= 1 &&
        trilha?.[0]?.actor_id === ADMIN.id &&
        String(trilha?.[0]?.reason ?? "").startsWith("criador pediu ajuda"),
    );

    // O CASO QUE FALTAVA. O admin sobe uma foto no cão de A pelo caminho do
    // DONO — o mesmo que produziu as quatro linhas erradas em produção — e a
    // mídia tem de nascer no nome de A, não no dele.
    const fotoPath = `${A.id}/caes/${dogAPub.id}/assistido-${RUN}.png`;
    const subiu = await ADMIN.client.storage
      .from(BUCKET)
      .upload(fotoPath, PNG, { contentType: "image/png" });

    if (!subiu.error) {
      const registro = await ADMIN.client
        .from("media")
        .insert({
          bucket_id: BUCKET,
          storage_path: fotoPath,
          dog_id: dogAPub.id,
          role: "dog_gallery",
          mime: "image/png",
          size_bytes: PNG.length,
          owner_id: A.id,
          created_by: ADMIN.id,
        })
        .select("id, owner_id");
      record(
        CENARIO_23,
        "mídia gravada sob sessão nasce com owner_id do CRIADOR",
        `1 linha, owner=${A.id}`,
        registro.error
          ? `erro: ${registro.error.message}`
          : `owner=${registro.data?.[0]?.owner_id}`,
        !registro.error && registro.data?.[0]?.owner_id === A.id,
      );

      // E a policy recusa gravar a mesma mídia no nome do ADMIN: é a linha que
      // teria impedido o defeito de produção, e não só corrigido depois.
      const noNomeErrado = await ADMIN.client
        .from("media")
        .insert({
          bucket_id: BUCKET,
          storage_path: fotoPath,
          dog_id: dogAPub.id,
          role: "dog_gallery",
          mime: "image/png",
          size_bytes: PNG.length,
          owner_id: ADMIN.id,
          created_by: ADMIN.id,
        })
        .select("id");
      record(
        CENARIO_23,
        "mídia em cão de A no nome do ADMIN é recusada",
        "erro — policy nega",
        noNomeErrado.error
          ? `erro: ${noNomeErrado.error.message}`
          : "ACEITOU — MÍDIA DE TERCEIRO NO NOME DO ADMIN",
        !!noNomeErrado.error,
      );
    }

    const encerra = await ADMIN.client.rpc("admin_end_assist_session");
    const depoisDeEncerrar = await ADMIN.client
      .from("kennels")
      .update({ city: "Depois de Encerrar" })
      .eq("id", kennelA.id)
      .select("id");
    record(
      CENARIO_23,
      "encerrada a sessão, a escrita volta a ser negada",
      "0 linhas",
      encerra.error
        ? `erro ao encerrar: ${encerra.error.message}`
        : `${(depoisDeEncerrar.data ?? []).length} linha(s)` +
          ((depoisDeEncerrar.data ?? []).length > 0 ? " — SESSÃO NÃO FECHOU" : ""),
      !encerra.error &&
        (!!depoisDeEncerrar.error || (depoisDeEncerrar.data ?? []).length === 0),
    );
  }

  // O CONTRASTE que impede o falso positivo: o dono continua editando o próprio
  // canil, sem sessão nenhuma. Sem ele, uma policy que negasse todo mundo
  // passaria em metade deste cenário.
  const donoSemSessao = await A.client
    .from("kennels")
    .update({ city: "Editado Pelo Dono" })
    .eq("id", kennelA.id)
    .select("id");
  record(
    CENARIO_23,
    "o DONO edita o próprio canil sem sessão (controle)",
    "1 linha",
    describe(donoSemSessao.error, donoSemSessao.data ?? undefined),
    !donoSemSessao.error && (donoSemSessao.data ?? []).length === 1,
  );

  // ---------------------------------------------------------------------------
  // Limpeza
  //
  // POR POSSE, não por padrão de slug — e esta distinção não é estilo.
  //
  // A versão anterior apagava cães por `slug like 'rls-<RUN>-%'`. Os cães do
  // cenário 11b são inseridos SEM slug, então sobreviviam; o delete de canis
  // apanhava de `dogs.kennel_id ON DELETE RESTRICT`, o `deleteUser` apanhava de
  // `kennels.owner_id RESTRICT`, e NADA disso era conferido — nenhum daqueles
  // `.delete()` olhava o `error`. A execução terminava verde deixando até 5
  // canis vivos do mesmo dono por trás, e foi assim que o projeto de dev
  // acumulou 14 donos com canil duplicado.
  //
  // Agora cada passo é verificado e a falha aparece. Ordem obrigatória, igual à
  // que `e2e/support/admin.ts` já documenta.
  // ---------------------------------------------------------------------------

  const atores = [A, B, C, S, U, ADMIN, D, E, ...founders];
  const ids = atores.map((a) => a.id);

  await admin.storage
    .from(BUCKET)
    .remove([
      `${A.id}/de-a-${RUN}.png`,
      `${B.id}/proprio-${RUN}.png`,
      // Cenário 22: o logo que o ADMIN gravou sob o prefixo de D. Sem esta
      // linha o arquivo sobrevive à execução, e como `media:reconcile` lista
      // pelo prefixo do dono ele apareceria como resíduo de um dono que já foi
      // apagado.
      `${D.id}/kennel_logo/${kennelD.id}/logo-${RUN}.png`,
      // Cenário 23: a foto que o ADMIN gravou sob o prefixo de A durante a
      // sessão de cadastro assistido.
      `${A.id}/caes/${dogAPub.id}/assistido-${RUN}.png`,
    ]);

  /**
   * Roda um passo da limpeza e AVISA quando ele falha, em vez de engolir.
   *
   * `PromiseLike` e não `Promise`: o builder do PostgREST é thenable, mas não
   * implementa `catch`/`finally`.
   */
  async function limpar(rotulo: string, run: () => PromiseLike<{ error: unknown }>): Promise<void> {
    const { error } = await run();
    if (error) {
      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      console.warn(`  ⚠ limpeza incompleta em "${rotulo}": ${msg}`);
    }
  }

  // Metadata de mídia criada pelos cenários. Sem isto, cada execução deixa
  // linhas órfãs — a linha existe e o arquivo nunca foi enviado — e o
  // `media:reconcile` passa a relatar resíduo de teste como problema.
  await limpar("media", () =>
    admin
      .from("media")
      .delete()
      .or(`storage_path.like.%${RUN}%,owner_id.in.(${ids.join(",")})`),
  );
  await limpar("dog_identifiers", () =>
    admin.from("dog_identifiers").delete().like("value", `RLS-${RUN}-%`),
  );

  // `dog_videos.dog_id` é ON DELETE RESTRICT: uma linha de vídeo sobrevivente
  // faria o DELETE de `dogs` abaixo falhar, e a partir daí a cadeia inteira
  // (kennels, deleteUser) desmoronaria — o mesmo estrago que a limpeza por
  // slug já causou uma vez.
  await limpar("dog_videos", () =>
    admin.from("dog_videos").delete().in("owner_id", ids),
  );

  // Zera o parentesco antes de apagar: cão que é pai de outro cão do lote
  // bloquearia o próprio DELETE.
  // A NINHADA FICA NO MEIO DOS CÃES, e as duas metades são obrigatórias por FKs
  // que apontam em sentidos OPOSTOS — as duas são ON DELETE RESTRICT:
  //
  //   dogs.litter_id         -> kennel_litters   o FILHOTE sai antes da ninhada
  //   kennel_litters.sire_id -> dogs             a NINHADA sai antes do pai/mãe
  //   kennel_litters.dam_id  -> dogs
  //
  // Apagar todos os cães de uma vez e só então as ninhadas trava nas duas
  // pontas: o progenitor não sai porque a ninhada o referencia, e a ninhada não
  // sai porque o filhote a referencia. Como um DELETE que falha não apaga NADA,
  // a cadeia inteira desmorona a partir daí — `kennels` e `deleteUser` incluídos.
  //
  // Foi exatamente isso que aconteceu na primeira execução real do cenário 21:
  // ele é o primeiro a criar ninhada COM progenitores E filhote no mesmo lote.
  // `supabase/tests/battery.sql` já documenta esta mesma ordem em três etapas.
  await limpar("dogs (filhotes)", () =>
    admin
      .from("dogs")
      .delete()
      .not("litter_id", "is", null)
      .or(`owner_id.in.(${ids.join(",")}),created_by.in.(${ids.join(",")})`),
  );

  // `kennel_litters.kennel_id` também é ON DELETE RESTRICT — mesma classe de
  // problema que `dog_videos` já documenta acima. `created_by`, não
  // `owner_id`: a tabela não tem coluna de posse própria.
  await limpar("kennel_litters", () =>
    admin.from("kennel_litters").delete().in("created_by", ids),
  );

  // Zera o parentesco antes de apagar: cão que é pai de outro cão do lote
  // bloquearia o próprio DELETE.
  //
  // DEPOIS dos filhotes, e com `litter_id is null`: `dogs_check_litter_parents`
  // recusa um filhote cujo par divirja do par da ninhada, então zerar sire/dam
  // de um filhote levanta 23514 — e como o UPDATE é tudo-ou-nada, um único
  // filhote no lote fazia o passo inteiro falhar e nenhum parentesco era zerado.
  await limpar("dogs (parentesco)", () =>
    admin
      .from("dogs")
      .update({ sire_id: null, dam_id: null })
      .is("litter_id", null)
      .or(`owner_id.in.(${ids.join(",")}),created_by.in.(${ids.join(",")})`),
  );

  await limpar("dogs", () =>
    admin
      .from("dogs")
      .delete()
      .or(`owner_id.in.(${ids.join(",")}),created_by.in.(${ids.join(",")})`),
  );
  // Cinto: cão de slug do lote que não tenha caído nos filtros acima.
  await limpar("dogs (slug)", () => admin.from("dogs").delete().like("slug", `rls-${RUN}-%`));

  await limpar("kennels", () => admin.from("kennels").delete().in("owner_id", ids));

  // `audit_log.actor_id` é ON DELETE RESTRICT DE PROPÓSITO (trilha de
  // auditoria com ator apagado não é trilha — ver a migration do painel
  // admin). Desde o cenário 15, ADMIN realmente age (suspende/reativa B), e
  // sem este passo `deleteUser(ADMIN.id)` falharia toda execução daqui em
  // diante — hard delete aqui é a mesma exceção consciente que `dogs`/
  // `kennels` já usam para fixture de teste, não a invariante de exclusão
  // lógica do produto.
  // `admin_id` e `target_profile_id` são ON DELETE RESTRICT — as sessões saem
  // antes dos perfis, mesma razão do `audit_log` logo abaixo.
  await limpar("admin_assist_sessions", () =>
    admin
      .from("admin_assist_sessions")
      .delete()
      .or(`admin_id.in.(${ids.join(",")}),target_profile_id.in.(${ids.join(",")})`),
  );

  await limpar("audit_log", () => admin.from("audit_log").delete().in("actor_id", ids));

  // `profiles` some por CASCADE de auth.users. Os canis já saíram, então o
  // RESTRICT de `kennels.owner_id` não bloqueia mais.
  for (const ator of atores) {
    await limpar(`usuário ${ator.email}`, () => admin.auth.admin.deleteUser(ator.id));
  }
  if (hostile?.user) await admin.auth.admin.deleteUser(hostile.user.id);
  if (oauthUser?.user) await admin.auth.admin.deleteUser(oauthUser.user.id);
}

// -----------------------------------------------------------------------------
// Saída
// -----------------------------------------------------------------------------

function writeReport(fatal?: string) {
  const failed = checks.filter((c) => c.status === "FAIL");
  // Separado de propósito: `checks.length - failed.length` contaria PULADO como
  // aprovado, e o cabeçalho anunciaria uma cobertura que não houve.
  const passed = checks.filter((c) => c.status === "PASS");
  const skipped = checks.filter((c) => c.status === "PULADO");
  const when = new Date().toISOString();

  const md = [
    `# OrigemX — Evidência de RLS`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Data | ${when} |`,
    `| Projeto | \`${URL}\` |`,
    `| Execução | \`${RUN}\` |`,
    `| Resultado | **${failed.length === 0 && !fatal ? "APROVADO" : "REPROVADO"}** — ${passed.length}/${checks.length} PASS${skipped.length ? `, ${skipped.length} PULADO` : ""} |`,
    ``,
    fatal ? `> **ERRO FATAL:** ${fatal}\n` : ``,
    // A lacuna vai no CABEÇALHO, não enterrada na tabela: quem assina o
    // documento precisa ver o que não foi verificado antes de ver o "APROVADO".
    ...(skipped.length
      ? [
          `> ⚠️ **${skipped.length} verificação(ões) PULADA(S).** Esta execução não`,
          `> cobre a bateria inteira — ver as linhas marcadas \`PULADO\` na tabela,`,
          `> com o motivo de cada uma.`,
          ``,
        ]
      : []),
    `## Método`,
    ``,
    `Usuários reais e um cliente anônimo, falando com a API REST do Supabase pela`,
    `chave publishable — a mesma porta que um atacante usaria. Nada passa pela`,
    `interface. A chave secreta é usada apenas para criar e destruir as fixtures,`,
    `nunca para provar acesso.`,
    ``,
    `São vários atores porque a invariante exige: um criador tem no máximo **um`,
    `canil vivo** (\`kennels_owner_uk\`), então cada canil que o roteiro precisa`,
    `manter ao mesmo tempo tem dono próprio. A corrida do selo Fundador, em`,
    `particular, roda com um usuário por canil — contenção entre sessões`,
    `distintas, que é o modelo real de produção.`,
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
    const rotulo = { PASS: "  PASS", FAIL: "  FAIL", PULADO: "  PULA" }[c.status];
    console.log(`${rotulo}  ${c.cenario} — ${c.verificacao}`);
    if (c.status === "FAIL")
      console.log(`        esperado: ${c.esperado}\n        obtido:   ${c.obtido}`);
  }
  console.log(
    `\n${passed.length}/${checks.length} PASS` +
      (skipped.length ? ` · ${skipped.length} PULADO` : "") +
      ` · relatório em reports/rls-report.md\n`,
  );

  return failed.length === 0 && !fatal;
}

main()
  .then(() => process.exit(writeReport() ? 0 : 1))
  .catch((err: unknown) => {
    process.exit(writeReport(err instanceof Error ? err.message : String(err)) ? 0 : 1);
  });
