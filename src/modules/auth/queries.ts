import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Leitura de sessão. SEMPRE no servidor.
 *
 * Nada aqui pode ser importado por um componente client: o caminho passa por
 * `@/lib/supabase/server`, que usa `next/headers`, e o build quebra se alguém
 * tentar. É a mesma proteção que o pacote `server-only` daria, sem a dependência.
 *
 * E vale repetir o que o CLAUDE.md fixa: isto identifica o usuário, não o
 * autoriza. Quem decide o que ele pode ver é a RLS, no banco.
 */

export type AuthUser = {
  id: string;
  email: string | null;
};

/**
 * Usuário da sessão, ou null.
 *
 * `getClaims()` valida a assinatura do JWT em vez de confiar no conteúdo do
 * cookie — é o que separa "li um cookie" de "sei quem é".
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}

/**
 * Exige sessão. Sem ela, manda para o login guardando o destino.
 *
 * O proxy já barra a rota antes de chegar aqui, mas aquilo é checagem otimista
 * de borda. Esta é a que vale: roda no request do próprio componente, depois de
 * qualquer rewrite, e é o que garante que uma página privada nunca renderize
 * sem sessão.
 */
export async function requireUser(nextPath: string): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export type Profile = {
  id: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  state: string | null;
};

/**
 * Profile do usuário logado.
 *
 * A RLS já restringe a linha; o filtro por id é para a consulta estar certa,
 * não para proteger — a distinção está em src/modules/README.md.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name, avatar_url, city, state")
    .eq("id", user.id)
    .maybeSingle();

  return data;
}
