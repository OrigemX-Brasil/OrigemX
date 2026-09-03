import type { Database } from "@/lib/types/database";

import { DOG_FIELDS, type DogField, type DogFieldName } from "./fields";

/**
 * Validação do cão. Roda no client e de novo na Server Action.
 *
 * As regras vêm de `fields.ts`; este arquivo não sabe quais campos existem.
 * A última linha continua sendo o banco — CHECKs, triggers e índices únicos.
 */

export type DogFieldErrors = Partial<Record<DogFieldName, string>>;
export type DogInput = Partial<Record<DogFieldName, string>>;
export type DogPatch = Database["public"]["Tables"]["dogs"]["Update"];

function assign(
  target: DogPatch,
  key: DogFieldName,
  value: string | number | string[] | null,
): void {
  // A obrigatoriedade mora em `fields.ts`, que é dado de runtime, então o
  // compilador não tem como saber quais chaves aceitam null. O `if` de quem
  // chama é que garante; o cast fica confinado aqui.
  (target as Record<string, string | number | string[] | null>)[key] = value;
}

export function normalizeDogInput(
  raw: DogInput,
  fields: readonly DogField[] = DOG_FIELDS,
): DogPatch {
  const out: DogPatch = {};

  for (const field of fields) {
    const value = raw[field.name];
    if (value === undefined) continue;

    const normalized = value.trim();

    if (field.input === "number") {
      if (normalized.length > 0) {
        assign(out, field.name, Number(normalized));
      } else if (!field.notNull) {
        assign(out, field.name, null);
      }
      continue;
    }

    if (field.input === "list") {
      // Uma linha por título — ver o mesmo raciocínio no `Control` do
      // formulário. Linha em branco é ruído de quem só deu Enter a mais.
      const items = normalized
        .split("\n")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      if (items.length > 0) {
        assign(out, field.name, items);
      } else if (!field.notNull) {
        assign(out, field.name, null);
      }
      continue;
    }

    const normalizedText = field.input === "slug" ? normalized.toLowerCase() : normalized;

    if (normalizedText.length > 0) {
      assign(out, field.name, normalizedText);
    } else if (!field.notNull) {
      // Vazio em campo não obrigatório vira null explícito: é assim que o dono
      // apaga uma cor que preencheu antes.
      assign(out, field.name, null);
    }
  }

  return out;
}

export function validateDog(
  raw: DogInput,
  fields: readonly DogField[] = DOG_FIELDS,
): DogFieldErrors {
  const errors: DogFieldErrors = {};
  const values = normalizeDogInput(raw, fields);

  for (const field of fields) {
    const value = (values as Record<string, string | number | string[] | null | undefined>)[
      field.name
    ];

    if (field.notNull && !value) {
      errors[field.name] = `${field.label} é obrigatório.`;
      continue;
    }

    // Falsy comum (`!value`) rejeitaria peso 0 antes mesmo de ele ser
    // reconhecido como inválido — `0` e `NaN` são valores DEFINIDOS que ainda
    // precisam passar pela checagem de "number" abaixo, não ausência de valor.
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (field.input === "number") {
      if (typeof value === "number" && (Number.isNaN(value) || value <= 0)) {
        errors[field.name] = `${field.label} deve ser um número maior que zero.`;
      }
      continue;
    }

    if (field.input === "list") {
      if (field.maxLength && Array.isArray(value)) {
        const tooLong = value.some((item) => item.length > field.maxLength!);
        if (tooLong) {
          errors[field.name] =
            `Cada item de ${field.label.toLowerCase()} deve ter no máximo ${field.maxLength} caracteres.`;
        }
      }
      continue;
    }

    // A partir daqui `field.input` só pode ser "text" | "select" | "date" |
    // "slug" — os dois `continue` acima já trataram "number" e "list", os
    // únicos que produzem valor não-string em `normalizeDogInput`.
    const text = value as string;

    if (field.options && !field.options.some((o) => o.value === text)) {
      errors[field.name] = `${field.label} tem valor inválido.`;
      continue;
    }

    if (field.maxLength && text.length > field.maxLength) {
      errors[field.name] = `${field.label} deve ter no máximo ${field.maxLength} caracteres.`;
      continue;
    }

    if (field.pattern && !field.pattern.test(text)) {
      errors[field.name] = field.patternError ?? `${field.label} está em formato inválido.`;
      continue;
    }

    if (field.input === "date") {
      const error = validateBirthDate(text);
      if (error) errors[field.name] = error;
    }
  }

  return errors;
}

/**
 * Nascimento no futuro é erro de digitação, sempre.
 *
 * Esta checagem NÃO existe como CHECK no banco de propósito: `current_date`
 * não é imutável, e uma constraint que depende do relógio quebra restauração
 * de dump — a linha era válida quando entrou e passa a ser inválida depois.
 */
export function validateBirthDate(value: string): string | null {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "Data inválida.";

  const hoje = new Date();
  hoje.setUTCHours(23, 59, 59, 999);
  if (parsed.getTime() > hoje.getTime()) return "A data de nascimento não pode estar no futuro.";

  if (parsed.getUTCFullYear() < 1900) return "Data anterior a 1900.";

  return null;
}

export function slugifyDog(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
