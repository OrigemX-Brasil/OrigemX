/**
 * Erro do Postgres → mensagem que o criador entende. Molde de
 * `src/modules/dogs/errors.ts`.
 *
 * POR QUE ISTO PRECISOU EXISTIR
 *
 * `kennels` tem DOIS índices únicos que o criador consegue violar pela tela, e
 * eles querem dizer coisas opostas:
 *
 *   * `kennels_slug_key`  — "esse ENDEREÇO já é de alguém"
 *   * `kennels_owner_uk`  — "VOCÊ já tem um canil"
 *
 * Até a migration `canil_unico_por_dono` só existia o primeiro, e a action
 * tratava qualquer 23505 como colisão de slug. Isso passou a mentir: quem
 * tentasse o segundo canil leria "escolha outro endereço" e trocaria o
 * endereço para sempre, sem nunca descobrir o motivo real.
 *
 * Função pura, e por isso testável: é a única coisa entre a exceção do Postgres
 * e o que o usuário lê.
 */

export type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null;

export type KennelErrorField = "slug" | "form";

export type TranslatedKennelError = {
  field: KennelErrorField;
  message: string;
};

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const INSUFFICIENT_PRIVILEGE = "42501";

export function translateKennelError(error: DbError): TranslatedKennelError {
  if (!error) return { field: "form", message: "Não foi possível salvar. Tente novamente." };

  const code = error.code ?? "";
  const raw = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  if (code === UNIQUE_VIOLATION) {
    // Ordem importa: um dono que já tem canil e ainda escolhe um slug tomado
    // viola as duas, e o Postgres reporta a que encontrar primeiro. A de posse
    // vem antes porque é a que muda o que a pessoa deve FAZER — trocar o
    // endereço não resolve nada enquanto ela já tiver um canil.
    if (raw.includes("kennels_owner_uk")) {
      return {
        field: "form",
        message:
          "Você já tem um canil. Cada conta tem um único canil — para começar outro, " +
          "exclua o atual primeiro.",
      };
    }

    if (raw.includes("kennels_slug_key")) {
      return { field: "slug", message: "Esse endereço acabou de ser tomado. Escolha outro." };
    }

    // 23505 sem nome reconhecido NÃO cai no ramo do slug. Cair era exatamente o
    // defeito que esta função veio corrigir: mandar o criador trocar um endereço
    // que não tinha problema nenhum.
    return { field: "form", message: "Já existe um canil com esses dados." };
  }

  if (code === CHECK_VIOLATION) {
    if (raw.includes("kennels_slug_format")) {
      return {
        field: "slug",
        message: "O endereço só aceita letras minúsculas, números e hífen.",
      };
    }
    if (raw.includes("kennels_slug_length")) {
      return { field: "slug", message: "O endereço precisa ter entre 3 e 60 caracteres." };
    }
    if (raw.includes("kennels_name_not_blank")) {
      return { field: "form", message: "O nome do canil não pode ficar em branco." };
    }
    return { field: "form", message: "Os dados informados violam uma regra do registro." };
  }

  if (code === INSUFFICIENT_PRIVILEGE) {
    return { field: "form", message: "Você não tem permissão para esta operação." };
  }

  return { field: "form", message: "Não foi possível salvar. Tente novamente." };
}
