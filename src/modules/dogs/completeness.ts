import { isFilled } from "@/modules/kennels/completeness";

import { DOG_SCORED_FIELDS, WEIGHT_VALUE, type DogScoredField, type DogScoredName } from "./fields";

/**
 * ============================================================================
 * Completude do perfil do cão.
 * ============================================================================
 *
 * Função pura, mesmo contrato de `kennels/completeness.ts`: recebe valores,
 * devolve número e listas. Não fala com banco, não lê sessão, não tem data.
 *
 * `isFilled` vem de lá IMPORTADO, não copiado: "campo preenchido" tem de
 * significar a mesma coisa nos três medidores — inclusive a parte que trata
 * string de espaços como vazia, que existe justamente para o indicador não
 * premiar quem digita " " para se livrar do aviso.
 *
 * O QUE É NOVO AQUI é só a lista: `DOG_SCORED_FIELDS` inclui foto, pai, mãe e
 * canil, que não são campos do formulário. Ver o comentário deles em
 * `fields.ts` — o perfil público se sustenta neles tanto quanto na raça, e um
 * medidor que os ignorasse diria "100%" para um cão sem foto e sem pedigree.
 */

/**
 * Os valores de um cão, na forma que o medidor consulta.
 *
 * `unknown` por valor porque o que importa é PRESENÇA, não tipo: `titles` é
 * array, `born_on` é string, `photo` chega como o objeto de mídia ou `null`.
 * `isFilled` sabe lidar com todos.
 */
export type DogValues = Partial<Record<DogScoredName, unknown>>;

export type DogCompleteness = {
  /** Inteiro de 0 a 100. */
  percent: number;
  missingRequired: readonly DogScoredField[];
  missingRecommended: readonly DogScoredField[];
  filledCount: number;
  scoredCount: number;
};

/**
 * Percentual ponderado: obrigatório pesa 2, recomendado pesa 1, opcional não
 * entra — os mesmos pesos de `WEIGHT_VALUE`, que até agora estava declarado e
 * nunca era importado por ninguém.
 *
 * NA PRÁTICA `missingRequired` VEM SEMPRE VAZIA para cão que existe: `name` e
 * `sex` são NOT NULL no banco e obrigatórios no formulário, então não há como
 * gravar um cão sem eles. A lista continua sendo devolvida — o medidor é o
 * mesmo componente do canil, e uma faixa que só aparece quando há o que
 * mostrar não custa nada. O piso real de um cão cadastrado é 4/10 = 40%.
 */
export function calculateDogCompleteness(values: DogValues): DogCompleteness {
  let totalWeight = 0;
  let filledWeight = 0;
  let filledCount = 0;
  const missingRequired: DogScoredField[] = [];
  const missingRecommended: DogScoredField[] = [];

  for (const field of DOG_SCORED_FIELDS) {
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

  // Mesma resposta honesta de `calculateCompleteness`: sem campo pontuado
  // configurado, 100 — não há nada a preencher, e zero afirmaria um trabalho
  // pendente que não existe.
  const percent = totalWeight === 0 ? 100 : Math.round((filledWeight / totalWeight) * 100);

  return {
    percent,
    missingRequired,
    missingRecommended,
    filledCount,
    scoredCount: DOG_SCORED_FIELDS.length,
  };
}
