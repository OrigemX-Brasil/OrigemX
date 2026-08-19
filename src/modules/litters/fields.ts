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

export type LitterFieldName = Extract<keyof LitterRow, "description" | "mated_on" | "born_on">;

export type LitterFieldInput = "textarea" | "date";

export type LitterField = {
  name: LitterFieldName;
  label: string;
  input: LitterFieldInput;
  help?: string;
  placeholder?: string;
  maxLength?: number;
};

export const LITTER_FIELDS: readonly LitterField[] = [
  {
    name: "mated_on",
    label: "Data da cobrição",
    input: "date",
    help: "Opcional. A partir dela o sistema calcula a previsão de parto (63 dias).",
  },
  {
    name: "born_on",
    label: "Data de nascimento",
    input: "date",
    help: "Preencha quando a ninhada nascer. Até lá, a página mostra a previsão.",
  },
  {
    name: "description",
    label: "Descrição",
    input: "textarea",
    maxLength: MAX_LITTER_DESCRIPTION_LENGTH,
    placeholder: "Quantos filhotes, cor, o que torna esta ninhada especial…",
  },
] as const;
