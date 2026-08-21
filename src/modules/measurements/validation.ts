import { isMeasurementKind, MAX_NOTES_LENGTH } from "./constraints";

/**
 * Validação de medição (peso/cernelha). Roda no client e de novo na Server
 * Action; os CHECKs do banco são a última linha.
 *
 * REPETÍVEL como saúde: cada submissão valida UMA linha, sem estado de array —
 * mesmo raciocínio do cabeçalho de `health/validation.ts`.
 */

export type MeasurementInput = {
  kind?: string;
  value?: string;
  measured_on?: string;
  notes?: string;
};

export type MeasurementErrors = Partial<Record<keyof MeasurementInput, string>>;

export type NormalizedMeasurement = {
  kind: string;
  value: number | null;
  measured_on: string;
  notes: string | null;
};

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Data de calendário que existe de verdade.
 *
 * Mesma cópia deliberada de `health/validation.ts` — ver o comentário lá sobre
 * por que unificar os três round-trips do projeto não vale a pena.
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

export function normalizeMeasurement(raw: MeasurementInput): NormalizedMeasurement {
  const rawValue = (raw.value ?? "").trim();
  const parsed = rawValue.length > 0 ? Number(rawValue) : NaN;

  return {
    kind: (raw.kind ?? "").trim(),
    value: Number.isFinite(parsed) ? parsed : null,
    measured_on: (raw.measured_on ?? "").trim(),
    notes: clean(raw.notes),
  };
}

export function validateMeasurement(
  raw: MeasurementInput,
  today: Date = new Date(),
): MeasurementErrors {
  const errors: MeasurementErrors = {};
  const values = normalizeMeasurement(raw);

  if (!isMeasurementKind(values.kind)) {
    errors.kind = "Escolha entre peso e cernelha.";
  }

  // `0`/negativo/vazio caem todos aqui: `value` só é não-nulo quando o texto
  // digitado é um número que `Number.isFinite` aceita, e o CHECK do banco
  // (`dog_measurements_value_positive`) já exige maior que zero.
  if (values.value === null || values.value <= 0) {
    errors.value = "Informe um número maior que zero.";
  }

  if (!values.measured_on) {
    errors.measured_on = "Informe a data da medição.";
  } else {
    const error = validatePastDate(values.measured_on, "A data da medição", today);
    if (error) errors.measured_on = error;
  }

  if (values.notes && values.notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `A observação deve ter no máximo ${MAX_NOTES_LENGTH} caracteres.`;
  }

  return errors;
}
