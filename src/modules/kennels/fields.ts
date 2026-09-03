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
  | "whatsapp"
  | "registration_number"
  | "logo_url"
  | "breeds"
>;

/**
 * Peso na completude — e, desde o aditivo de fluxo de 03/09/2026, TAMBÉM a
 * definição do cadastro mínimo.
 *
 *   required     — faz parte do MÍNIMO. Fechar todos eles é o que dispara
 *                  "cadastro concluído" e a publicação automática. Peso 2.
 *   recommended  — o que faz o perfil público valer a visita. Peso 1.
 *   optional     — não entra na conta. Peso 0.
 *
 * `required` NÃO SIGNIFICA MAIS "o formulário recusa". Isso agora é `notNull`,
 * logo abaixo, e a separação é o ponto do aditivo: o criador salva com o que
 * tiver, e o mínimo só decide quando o cadastro está concluído. Antes as duas
 * coisas eram a mesma, e por isso promover "cidade" a obrigatória teria travado
 * a tela — o oposto do que o aditivo pede.
 *
 * Dois níveis de peso, e não uma escala fina, porque o número precisa ser
 * explicável ao criador: "faltam duas coisas" tem significado; "faltam 0.35
 * pontos" não tem.
 */
export type FieldWeight = "required" | "recommended" | "optional";

export const WEIGHT_VALUE: Record<FieldWeight, number> = {
  required: 2,
  recommended: 1,
  optional: 0,
};

export type KennelFieldInput =
  | "text"
  | "textarea"
  | "slug"
  | "url"
  | "uf"
  | "upload"
  | "handle"
  | "phone"
  /** Lista digitada separada por vírgula, guardada como `text[]`. */
  | "tags";

