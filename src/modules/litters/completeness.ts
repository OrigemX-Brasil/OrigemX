import { isFilled } from "@/modules/kennels/completeness";

import {
  LITTER_SCORED_FIELDS,
  WEIGHT_VALUE,
  type LitterScoredField,
  type LitterScoredName,
} from "./fields";

/**
 * ============================================================================
 * Completude do cadastro da ninhada.
 * ============================================================================
 *
 * Função pura, mesmo contrato de `kennels/completeness.ts` e
 * `dogs/completeness.ts`: recebe valores, devolve número. Não fala com banco,
 * não lê sessão, não tem data.
 *
 * Nasceu com o aditivo de fluxo de 03/09/2026 — a ninhada era a única das três
 * entidades sem medidor, e sem ele não havia como responder "este cadastro está
 * concluído?", que é o que dispara a publicação automática.
 *
 * `isFilled` vem do módulo de canil, e não é acaso: a definição de "preenchido"
 * precisa ser UMA — string de espaços não conta, array vazio não conta. Três
 * cópias divergiriam no primeiro caso de borda.
 *
 * DOIS ITENS DO MÍNIMO SÃO RESOLVIDOS POR QUEM CHAMA, e é sempre assim que os
 * campos virtuais funcionam neste projeto:
 *
 *   `born_on` — vale "nascimento OU previsão". A tela passa
 *   `born_on ?? mated_on`; contar as duas datas faria a ninhada que só tem
 *   previsão parecer duas vezes mais incompleta do que está.
 *
 *   `photo` — mora em `media`, não em `kennel_litters`.
 */

export type LitterValues = Partial<Record<LitterScoredName, unknown>>;

export type LitterCompleteness = {
  /** Inteiro de 0 a 100. */
  percent: number;
  /**
   * O que falta para o cadastro MÍNIMO fechar. Vazio = "cadastro concluído".
   *
   * Não é lista de pendências para cobrar: o aditivo é explícito em que a
   * completude não pode transmitir sensação de cadastro incompleto. Quem
   * consome mostra como incentivo.
   */
  missingRequired: readonly LitterScoredField[];
  missingRecommended: readonly LitterScoredField[];
  filledCount: number;
  scoredCount: number;
};

export function calculateLitterCompleteness(values: LitterValues): LitterCompleteness {
  let totalWeight = 0;
  let filledWeight = 0;
  let filledCount = 0;
  const missingRequired: LitterScoredField[] = [];
  const missingRecommended: LitterScoredField[] = [];

  for (const field of LITTER_SCORED_FIELDS) {
    const weight = WEIGHT_VALUE[field.weight];
    totalWeight += weight;

    if (isFilled(values[field.name])) {
      filledWeight += weight;
      filledCount += 1;
      continue;
    }

    if (field.weight === "required") missingRequired.push(field);
    else if (field.weight === "recommended") missingRecommended.push(field);
  }

  // Sem campo pontuado, 100 é a resposta honesta: não há nada a preencher.
  // Zero sugeriria trabalho pendente que não existe.
  const percent = totalWeight === 0 ? 100 : Math.round((filledWeight / totalWeight) * 100);

  return {
    percent,
    missingRequired,
    missingRecommended,
    filledCount,
    scoredCount: LITTER_SCORED_FIELDS.length,
  };
}
