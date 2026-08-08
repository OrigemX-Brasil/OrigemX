"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { notificarEvento } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";

import { translateKennelError, type DbError } from "./errors";
import { KENNEL_FORM_FIELDS } from "./fields";
import { getMyKennel, isSlugTaken } from "./queries";
import {
  normalizeKennelInput,
  validateKennel,
  type FieldErrors,
  type KennelInput,
} from "./validation";

export type KennelFormState = {
  errors?: FieldErrors;
  formError?: string;
  values?: KennelInput;
};

/** Mensagem de "você já tem um canil" quando a checagem prévia pega o caso. */
const JA_TEM_CANIL =
  "Você já tem um canil. Cada conta tem um único canil — para começar outro, exclua o atual primeiro.";

/**
 * Erro do banco → estado do formulário, no molde de `toFormState` em
 * `src/modules/dogs/actions.ts`. O campo decide onde a mensagem aparece: no
 * endereço, quando é dele o problema; acima do formulário, quando é do canil
 * inteiro.
 */
function toFormState(error: DbError, values: KennelInput): KennelFormState {
  const { field, message } = translateKennelError(error);
  return field === "slug" ? { errors: { slug: message }, values } : { formError: message, values };
}

/** Lê do FormData só o que a configuração declara. Campo extra é ignorado. */
function readForm(formData: FormData): KennelInput {
  const input: KennelInput = {};
  for (const field of KENNEL_FORM_FIELDS) {
    const raw = formData.get(field.name);
    if (typeof raw === "string") input[field.name] = raw;
  }
  return input;
}

/**
 * Revalida a validação do client. Não é redundância: o formulário é
 * conveniência, e um POST direto pula a tela inteira.
 */
async function validateOrFail(input: KennelInput, exceptId?: string): Promise<FieldErrors | null> {
  const errors = validateKennel(input);
  if (Object.keys(errors).length > 0) return errors;

  const values = normalizeKennelInput(input);
  const slug = values.slug;
  if (slug && (await isSlugTaken(slug, exceptId))) {
    return {
      slug: "Esse endereço já está em uso. O endereço fica reservado mesmo se o canil for excluído.",
    };
  }

  return null;
}

export async function createKennel(
  _prev: KennelFormState,
  formData: FormData,
): Promise<KennelFormState> {
  const user = await requireUser("/painel/canis/novo");
  const input = readForm(formData);

  // Consulta antes de gravar só para dar mensagem decente — quem GARANTE é o
  // índice `kennels_owner_uk`, e é ele que cobre a corrida entre duas gravações
  // simultâneas que esta checagem não cobre. Mesmo papel de `isSlugTaken`.
  //
  // Retorna erro em vez de redirecionar: a página já redireciona quem tem canil
  // (ver /painel/canis/novo), então quem chega aqui mandou POST direto, e um
  // redirect silencioso apagaria o que a pessoa digitou sem explicar nada.
  if (await getMyKennel(user.id)) {
    return { formError: JA_TEM_CANIL, values: input };
  }

  const errors = await validateOrFail(input);
  if (errors) return { errors, values: input };

  const values = normalizeKennelInput(input);

  // `validateOrFail` já garantiu que os obrigatórios vieram, mas o TypeScript
  // não tem como saber: a obrigatoriedade mora em `fields.ts`, que é dado de
  // runtime. Esta guarda satisfaz o tipo e cobre o caso de alguém marcar `name`
  // ou `slug` como não-obrigatório na configuração sem alterar o banco, onde as
  // duas colunas são NOT NULL.
  const { name, slug } = values;
  if (!name || !slug) {
    return { formError: "Nome e endereço público são obrigatórios.", values: input };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kennels")
    .insert({
      ...values,
      name,
      slug,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  // Os índices únicos são a última linha e podem disparar mesmo depois das
  // checagens acima, se duas gravações correrem juntas — `kennels_slug_key` e
  // `kennels_owner_uk` chegam os dois como 23505, e só o nome os distingue.
  if (error || !data) return toFormState(error, input);

  // Aviso interno. Precisa vir ANTES do `redirect`, que lança por dentro — mas
  // o `after` executa mesmo assim: a documentação do Next é explícita em que ele
  // roda inclusive quando `redirect` ou `notFound` são chamados. Sem isso, a
  // notificação de canil nunca sairia.
  const criado = data.id;
  after(async () => {
    try {
      await notificarEvento({
        tipo: "canil-criado",
        nome: name,
        slug,
        cidade: values.city ?? null,
        estado: values.state ?? null,
        id: criado,
      });
    } catch {
      // Criar canil não pode falhar porque a caixa da equipe está fora do ar.
    }
  });

  revalidatePath("/painel/canis");
  redirect(`/painel/canis/${data.id}`);
}

export async function updateKennel(
  _prev: KennelFormState,
  formData: FormData,
): Promise<KennelFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { formError: "Canil não identificado." };

  await requireUser(`/painel/canis/${id}`);
  const input = readForm(formData);

  const errors = await validateOrFail(input, id);
  if (errors) return { errors, values: input };

  const values = normalizeKennelInput(input);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kennels")
    .update(values)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  // Hoje o payload vem só de `KENNEL_FORM_FIELDS`, sem `owner_id` nem
  // `deleted_at`, então este UPDATE não tem como violar `kennels_owner_uk`.
  // Usa o mesmo tradutor mesmo assim: é uma linha, e impede que acrescentar um
  // campo ao `fields.ts` volte a rotular o erro errado.
  if (error) return toFormState(error, input);

  // Zero linhas sem erro é a assinatura de RLS negando: a policy filtrou a
  // linha e o UPDATE não achou nada. Não confundir com "nada mudou".
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar este canil.", values: input };
  }

  revalidatePath("/painel/canis");
  revalidatePath(`/painel/canis/${id}`);
  // O perfil público tem ISR de 300s (ver revalidate em app/(public)/c/[slug]) e
  // ninguém revalidava esta rota ao editar o canil — só o fluxo de publicar/
  // despublicar mídia fazia isso (`revalidateKennel` em modules/media/publish.ts).
  // Sem isto, instagram/RG salvos ficavam invisíveis na página pública por até
  // 5 minutos.
  if (values.slug) revalidatePath(`/c/${values.slug}`);
  return { values: input };
}

/**
 * Exclusão LÓGICA. Nunca DELETE físico — é invariante do projeto, e o banco
 * nem concede o privilégio de DELETE a `authenticated`.
 *
 * LIBERA A VAGA, mas NÃO o endereço. `kennels_owner_uk` é parcial por
 * `deleted_at`, então o criador pode cadastrar outro canil depois; já
 * `kennels_slug_key` é global, então o slug antigo fica reservado para sempre,
 * para que uma URL já divulgada não passe a resolver para outro canil. A
 * assimetria é deliberada — ver a migration `canil_unico_por_dono`.
 */
export async function softDeleteKennel(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await requireUser(`/painel/canis/${id}`);

  const supabase = await createClient();
  await supabase
    .from("kennels")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  revalidatePath("/painel/canis");
  redirect("/painel/canis");
}
