"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/auth/queries";

import { resolveHideReason, resolveSuspendReason } from "./format";

/**
 * Server Actions do painel administrativo — a primeira mutação real do
 * módulo. Toda função aqui abre chamando `requireAdmin()`, mesmo contrato já
 * registrado em `src/modules/README.md`: o layout de `/admin` já é o portão,
 * mas nenhuma Server Action deste projeto confia nisso sozinha — é o mesmo
 * padrão que `createDog`/`createKennel`/`publishKennel` já seguem com
 * `requireUser()`.
 */

export type SuspendState = {
  error?: string;
  ok?: boolean;
};

/**
 * Suspende ou reativa um usuário. A REGRA fica inteira em
 * `admin_set_profile_suspended` (RLS + `auth.users.banned_until` +
 * `audit_log`, tudo numa transação só) — este Server Action só chama a RPC
 * com sessão de admin e traduz o resultado para a tela.
 *
 * Auto-suspensão nem chega aqui: a UI não oferece o botão na própria linha
 * (mesma filosofia de `getManageableDogById` — "oferecer o controle já é
 * erro"). Se mesmo assim a chamada chegar, a RPC recusa e `error.message` já
 * vem em português, pronto para a tela.
 */
export async function setProfileSuspended(formData: FormData): Promise<SuspendState> {
  await requireAdmin();

  const profileId = String(formData.get("profileId") ?? "");
  const suspend = formData.get("suspend") === "true";
  const reason = resolveSuspendReason(String(formData.get("reason") ?? ""), suspend);

  if (!profileId) return { error: "Usuário não identificado." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_profile_suspended", {
    p_profile_id: profileId,
    p_suspended: suspend,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  revalidatePath(`/admin/usuarios/${profileId}`);
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export type HideState = {
  error?: string;
  ok?: boolean;
};

/**
 * Oculta ou reativa um canil ou cão. Mesma forma de `setProfileSuspended`,
 * generalizada sobre as duas RPCs (`admin_set_kennel_hidden` /
 * `admin_set_dog_hidden`) — ambas seguem o molde idêntico de
 * `admin_set_profile_suspended`: checam admin, são idempotentes, e auditam
 * `{de, para}` na mesma transação.
 *
 * Também é o mecanismo de "corrigir duplicidade": não existe ação separada
 * para isso — o admin oculta o registro duplicado por aqui, escrevendo no
 * motivo qual é o outro registro. Fica em `audit_log`, aparece no Histórico,
 * sem tabela nem tela novas.
 */
export async function setEntityHidden(formData: FormData): Promise<HideState> {
  await requireAdmin();

  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const hide = formData.get("hide") === "true";
  const reason = resolveHideReason(String(formData.get("reason") ?? ""), hide);

  if (!entityId) return { error: "Registro não identificado." };

  const supabase = await createClient();
  const { error } =
    entityType === "dog"
      ? await supabase.rpc("admin_set_dog_hidden", {
          p_dog_id: entityId,
          p_hidden: hide,
          p_reason: reason,
        })
      : await supabase.rpc("admin_set_kennel_hidden", {
          p_kennel_id: entityId,
          p_hidden: hide,
          p_reason: reason,
        });

  if (error) return { error: error.message };

  const base = entityType === "dog" ? "/admin/caes" : "/admin/canis";
  revalidatePath(`${base}/${entityId}`);
  revalidatePath(base);
  return { ok: true };
}

export type FounderNumberState = {
  error?: string;
  ok?: boolean;
};

/**
 * Corrige o número do selo Fundador de um canil. Diferente de suspender/
 * ocultar, o motivo é OBRIGATÓRIO aqui — sem `resolveXReason`, sem padrão:
 * o campo é `required` na tela, e se algo escapar disso `private.audit()`
 * já recusa motivo curto com mensagem em português.
 *
 * A regra fica inteira em `admin_set_founder_number` — unicidade pelo
 * índice (mensagem pronta quando o número já pertence a outro canil),
 * escotilha do trigger de imutabilidade aberta e fechada num só statement,
 * auditoria `{de, para}` na mesma transação.
 */
export async function setFounderNumber(formData: FormData): Promise<FounderNumberState> {
  await requireAdmin();

  const kennelId = String(formData.get("kennelId") ?? "");
  const number = Number(formData.get("number"));
  const reason = String(formData.get("reason") ?? "");

  if (!kennelId) return { error: "Canil não identificado." };
  if (!Number.isInteger(number)) return { error: "Número inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_founder_number", {
    p_kennel_id: kennelId,
    p_number: number,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  revalidatePath(`/admin/canis/${kennelId}`);
  revalidatePath("/admin/canis");
  revalidatePath("/admin/selo-fundador");
  return { ok: true };
}
