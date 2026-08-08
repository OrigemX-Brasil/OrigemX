import type { Database } from "@/lib/types/database";

/**
 * ============================================================================
 * DEFINIÇÃO DOS CAMPOS DO CANIL — ponto único de verdade.
 * ============================================================================
 *
 * O documento funcional do cliente ainda não chegou. Estes campos são os
 * citados no contrato, e vão mudar.
 *
 * Quando mudarem, MEXA SÓ NESTE ARQUIVO. Ele decide:
 *   - quais campos existem no formulário e em que ordem;
 *   - quais são obrigatórios, recomendados ou opcionais;
 *   - quanto cada um pesa na completude cadastral;
 *   - quais aparecem no perfil público;
 *   - como cada um é validado.
 *
 * Formulário, tela de edição, indicador de completude e perfil público leem
 * daqui. Nenhum deles repete a lista.
 *
 * O QUE ESTE ARQUIVO NÃO RESOLVE SOZINHO: adicionar um campo NOVO exige também
 * uma migration criando a coluna. O tipo `KennelFieldName` abaixo é derivado do
 * schema gerado, então um campo que não existe no banco vira erro de
 * compilação em vez de bug em produção.
 */

type KennelRow = Database["public"]["Tables"]["kennels"]["Row"];

/**
 * Colunas que o dono edita. Fora daqui ficam as de controle — id, owner_id,
 * created_by, datas, deleted_at, published_at — que nunca vão a formulário.
 */
export type KennelFieldName = Extract<
  keyof KennelRow,
  | "name"
  | "slug"
  | "description"
  | "city"
  | "state"
  | "website_url"
  | "instagram_handle"
  | "registration_number"
  | "logo_url"
>;

/**
 * Peso na completude.
 *
 *   required     — sem isto o canil não existe direito. Peso 2.
 *   recommended  — o que faz o perfil público valer a visita. Peso 1.
 *   optional     — não entra na conta. Peso 0.
 *
 * Dois níveis de peso, e não uma escala fina, porque o número precisa ser
 * explicável ao criador: "faltam os obrigatórios" tem significado; "faltam
 * 0.35 pontos" não tem.
 */
export type FieldWeight = "required" | "recommended" | "optional";

export const WEIGHT_VALUE: Record<FieldWeight, number> = {
  required: 2,
  recommended: 1,
  optional: 0,
};

export type KennelFieldInput = "text" | "textarea" | "slug" | "url" | "uf" | "upload" | "handle";

export type KennelField = {
  name: KennelFieldName;
  label: string;
  weight: FieldWeight;
  input: KennelFieldInput;
  /** Aparece no perfil público, sem sessão. */
  publicProfile: boolean;
  help?: string;
  placeholder?: string;
  maxLength?: number;
  /** Só para o formulário; a validação que vale é a do banco. */
  pattern?: RegExp;
  patternError?: string;
  /** Fora do formulário — preenchido por outro fluxo. */
  managedElsewhere?: string;
};

export const KENNEL_FIELDS: readonly KennelField[] = [
  {
    name: "name",
    label: "Nome do canil",
    weight: "required",
    input: "text",
    publicProfile: true,
    maxLength: 120,
    placeholder: "Canil Aurora",
  },
  {
    name: "slug",
    label: "URL",
    weight: "required",
    input: "slug",
    publicProfile: true,
    maxLength: 60,
    help: "Vira origemx.app/c/seu-canil. Escolha com cuidado: muda o link que você divulga.",
    placeholder: "canil-aurora",
    pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
    patternError: "Não use espaço, apenas letras minúsculas, números e hífens.",
  },
  {
    name: "description",
    label: "Sobre o canil",
    weight: "recommended",
    input: "textarea",
    publicProfile: true,
    maxLength: 1000,
    help: "História, linhagens de trabalho, o que diferencia sua criação.",
  },
  {
    name: "city",
    label: "Cidade",
    weight: "recommended",
    input: "text",
    publicProfile: true,
    maxLength: 80,
  },
  {
    name: "state",
    label: "Estado",
    weight: "recommended",
    input: "uf",
    publicProfile: true,
    maxLength: 2,
    placeholder: "SP",
    pattern: /^[A-Z]{2}$/,
    patternError: "Use a sigla de duas letras, como SP.",
  },
  {
    name: "website_url",
    label: "Site ou rede social",
    weight: "optional",
    input: "url",
    publicProfile: true,
    maxLength: 200,
    placeholder: "https://",
  },
  {
    name: "instagram_handle",
    label: "Instagram",
    weight: "recommended",
    input: "handle",
    publicProfile: true,
    maxLength: 30,
    help: "Só o usuário, com ou sem @. Ex.: canil.aurora",
    placeholder: "@canilaurora",
    pattern: /^[A-Za-z0-9._]+$/,
    patternError: "Use letras, números, ponto e underscore — sem espaço, sem link completo.",
  },
  {
    name: "registration_number",
    label: "RG do canil",
    weight: "optional",
    input: "text",
    publicProfile: true,
    maxLength: 60,
    help: "Número de registro do canil, se houver (ex.: afixo CBKC/FCI). Aparece no perfil público.",
    placeholder: "Ex.: CBKC 12345",
  },
  {
    name: "logo_url",
    label: "Logo",
    weight: "recommended",
    input: "upload",
    publicProfile: true,
    // Entra no Prompt 7. Já pesa na completude porque o perfil público sem
    // logo é visivelmente incompleto — e é isso que o indicador comunica.
    managedElsewhere: "Upload entra na etapa de mídia.",
  },
] as const;

/** Campos que o formulário de canil renderiza. */
export const KENNEL_FORM_FIELDS = KENNEL_FIELDS.filter((f) => !f.managedElsewhere);

/** Campos que o perfil público exibe. */
export const KENNEL_PUBLIC_FIELDS = KENNEL_FIELDS.filter((f) => f.publicProfile);

/** Campos que entram na conta de completude (peso > 0). */
export const KENNEL_SCORED_FIELDS = KENNEL_FIELDS.filter((f) => WEIGHT_VALUE[f.weight] > 0);

export function getKennelField(name: KennelFieldName): KennelField | undefined {
  return KENNEL_FIELDS.find((f) => f.name === name);
}
