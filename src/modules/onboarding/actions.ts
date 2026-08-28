"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { dispararPrimeiroCao } from "@/lib/notify/usuario/disparos";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";
import { translateKennelError } from "@/modules/kennels/errors";
import { getMyKennel } from "@/modules/kennels/queries";

import { candidatosDeSlug } from "./slug";

/**
 * ============================================================================
 * Primeiro acesso: canil e cão criados no mesmo caminho.
 * ============================================================================
 *
 * MÓDULO PRÓPRIO porque a ação atravessa DUAS entidades e não pertence a
 * nenhuma delas: pôr isto em `kennels/actions.ts` faria o módulo de canil saber
 * criar cão, e vice-versa.
 *
 * POR QUE O CANIL ENTRA AQUI, se cadastrar cão não o exige: `dogs.kennel_id` é
 * nullable e um cão sem canil publica normalmente — mas nasceria sem atribuição,
 * sem CTA de WhatsApp e sem URL bonita, e o alerta `conta-sem-canil` apareceria
 * logo depois. Seria devolver o criador ao modo passivo que a tela de
 * boas-vindas existe para substituir. Então o nome do canil é pedido junto, e as
 * duas linhas nascem no mesmo envio — o criador nunca lida com "duas entidades".
 *
 * TRÊS CAMPOS, e é o mínimo real: `kennels.name` (o slug é derivado),
 * `dogs.name` e `dogs.sex`. Nada mais é obrigatório em nenhuma das duas tabelas.
 * O resto vem na tela de sucesso, que já convida a completar.
 */

export type FirstDogState = {
  errors?: { kennel_name?: string; name?: string; sex?: string };
  formError?: string;
  values?: { kennel_name?: string; name?: string; sex?: string };
};

/** Espelha `kennels_name_not_blank` e o teto da coluna. */
const MAX_KENNEL_NAME = 120;
const MAX_DOG_NAME = 120;

/**
 * Quantas vezes insistir com um slug diferente.
 *
 * Não é paranoia: `isSlugTaken` roda sob RLS e `kennels_select` não entrega
 * canil de TERCEIRO não publicado, então um endereço preso a um rascunho alheio
 * parece livre e só o índice único acusa. O laço abaixo trata isso tentando o
 * próximo candidato — ver o comentário em `criarCanil`.
 */
const MAX_TENTATIVAS_DE_SLUG = 8;

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Cria o canil, tentando os candidatos de slug em ordem.
 *
 * NÃO consulta `isSlugTaken` antes. Consultar seria uma ida ao banco a mais
 * para uma resposta em que não dá para confiar: sob RLS, canil não publicado de
 * outra pessoa é invisível, então "livre" ali não significa livre no índice. O
 * INSERT é a única fonte honesta — tenta, e o 23505 de `kennels_slug_key` diz
 * para seguir para o próximo.
 *
 * `translateKennelError` é quem separa `kennels_slug_key` de `kennels_owner_uk`:
 * os dois chegam como 23505 e significam coisas opostas. Só o primeiro merece
 * nova tentativa — insistir no segundo tentaria criar um canil para quem já tem.
 */
async function criarCanil(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  nome: string,
): Promise<{ id: string } | { erro: string }> {
  const candidatos = candidatosDeSlug(nome).slice(0, MAX_TENTATIVAS_DE_SLUG);

  for (const slug of candidatos) {
    const { data, error } = await supabase
      .from("kennels")
      .insert({ name: nome, slug, owner_id: userId, created_by: userId })
      .select("id")
      .single();

    if (!error && data) return { id: data.id };

    const traduzido = translateKennelError(error);
    // Só colisão de ENDEREÇO justifica outro candidato. Qualquer outro erro
    // (posse, formato, permissão) se repetiria igual em todas as tentativas.
    if (traduzido.field !== "slug") return { erro: traduzido.message };
  }

  return {
    erro:
      "Não conseguimos criar um endereço público a partir desse nome — os parecidos já estão " +
      "em uso. Tente um nome um pouco diferente.",
  };
}

export async function createFirstDog(
  _prev: FirstDogState,
  formData: FormData,
): Promise<FirstDogState> {
  const user = await requireUser("/painel/comecar");

  const kennelName = texto(formData, "kennel_name");
  const name = texto(formData, "name");
  const sex = texto(formData, "sex");
  const values = { kennel_name: kennelName, name, sex };

  const errors: FirstDogState["errors"] = {};
  if (!kennelName) errors.kennel_name = "Informe o nome do seu canil.";
  else if (kennelName.length > MAX_KENNEL_NAME) {
    errors.kennel_name = `O nome do canil deve ter no máximo ${MAX_KENNEL_NAME} caracteres.`;
  }
  if (!name) errors.name = "Informe o nome do cão.";
  else if (name.length > MAX_DOG_NAME) {
    errors.name = `O nome do cão deve ter no máximo ${MAX_DOG_NAME} caracteres.`;
  }
  if (sex !== "male" && sex !== "female") errors.sex = "Escolha o sexo do cão.";

  if (Object.keys(errors).length > 0) return { errors, values };

  const supabase = await createClient();

  /**
   * REUSA O CANIL EXISTENTE em vez de criar sempre, e isto não é otimização:
   * é o que torna a ação segura para repetição.
   *
   * Os dois INSERTs não estão numa transação — não há como abrir uma pelo
   * PostgREST. Se o canil entrar e o cão falhar (rede, validação, RLS), o
   * criador fica com canil e sem cão; ao tentar de novo, sem esta consulta a
   * criação bateria em `kennels_owner_uk` e ele leria "você já tem um canil"
   * numa tela que está justamente tentando criar o primeiro cão.
   *
   * A página já redireciona quem tem canil, então na prática isto só é
   * alcançado pelo reenvio depois de uma falha parcial — que é exatamente o
   * caso que precisa funcionar.
   */
  const existente = await getMyKennel(user.id);
  const canil = existente ? { id: existente.id } : await criarCanil(supabase, user.id, kennelName);

  if ("erro" in canil) return { formError: canil.erro, values };

  const { data: dog, error } = await supabase
    .from("dogs")
    .insert({
      name,
      sex,
      kennel_id: canil.id,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id, name, public_id")
    .single();

  if (error || !dog) {
    return {
      formError:
        "O canil foi criado, mas não foi possível cadastrar o cão. Tente enviar de novo — " +
        "o canil não será duplicado.",
      values,
    };
  }

  /**
   * Este caminho SEMPRE cria o primeiro cao -- a rota redireciona quem ja tem
   * canil, e so chega aqui quem esta comecando. Ainda assim o disparo passa
   * pela guarda, que confere `kind` unico: se por algum caminho isto rodar
   * duas vezes, o segundo e-mail nao sai.
   */
  after(() => dispararPrimeiroCao(user.id, dog));

  revalidatePath("/painel");
  revalidatePath("/painel/caes");
  revalidatePath("/painel/canis");
  // Mesma tela de sucesso do cadastro comum: mostra o que foi criado e oferece
  // publicar, compartilhar e completar. Não existe caminho de "pronto"
  // separado para o primeiro cão — seria uma segunda tela dizendo o mesmo.
  redirect(`/painel/caes/${dog.id}/pronto`);
}
