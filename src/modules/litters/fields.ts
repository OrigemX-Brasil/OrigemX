import type { Database } from "@/lib/types/database";

import { MAX_LITTER_DESCRIPTION_LENGTH } from "./constraints";

/**
 * ============================================================================
 * DEFINIÇÃO DOS CAMPOS DA NINHADA — ponto único de verdade.
 * ============================================================================
 *
 * Mesmo padrão de `modules/dogs/fields.ts` e `modules/kennels/fields.ts`. A
 * versão anterior deste módulo não tinha esta lista, e o comentário em
 * `validation.ts` explicava por quê: com UM campo, um array de configuração
 * seria abstração inútil. Com quatro (descrição, cobrição, nascimento, e o par
 * de progenitores) o motivo caducou — é exatamente o momento que aquele
 * comentário previa.
 *
 * `LitterFieldName` é derivado do schema gerado: declarar campo que não existe
 * no banco vira erro de compilação.
 *
 * `sire_id`/`dam_id` NÃO entram aqui, pela mesma razão que não entram em
 * `DOG_FIELDS`: não são campo de texto, são busca em cães já cadastrados
 * (`ParentPicker`).
 */

type LitterRow = Database["public"]["Tables"]["kennel_litters"]["Row"];

export type LitterFieldName = Extract<
  keyof LitterRow,
  "name" | "breed" | "status" | "description" | "mated_on" | "born_on"
>;

export type LitterFieldInput = "text" | "textarea" | "date" | "select";

/**
 * Peso na completude — e a definição do cadastro MÍNIMO, desde o aditivo de
 * fluxo de 03/09/2026. Mesma escala de `dogs/fields.ts` e `kennels/fields.ts`,
 * definida aqui pela mesma razão que lá: cada módulo é dono da própria régua.
 *
 * `required` NÃO bloqueia o salvar. Nenhuma das colunas da ninhada é NOT NULL
 * além das de controle, então aqui o peso é só peso — não existe `notNull` a
 * separar como nos outros dois módulos.
 */
export type FieldWeight = "required" | "recommended" | "optional";

export const WEIGHT_VALUE: Record<FieldWeight, number> = {
  required: 2,
  recommended: 1,
  optional: 0,
};

export type LitterField = {
  name: LitterFieldName;
  label: string;
  weight: FieldWeight;
  input: LitterFieldInput;
  help?: string;
  placeholder?: string;
  maxLength?: number;
  /** Só para `select`: valor gravado e rótulo que o criador lê. */
  options?: readonly { value: string; label: string }[];
};

/** Os três status da ninhada. `closed` é "encerrada" — ver a migration. */
/**
 * Rótulo do status, ou `null` quando não há status.
 *
 * UMA função, e não um `find` repetido em cada tela: o card do painel e o
 * perfil público mostram o mesmo status, e duas cópias divergiriam na primeira
 * vez que um rótulo mudasse.
 *
 * O NOME CARREGA A TABELA de propósito. Existe um `litterStatusLabel` em
 * `litters/constraints.ts` que é de OUTRA COISA: o status do FILHOTE
 * (`dogs.litter_status`), cujo vocabulário inclui `sold`. Aqui é o status da
 * NINHADA INTEIRA (`kennel_litters.status`), que encerra sem que todos os
 * filhotes tenham saído. Dois nomes iguais para os dois seria a confusão que a
 * migration se deu ao trabalho de evitar no schema.
 *
 * Também não é o `LITTER_STATUS_LABEL` de `modules/admin/status.ts` — aquele é
 * o vocabulário da tela de admin.
 */
export function kennelLitterStatusLabel(status: string | null | undefined): string | null {
  return LITTER_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? null;
}

export const LITTER_STATUS_OPTIONS = [
  { value: "available", label: "Disponível" },
  { value: "reserved", label: "Reservada" },
  { value: "closed", label: "Encerrada" },
] as const;