export type KennelField = {
  name: KennelFieldName;
  label: string;
  weight: FieldWeight;
  input: KennelFieldInput;
  /**
   * A COLUNA é NOT NULL — o formulário recusa vazio e o normalizador nunca
   * grava null. Só `name` e `slug`, que são o que o schema exige de verdade.
   *
   * Separado de `weight` de propósito: fazer parte do cadastro mínimo (peso
   * `required`) não pode implicar em bloquear o salvar, senão o aditivo de
   * fluxo viraria mais atrito em vez de menos.
   */
  notNull?: boolean;
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
    notNull: true,
    input: "text",
    publicProfile: true,
    maxLength: 120,
    placeholder: "Canil Aurora",
  },
  {
    name: "slug",
    label: "URL",
    weight: "optional",
    notNull: true,
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
    maxLength: 250,
    help: "História, linhagens de trabalho, o que diferencia sua criação. (limite de 250 caracteres)",
  },
  {
    name: "city",
    label: "Cidade",
    weight: "required",
    input: "text",
    publicProfile: true,
    maxLength: 80,
  },
  {
    name: "state",
    label: "Estado",
    weight: "required",
    input: "uf",
    publicProfile: true,
    maxLength: 2,
    placeholder: "SP",
    pattern: /^[A-Z]{2}$/,
    patternError: "Use a sigla de duas letras, como SP.",
  },
  {
    name: "breeds",
    label: "Raças criadas",
    weight: "required",
    input: "tags",
    publicProfile: true,
    help: "Separe por vírgula. Ex.: Pastor Alemão, Golden Retriever.",
    placeholder: "Pastor Alemão, Golden Retriever",
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
    name: "whatsapp",
    label: "WhatsApp",
    weight: "required",
    input: "phone",
    publicProfile: true,
    help: "APARECE NA PÁGINA PÚBLICA. É o botão de contato das suas ninhadas. Com DDD e código do país; deixe em branco para não exibir.",
    placeholder: "+55 11 98765-4321",
    // ESPELHA `kennels_whatsapp_format` EXATAMENTE.
    //
    // `validateKennel` aplica o pattern sobre o valor JÁ NORMALIZADO, e a
    // normalização de `phone` remove tudo que não é dígito — então o que chega
    // aqui é a mesma string que o banco vai medir. Um padrão mais frouxo (por
    // exemplo aceitando 16 dígitos) passaria na tela e estouraria no INSERT,
    // que é o pior lugar para descobrir.
    //
    // Sem `maxLength`: ele também mediria o valor normalizado, mas o formulário
    // o repassa ao atributo do <input> e cortaria a digitação no meio de
    // "+55 11 98765-4321", que tem 17 caracteres para 13 dígitos.
    pattern: /^[0-9]{10,15}$/,
    patternError: "Informe o número com DDD e código do país. Ex.: +55 11 98765-4321",
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
    weight: "required",
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

/**
 * O que entra na completude mas NÃO é coluna de `kennels`.
 *
 * "Nome do responsável" está no mínimo do aditivo, e vive em
 * `profiles.full_name`. Não vira coluna aqui de propósito: seriam duas fontes
 * de verdade para o nome da mesma pessoa, e a que ficasse desatualizada seria
 * justamente a que aparece no perfil público.
 *
 * Mesmo mecanismo de `DOG_EXTRA_SCORED` em `dogs/fields.ts`, e pelo mesmo
 * motivo: o medidor precisa cobrar coisas que o formulário não tem.
 */
export type KennelVirtualFieldName = "owner_name";

export type KennelScoredName = KennelFieldName | KennelVirtualFieldName;

export type KennelScoredField = {
  name: KennelScoredName;
  label: string;
  weight: FieldWeight;
};

const KENNEL_EXTRA_SCORED: readonly KennelScoredField[] = [
  { name: "owner_name", label: "Nome do responsável", weight: "required" },
] as const;

/** Campos que entram na conta de completude (peso > 0). */
export const KENNEL_SCORED_FIELDS: readonly KennelScoredField[] = [
  ...KENNEL_FIELDS.filter((f) => WEIGHT_VALUE[f.weight] > 0).map(({ name, label, weight }) => ({
    name: name as KennelScoredName,
    label,
    weight,
  })),
  ...KENNEL_EXTRA_SCORED,
];

export function getKennelField(name: KennelFieldName): KennelField | undefined {
  return KENNEL_FIELDS.find((f) => f.name === name);
}
/**
 * ============================================================================
 * As colunas que cada consulta LÊ.
 * ============================================================================
 *
 * Moram aqui, e não em `queries.ts`, por causa do defeito que as trouxe:
 * `breeds` entrou em `KENNEL_FIELDS` e ninguém acrescentou a coluna às duas
 * strings de SELECT. O criador salvava a raça, a tela recarregava vazia, e para
 * ele isso era "não salvou" — o valor estava no banco o tempo todo. Uma lista
 * escrita à mão em outro arquivo não tem como acompanhar esta.
 *
 * O segundo motivo é testabilidade: `queries.ts` arrasta o client de servidor,
 * e o teste de paridade não deveria depender disso para comparar duas listas.
 *
 * NÃO SÃO DERIVADAS de `KENNEL_FIELDS`, de propósito. O perfil público não lê
 * `logo_url`: o logo mora em `media`, que é a fonte de verdade, e derivar
 * acrescentaria uma coluna que ninguém consome. A paridade é garantida por
 * TESTE, com a exceção declarada logo abaixo — derivar trocaria uma lista à mão
 * por uma regra implícita, e regra implícita é o que já falhou aqui.
 */
export const KENNEL_COLUMNS =
  "id, name, slug, city, state, breeds, description, logo_url, website_url, instagram_handle, whatsapp, registration_number, published_at, founder_number, created_at, updated_at";

export const KENNEL_PUBLIC_COLUMNS =
  "id, name, slug, city, state, breeds, description, website_url, instagram_handle, registration_number, founder_number, whatsapp, published_at";

/**
 * Campo público que a consulta pública NÃO lê, e por quê.
 *
 * Mudar esta lista é declarar que um campo deixou de ser lido — ato consciente,
 * sob revisão, e não o esquecimento silencioso que o `breeds` foi.
 */
export const KENNEL_PUBLIC_COLUMN_EXCEPTIONS: readonly KennelFieldName[] = [
  // O logo vem de `media` (`getKennelLogo`), com URL assinada e thumbnail. A
  // coluna existe por histórico e não alimenta o perfil público.
  "logo_url",
];
