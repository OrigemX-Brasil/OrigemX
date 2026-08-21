import type { Database } from "@/lib/types/database";

/**
 * ============================================================================
 * DEFINIÇÃO DOS CAMPOS DO CÃO — ponto único de verdade.
 * ============================================================================
 *
 * Mesmo padrão de `modules/kennels/fields.ts`: quando o documento funcional do
 * cliente chegar, mexe-se só aqui. Formulário, validação e telas leem desta
 * lista e não a repetem.
 *
 * `DogFieldName` é derivado do schema gerado, então declarar um campo que não
 * existe no banco vira erro de compilação.
 */

type DogRow = Database["public"]["Tables"]["dogs"]["Row"];

/**
 * Colunas que o usuário edita. Ficam de fora as de controle (id, public_id,
 * datas, deleted_at, published_at, created_by) e as de parentesco — sire_id e
 * dam_id não são campo de texto, são busca em cães já cadastrados.
 */
export type DogFieldName = Extract<
  keyof DogRow,
  "name" | "sex" | "born_on" | "breed" | "color" | "coat" | "slug" | "titles"
>;

export type FieldWeight = "required" | "recommended" | "optional";

export const WEIGHT_VALUE: Record<FieldWeight, number> = {
  required: 2,
  recommended: 1,
  optional: 0,
};

export type DogFieldInput = "text" | "select" | "date" | "slug" | "number" | "list";

export type DogSelectOption = { value: string; label: string };

export type DogField = {
  name: DogFieldName;
  label: string;
  weight: FieldWeight;
  input: DogFieldInput;
  publicProfile: boolean;
  options?: readonly DogSelectOption[];
  help?: string;
  placeholder?: string;
  maxLength?: number;
  pattern?: RegExp;
  patternError?: string;
  /**
   * Campo pedido também no cadastro mínimo de ancestral. O resto do formulário
   * não aparece ali: o fantasma existe para ser nó de árvore, e pedir cor da
   * pelagem de um cão que o criador nunca viu só gera dado inventado.
   */
  onGhostForm?: boolean;
};

export const SEX_OPTIONS = [
  { value: "male", label: "Macho" },
  { value: "female", label: "Fêmea" },
] as const;

export const DOG_FIELDS: readonly DogField[] = [
  {
    name: "name",
    label: "Nome",
    weight: "required",
    input: "text",
    publicProfile: true,
    maxLength: 120,
    placeholder: "Rex de Aurora",
    onGhostForm: true,
  },
  {
    name: "sex",
    label: "Sexo",
    weight: "required",
    input: "select",
    publicProfile: true,
    options: SEX_OPTIONS,
    // Obrigatório mesmo no fantasma: é o sexo que decide se o cão pode ocupar
    // a posição de pai ou de mãe, e o banco recusa a combinação errada.
    onGhostForm: true,
  },
  {
    name: "breed",
    label: "Raça",
    weight: "recommended",
    input: "text",
    publicProfile: true,
    maxLength: 120,
    help: "Pode ficar em branco em ancestral antigo sem registro.",
    onGhostForm: true,
  },
  {
    name: "born_on",
    label: "Data de nascimento",
    weight: "recommended",
    input: "date",
    publicProfile: true,
    onGhostForm: true,
  },
  {
    name: "color",
    label: "Cor",
    weight: "optional",
    input: "text",
    publicProfile: true,
    maxLength: 80,
  },
  {
    name: "coat",
    label: "Pelagem",
    weight: "optional",
    input: "text",
    publicProfile: true,
    maxLength: 80,
  },
  {
    name: "titles",
    label: "Títulos",
    weight: "optional",
    input: "list",
    publicProfile: true,
    maxLength: 80,
    help: "Um título por linha, ex.: Campeão Nacional.",
    placeholder: "Campeão Nacional",
  },
  {
    name: "slug",
    label: "URL",
    weight: "optional",
    input: "slug",
    publicProfile: false,
    maxLength: 80,
    help: "Opcional. Compõe origemx.app/c/canil/cao. O QR Code não depende disto — ele aponta para o identificador permanente.",
    pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
    patternError: "Não use espaço, apenas letras minúsculas, números e hífens.",
  },
] as const;

/** Formulário completo, do cão gerenciável. */
export const DOG_FORM_FIELDS = DOG_FIELDS;

/** Cadastro mínimo do ancestral fantasma. */
export const DOG_GHOST_FIELDS = DOG_FIELDS.filter((f) => f.onGhostForm);

export const DOG_PUBLIC_FIELDS = DOG_FIELDS.filter((f) => f.publicProfile);

export function getDogField(name: DogFieldName): DogField | undefined {
  return DOG_FIELDS.find((f) => f.name === name);
}