export const LITTER_FIELDS: readonly LitterField[] = [
  {
    name: "name",
    label: "Nome ou identificação",
    weight: "required",
    input: "text",
    maxLength: 120,
    help: "Como você chama esta ninhada. Ex.: Ninhada Aurora × Thor, ou Ninhada A/2026.",
    placeholder: "Ninhada Aurora × Thor",
  },
  {
    name: "breed",
    label: "Raça",
    weight: "required",
    input: "text",
    maxLength: 80,
    placeholder: "Pastor Alemão",
  },
  {
    name: "status",
    label: "Status",
    weight: "required",
    input: "select",
    options: LITTER_STATUS_OPTIONS,
  },
  {
    name: "mated_on",
    label: "Data da cobrição",
    // Peso ZERO, e não é descuido: nascimento E cobrição contam como UM item do
    // mínimo ("data de nascimento ou previsão", no aditivo). Quem resolve isso é
    // a tela, passando `born_on ?? mated_on` — contar os dois faria a ninhada
    // que só tem previsão parecer duas vezes mais incompleta do que está.
    weight: "optional",
    input: "date",
    help: "A partir dela o sistema calcula a previsão de parto (63 dias).",
  },
  {
    name: "born_on",
    label: "Data de nascimento ou previsão",
    weight: "required",
    input: "date",
    help: "Preencha quando a ninhada nascer. Até lá, a cobrição já serve como previsão.",
  },
  {
    name: "description",
    label: "Descrição",
    weight: "recommended",
    input: "textarea",
    maxLength: MAX_LITTER_DESCRIPTION_LENGTH,
    placeholder: "Quantos filhotes, cor, o que torna esta ninhada especial…",
  },
] as const;

/**
 * O que entra na completude mas não é campo do formulário — mesmo mecanismo de
 * `DOG_EXTRA_SCORED`.
 *
 * PAI E MÃE SÃO MÍNIMO AQUI, ao contrário do cão. É o aditivo: a ninhada se
 * define pelo cruzamento. E não bloqueiam nada, porque o `ParentPicker` já
 * permite digitar só o nome — isso cria um ancestral FANTASMA de verdade
 * (`createGhostAncestor`), em vez de guardar texto solto, e o criador vincula o
 * cão completo depois.
 */
export type LitterVirtualFieldName = "photo" | "sire_id" | "dam_id";

export type LitterScoredName = LitterFieldName | LitterVirtualFieldName;

export type LitterScoredField = {
  name: LitterScoredName;
  label: string;
  weight: FieldWeight;
};

const LITTER_EXTRA_SCORED: readonly LitterScoredField[] = [
  { name: "photo", label: "Foto", weight: "required" },
  { name: "sire_id", label: "Pai", weight: "required" },
  { name: "dam_id", label: "Mãe", weight: "required" },
] as const;

/** Tudo que entra na conta de completude (peso > 0). */
export const LITTER_SCORED_FIELDS: readonly LitterScoredField[] = [
  ...LITTER_FIELDS.filter((f) => WEIGHT_VALUE[f.weight] > 0).map(({ name, label, weight }) => ({
    name: name as LitterScoredName,
    label,
    weight,
  })),
  ...LITTER_EXTRA_SCORED,
];

/**
 * ============================================================================
 * As colunas que cada consulta LÊ.
 * ============================================================================
 *
 * Moram aqui, junto da definição dos campos, e não em `queries.ts`. O motivo é
 * um defeito concreto: `kennels.breeds` entrou em `fields.ts` e ninguém
 * acrescentou a coluna às strings de SELECT — o criador salvava e a tela
 * recarregava vazia, o que para ele era "não salvou". Uma lista escrita à mão em
 * outro arquivo não tem como acompanhar esta.
 *
 * `columns.test.ts` compara as duas e falha NOMEANDO o campo que ficou de fora.
 */
/** Colunas PRÓPRIAS da ninhada. Progenitores e embeds ficam em `queries.ts`:
 *  conhecimento de relação não pertence a um módulo de campos. */
export const LITTER_COLUMNS =
  "id, kennel_id, public_id, name, breed, status, description, mated_on, born_on, published_at, created_at";

export const LITTER_PUBLIC_COLUMNS =
  "id, public_id, name, breed, status, description, mated_on, born_on";
