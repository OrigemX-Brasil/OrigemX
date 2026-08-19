import {
  isHealthKind,
  MAX_NOTES_LENGTH,
  MAX_PRODUCT_LENGTH,
  MAX_TEST_NAME_LENGTH,
  MAX_TEST_RESULT_LENGTH,
} from "./constraints";

/**
 * Validação de registro de saúde e de exame genético. Roda no client e de novo
 * na Server Action; os CHECKs do banco são a última linha.
 *
 * As duas listas são REPETÍVEIS, então cada submissão valida UMA linha — não
 * existe estado de array para validar em conjunto. É o que permite o formulário
 * ser um `<form>` por linha, sem estado de client nenhum.
 */

export type HealthRecordInput = {
  kind?: string;
  applied_on?: string;
  product?: string;
  notes?: string;
};

export type HealthRecordErrors = Partial<Record<keyof HealthRecordInput, string>>;

export type NormalizedHealthRecord = {
  kind: string;
  applied_on: string;
  product: string | null;
  notes: string | null;
};

export type GeneticTestInput = {
  name?: string;
  result?: string;
  tested_on?: string;
  lab?: string;
};

export type GeneticTestErrors = Partial<Record<keyof GeneticTestInput, string>>;

export type NormalizedGeneticTest = {
  name: string;
  result: string;
  tested_on: string | null;
  lab: string | null;
};

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Data de calendário que existe de verdade.
 *
 * Terceira cópia deste round-trip no projeto (as outras em
 * `dogs/br-date.ts` e `litters/gestation.ts`), e continua valendo a pena: cada
 * uma valida uma FRONTEIRA diferente (texto digitado, ISO vindo do banco, ISO
 * vindo do formulário) e unificá-las criaria um utilitário que os três módulos
 * teriam de importar para ganhar seis linhas. O que NÃO pode é alguma delas
 * confiar só em `Number.isNaN(getTime())` — `2026-02-31` passaria.
 */
function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function validatePastDate(value: string, label: string, today: Date): string | null {
  const parsed = parseIsoDate(value);
  if (!parsed) return "Data inválida — confira dia e mês.";

  const limite = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (parsed.getTime() > limite) return `${label} não pode estar no futuro.`;
  if (parsed.getUTCFullYear() < 1900) return "Data anterior a 1900.";

  return null;
}

export function normalizeHealthRecord(raw: HealthRecordInput): NormalizedHealthRecord {
  return {
    kind: (raw.kind ?? "").trim(),
    applied_on: (raw.applied_on ?? "").trim(),
    product: clean(raw.product),
    notes: clean(raw.notes),
  };
}

export function validateHealthRecord(
  raw: HealthRecordInput,
  today: Date = new Date(),
): HealthRecordErrors {
  const errors: HealthRecordErrors = {};
  const values = normalizeHealthRecord(raw);

  if (!isHealthKind(values.kind)) {
    errors.kind = "Escolha entre vermífugo e vacina.";
  }

  if (!values.applied_on) {
    errors.applied_on = "Informe a data da aplicação.";
  } else {
    const error = validatePastDate(values.applied_on, "A data da aplicação", today);
    if (error) errors.applied_on = error;
  }

  // Espelha o CHECK `dog_health_records_vaccine_needs_product`: "vacinado em
  // 12/08" sem dizer contra o quê não informa nada a quem compra o filhote.
  // Para o vermífugo a marca é opcional — o criador pode não lembrar.
  if (values.kind === "vaccine" && !values.product) {
    errors.product = "Informe o tipo da vacina (V8, V10, antirrábica…).";
  }

  if (values.product && values.product.length > MAX_PRODUCT_LENGTH) {
    errors.product = `Deve ter no máximo ${MAX_PRODUCT_LENGTH} caracteres.`;
  }

  if (values.notes && values.notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `A observação deve ter no máximo ${MAX_NOTES_LENGTH} caracteres.`;
  }

  return errors;
}

export function normalizeGeneticTest(raw: GeneticTestInput): NormalizedGeneticTest {
  return {
    name: (raw.name ?? "").trim(),
    result: (raw.result ?? "").trim(),
    tested_on: clean(raw.tested_on),
    lab: clean(raw.lab),
  };
}

export function validateGeneticTest(
  raw: GeneticTestInput,
  today: Date = new Date(),
): GeneticTestErrors {
  const errors: GeneticTestErrors = {};
  const values = normalizeGeneticTest(raw);

  if (!values.name) {
    errors.name = "Informe o exame.";
  } else if (values.name.length > MAX_TEST_NAME_LENGTH) {
    errors.name = `O exame deve ter no máximo ${MAX_TEST_NAME_LENGTH} caracteres.`;
  }

  // Exame sem resultado não informa nada — é a razão de a coluna ser NOT NULL.
  if (!values.result) {
    errors.result = "Informe o resultado do laudo.";
  } else if (values.result.length > MAX_TEST_RESULT_LENGTH) {
    errors.result = `O resultado deve ter no máximo ${MAX_TEST_RESULT_LENGTH} caracteres.`;
  }

  if (values.tested_on) {
    const error = validatePastDate(values.tested_on, "A data do exame", today);
    if (error) errors.tested_on = error;
  }

  if (values.lab && values.lab.length > MAX_TEST_NAME_LENGTH) {
    errors.lab = `O laboratório deve ter no máximo ${MAX_TEST_NAME_LENGTH} caracteres.`;
  }

  return errors;
}
