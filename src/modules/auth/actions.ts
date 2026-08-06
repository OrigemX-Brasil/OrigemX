"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { notificarEvento } from "@/lib/notify";

import { createClient } from "@/lib/supabase/server";
import { normalizeSource, SOURCE_PARAM } from "@/modules/capture/events";
import { recordEvent } from "@/modules/capture/queries";
import { registrarAuthError, tratarAuthError } from "@/modules/auth/errors";
import { sanitizeNext } from "@/modules/auth/redirect";

/**
 * Server Actions de autenticação.
 *
 * Tudo roda no servidor: a senha nunca é manipulada por código de client, e a
 * sessão é gravada em cookie httpOnly pelo `@supabase/ssr`.
 */

export type ActionState = {
  error?: string;
  message?: string;
};

/** Origem canônica. Precisa bater com auth.additional_redirect_urls no config.toml. */
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

const MIN_PASSWORD = 8;

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

// -----------------------------------------------------------------------------
// Cadastro
// -----------------------------------------------------------------------------

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { email, password } = readCredentials(formData);
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email) return { error: "Informe o e-mail." };
  if (password.length < MIN_PASSWORD) {
    return { error: `A senha precisa ter ao menos ${MIN_PASSWORD} caracteres.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Vira raw_user_meta_data.full_name, que o trigger handle_new_user lê.
      // `role` jamais entra aqui: metadata é editável pelo usuário, e o banco
      // força 'user' no INSERT de qualquer jeito.
      data: fullName ? { full_name: fullName } : undefined,
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/painel`,
    },
  });

  if (error) return { error: tratarAuthError("signUp", error) };

  // Aviso interno para a equipe. `after` põe isto DEPOIS da resposta: uma
  // chamada ao Resend somaria centenas de milissegundos ao cadastro, e quem
  // acabou de se inscrever não pode esperar por e-mail que não é dele.
  //
  // Só o nome e o id opaco atravessam — o tipo de `EventoInterno` não tem onde
  // encaixar e-mail, telefone ou documento.
  if (data.user) {
    const { id } = data.user;
    after(async () => {
      try {
        await notificarEvento({
          tipo: "conta-criada",
          nome: fullName || null,
          origem: "email",
          id,
        });
      } catch {
        // `notificarEvento` já não propaga. Este catch é a segunda barreira:
        // nada aqui pode transformar um cadastro bem-sucedido em erro na tela.
      }
    });
  }

  // Conversão do Anexo I.11. Grava só a ORIGEM — nem o e-mail, nem o id do
  // usuário, nem horário além do timestamp da linha. Não dá para ligar este
  // registro à conta que acabou de nascer, e é assim de propósito.
  //
  // Depois do sucesso, e sem `await` bloqueando decisão: a conta já existe, e
  // uma métrica que falhe não pode virar mensagem de erro para quem se cadastrou.
  await recordEvent("signup", normalizeSource(String(formData.get(SOURCE_PARAM) ?? "")));

  // Com confirmação de e-mail ligada, signUp NÃO devolve sessão. A tela precisa
  // dizer isso, senão o usuário fica esperando um login que não vem.
  return {
    message:
      "Cadastro criado. Enviamos um link de confirmação para o seu e-mail — " +
      "abra o link para ativar a conta.",
  };
}

// -----------------------------------------------------------------------------
// Login
// -----------------------------------------------------------------------------

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { email, password } = readCredentials(formData);
  const next = sanitizeNext(formData.get("next"));

  if (!email || !password) return { error: "Informe e-mail e senha." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: tratarAuthError("signIn", error) };

  revalidatePath("/", "layout");
  redirect(next);
}

// -----------------------------------------------------------------------------
// Google
// -----------------------------------------------------------------------------

export async function signInWithGoogle(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const next = sanitizeNext(formData.get("next"));
  const supabase = await createClient();

  // Nenhuma credencial aparece aqui. client_id e secret vivem no projeto
  // Supabase, alimentados por env var no config.toml — trocar dev por cliente
  // não toca este arquivo.
  // A origem viaja no `redirectTo` porque o OAuth sai do site e volta: sem
  // carregá-la na URL, o retorno perderia a campanha e todo cadastro por Google
  // cairia em "direto". É um rótulo curto e público — nada pessoal atravessa.
  const source = normalizeSource(String(formData.get(SOURCE_PARAM) ?? ""));
  const callback =
    `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` +
    `&${SOURCE_PARAM}=${encodeURIComponent(source)}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback },
  });

  if (error || !data?.url) {
    // A mensagem ao usuário continua a mesma — o provedor externo não deve
    // vazar detalhe para a tela. Mas o log passa a existir: sem ele, "não foi
    // possível iniciar" era tudo o que sobrava para investigar.
    registrarAuthError("signInWithGoogle", error ?? { message: "signInWithOAuth sem data.url" });
    return { error: "Não foi possível iniciar o login com Google. Tente novamente." };
  }

  redirect(data.url);
}

// -----------------------------------------------------------------------------
// Recuperação de senha
// -----------------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) return { error: "Informe o e-mail." };

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/nova-senha`,
  });

  // O erro NÃO muda a resposta — ver o comentário abaixo —, mas vai para o log.
  // Era o ponto cego mais perigoso do arquivo: uma falha de SMTP aqui deixava a
  // pessoa esperando um e-mail que nunca saiu, e não havia registro nenhum de
  // que o envio tinha falhado.
  if (error) registrarAuthError("requestPasswordReset", error);

  // Resposta NEUTRA e sempre igual, inclusive quando o e-mail não existe ou
  // quando não há SMTP. Diferenciar transformaria esta tela em um oráculo para
  // descobrir quais e-mails têm conta na plataforma.
  return {
    message: "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.",
  };
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("password_confirm") ?? "");

  if (password.length < MIN_PASSWORD) {
    return { error: `A senha precisa ter ao menos ${MIN_PASSWORD} caracteres.` };
  }
  if (password !== confirm) return { error: "As senhas não coincidem." };

  const supabase = await createClient();

  // Só funciona com a sessão de recuperação criada pelo link do e-mail.
  // Sem ela, o Supabase recusa — não há caminho para trocar a senha de outra
  // pessoa a partir daqui.
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    // Mensagem fixa, e não a traduzida: aqui o motivo quase sempre é link
    // expirado, e dizer isso vale mais que qualquer texto genérico do GoTrue.
    // O erro cru fica no log para os casos em que NÃO é isso.
    registrarAuthError("updatePassword", error);
    return {
      error:
        "Não foi possível alterar a senha. O link pode ter expirado — peça um novo em " +
        "“Esqueci minha senha”.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/painel");
}

// -----------------------------------------------------------------------------

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
