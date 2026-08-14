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

  const atores = [A, B, C, S, U, ADMIN, ...founders];
  const ids = atores.map((a) => a.id);

  await admin.storage
    .from(BUCKET)
    .remove([`${A.id}/de-a-${RUN}.png`, `${B.id}/proprio-${RUN}.png`]);

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
  await limpar("dogs (parentesco)", () =>
    admin
      .from("dogs")
      .update({ sire_id: null, dam_id: null })
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
