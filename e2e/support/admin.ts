import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/**
 * ============================================================================
 * Criação e destruição de dados de teste, pela chave secreta.
 * ============================================================================
 *
 * Só o processo de teste usa isto — nunca a aplicação. É como cada cenário
 * nasce do zero: usuário próprio, canil próprio, cão próprio. Nenhum teste
 * depende de dado que já estava no banco, e por isso a suíte roda contra um
 * banco vazio ou contra um cheio sem mudar de resultado.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL_ || !PUBLISHABLE || !SECRET) {
  throw new Error(
    "E2E precisa de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e " +
      "SUPABASE_SECRET_KEY em .env.local.",
  );
}

export const SUPABASE_URL = URL_;
export const PROJECT_REF = new URL(URL_).hostname.split(".")[0]!;

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(URL_!, SECRET!, { auth: { persistSession: false } });
}

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(URL_!, PUBLISHABLE!, { auth: { persistSession: false } });
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

/** Senha longa o bastante para o mínimo do servidor de Auth (8). */
export const SENHA_PADRAO = "Senha-De-Teste-123";

/**
 * E-mail único para conta criada pela API de ADMIN.
 *
 * `example.test` é TLD reservado pela RFC 2606 — não existe, não resolve, e não
 * há risco de um e-mail de teste sair para o mundo se alguém ligar SMTP.
 */
export function emailDeTeste(prefixo: string): string {
  return `e2e-${prefixo}-${token()}@example.test`;
}

/**
 * E-mail para cadastro pela TELA, que é outro caminho e outra validação.
 *
 * O Supabase valida o domínio no `signUp` público e **recusa `.test`** com
 * `email_address_invalid` — a API de admin aceita, o cadastro público não.
 * `example.com` é domínio real e reservado pela RFC 2606, então passa na
 * validação e continua sendo endereço que não entrega para ninguém.
 */
export function emailDeCadastro(prefixo: string): string {
  return `e2e-${prefixo}-${token()}@example.com`;
}

function token(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Usuário já confirmado.
 *
 * `email_confirm: true` porque a confirmação por e-mail está LIGADA no projeto:
 * um cadastro comum não devolve sessão, fica esperando o link. Os testes que
 * não são sobre cadastro precisam de alguém que já passou por isso.
 */
export async function criarUsuario(prefixo: string): Promise<TestUser> {
  const admin = adminClient();
  const email = emailDeTeste(prefixo);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA_PADRAO,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Não consegui criar usuário de teste: ${error?.message}`);
  }

  return { id: data.user.id, email, password: SENHA_PADRAO };
}

/**
 * Remove tudo que o usuário criou, e só então o usuário.
 *
 * A ORDEM NÃO É DETALHE:
 *
 * 1. `dogs.sire_id`/`dam_id` são RESTRICT — apagar um cão que é pai de outro é
 *    recusado. Solta o vínculo primeiro.
 * 2. `dogs.kennel_id` também é RESTRICT — cão sai antes do canil.
 * 3. `dogs.owner_id` é SET NULL. Se o usuário fosse apagado antes dos cães, eles
 *    ficariam sem dono E sem canil, que é exatamente a definição de ancestral
 *    fantasma — e fantasma é PUBLICAMENTE LEGÍVEL. A suíte encheria o banco de
 *    cães de teste visíveis para qualquer visitante.
 *
 * DELETE físico, e é exceção consciente à invariante de exclusão lógica: são
 * fixtures. Milhares de linhas com `deleted_at` não seriam limpeza, seriam lixo
 * permanente enviesando as próximas medições.
 */
export async function limparUsuario(userId: string): Promise<void> {
  const admin = adminClient();

  await admin.from("media").delete().eq("owner_id", userId);
  await admin.from("dogs").update({ sire_id: null, dam_id: null }).eq("created_by", userId);
  await admin.from("dogs").update({ sire_id: null, dam_id: null }).eq("owner_id", userId);
  await admin.from("dogs").delete().eq("created_by", userId);
  await admin.from("dogs").delete().eq("owner_id", userId);
  await admin.from("kennels").delete().eq("owner_id", userId);
  await admin.auth.admin.deleteUser(userId);
}

/**
 * Cookie de sessão no formato que o `@supabase/ssr` lê.
 *
 * Entrar pela tela de login em todo teste custaria segundos por cenário e
 * testaria login vinte vezes em vez de uma. Login TEM teste próprio; os demais
 * cenários começam já autenticados.
 */
export async function cookieDeSessao(user: TestUser) {
  const { data, error } = await anonClient().auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error || !data.session) {
    throw new Error(`Não consegui abrir sessão de teste: ${error?.message}`);
  }

  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;

  return {
    name: `sb-${PROJECT_REF}-auth-token`,
    value,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  };
}
