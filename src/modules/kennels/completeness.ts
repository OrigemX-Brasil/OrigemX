import {
  KENNEL_SCORED_FIELDS,
  WEIGHT_VALUE,
  type KennelField,
  type KennelFieldName,
} from "./fields";

/**
 * Completude cadastral do canil.
 *
 * Função pura: recebe valores, devolve número. Não fala com banco, não lê
 * sessão, não tem data. É o que torna o indicador testável e o que permite
 * calcular o mesmo número no servidor e no cliente sem divergir.
 *
 * A definição do que conta e de quanto pesa NÃO está aqui — está em
 * `fields.ts`. Este arquivo só aplica a regra. Trocar os campos do cliente não
 * deveria exigir tocar nesta lógica.
 */

export type KennelValues = Partial<Record<KennelFieldName, unknown>>;

export type Completeness = {
  /** Inteiro de 0 a 100. */
  percent: number;
  /** Sem os obrigatórios, o perfil não deveria ir ao ar. */
  missingRequired: readonly KennelField[];
  missingRecommended: readonly KennelField[];
  filledCount: number;
  scoredCount: number;
};

/**
 * Um campo conta como preenchido quando tem conteúdo de verdade.
 *
 * String de espaços é vazio: o criador que digita " " para se livrar do aviso
 * não deixou o perfil mais completo, e o indicador não pode premiar isso.
 */
export function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Percentual ponderado: obrigatório pesa 2, recomendado pesa 1, opcional não
 * entra na conta.
 *
 * Ponderar em vez de contar campo a campo porque um canil com nome e endereço
 * público preenchidos está mais perto de servir do que um com site e cidade —
 * e o indicador existe para dizer ao criador onde o esforço rende mais.
 */
export function calculateCompleteness(values: KennelValues): Completeness {
  const scored = KENNEL_SCORED_FIELDS;

  let totalWeight = 0;
  let filledWeight = 0;
  let filledCount = 0;
  const missingRequired: KennelField[] = [];
  const missingRecommended: KennelField[] = [];

  for (const field of scored) {
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

  // Sem campo pontuado configurado, 100 é a resposta honesta: não há nada a
  // preencher. Zero sugeriria trabalho pendente que não existe.
  const percent = totalWeight === 0 ? 100 : Math.round((filledWeight / totalWeight) * 100);

  return {
    percent,
    missingRequired,
    missingRecommended,
    filledCount,
    scoredCount: scored.length,
  };
}

/**
 * Rótulo curto do estado. Serve para a UI não espalhar faixas numéricas por
 * vários componentes e elas divergirem.
 */
export type CompletenessLevel = "vazio" | "inicial" | "parcial" | "completo";

export function completenessLevel(percent: number): CompletenessLevel {
  if (percent <= 0) return "vazio";
  if (percent < 50) return "inicial";
  if (percent < 100) return "parcial";
  return "completo";
}
