/**
 * Erro do Postgres → mensagem que o criador entende.
 *
 * As invariantes de genealogia são impostas no banco: trigger de ciclo, sexo do
 * progenitor, CHECKs, índices únicos. Isso é o correto — a garantia não pode
 * depender da aplicação. Mas o preço é que a violação chega como um erro de
 * driver, e sem tradução ela vira 500 numa tela em branco.
 *
 * Função pura, e por isso testável: é a única coisa entre a exceção do Postgres
 * e o que o usuário lê.
 */

export type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null;

export type DogErrorField = "sire_id" | "dam_id" | "slug" | "form";

export type TranslatedDogError = {
  field: DogErrorField;
  message: string;
};

/** Códigos SQLSTATE que aparecem neste domínio. */
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const RESTRICT_VIOLATION = "23001";
const INSUFFICIENT_PRIVILEGE = "42501";

export function translateDogError(error: DbError): TranslatedDogError {
  if (!error) return { field: "form", message: "Não foi possível concluir. Tente novamente." };

  const code = error.code ?? "";
  const raw = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  if (code === CHECK_VIOLATION || code === RESTRICT_VIOLATION) {
    // Ciclo genealógico. É o caso que mais assusta na tela, porque o criador
    // costuma estar convicto de que a ligação está certa — a mensagem precisa
    // dizer POR QUE não pode, não só que não pôde.
    if (raw.includes("ciclo genealógico") || raw.includes("ciclo genealogico")) {
      return {
        field: "form",
        message:
          "Esse cão já aparece como descendente na árvore. Defini-lo como pai ou mãe faria " +
          "com que ele fosse ancestral de si mesmo, o que o registro não permite.",
      };
    }

    if (raw.includes("sire_id") && raw.includes("macho")) {
      return { field: "sire_id", message: "O pai precisa ser um cão macho." };
    }

    if (raw.includes("dam_id") && raw.includes("cadela")) {
      return { field: "dam_id", message: "A mãe precisa ser uma fêmea." };
    }

    if (raw.includes("dogs_sire_dam_distinct")) {
      return { field: "dam_id", message: "Pai e mãe não podem ser o mesmo cão." };
    }

    if (raw.includes("dogs_not_own_sire")) {
      return { field: "sire_id", message: "Um cão não pode ser pai de si mesmo." };
    }

    if (raw.includes("dogs_not_own_dam")) {
      return { field: "dam_id", message: "Um cão não pode ser mãe de si mesmo." };
    }

    if (raw.includes("dogs_slug_requires_kennel")) {
      return {
        field: "slug",
        message: "O endereço público só existe para cão vinculado a um canil.",
      };
    }

    if (raw.includes("progenitor")) {
      return {
        field: "form",
        message:
          "Não é possível mudar o sexo deste cão: ele já consta como pai ou mãe em outro pedigree.",
      };
    }

    if (raw.includes("dogs_slug_format") || raw.includes("dogs_slug_length")) {
      return { field: "slug", message: "Endereço público em formato inválido." };
    }

    return { field: "form", message: "Os dados informados violam uma regra do registro." };
  }

  if (code === UNIQUE_VIOLATION) {
    if (raw.includes("dogs_kennel_slug_key")) {
      return { field: "slug", message: "Já existe um cão com esse endereço neste canil." };
    }
    if (raw.includes("microchip")) {
      return {
        field: "form",
        message: "Esse microchip já está registrado em outro cão. Microchip é único.",
      };
    }
    if (raw.includes("registration")) {
      return {
        field: "form",
        message: "Esse número de registro já existe para a mesma entidade emissora.",
      };
    }
    return { field: "form", message: "Já existe um registro com esses dados." };
  }

  if (code === FOREIGN_KEY_VIOLATION) {
    return {
      field: "form",
      message: "Um dos cães selecionados não existe mais. Recarregue a página e tente de novo.",
    };
  }

  if (code === INSUFFICIENT_PRIVILEGE) {
    return { field: "form", message: "Você não tem permissão para esta operação." };
  }

  return { field: "form", message: "Não foi possível salvar. Tente novamente." };
}
