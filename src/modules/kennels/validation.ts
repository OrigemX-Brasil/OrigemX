import type { Database } from "@/lib/types/database";

import { KENNEL_FORM_FIELDS, type KennelFieldName } from "./fields";

/**
 * Validação do canil.
 *
 * Roda no client (feedback imediato) e de novo no servidor, na Server Action.
 * A do client é conveniência: qualquer um envia um POST direto e pula a tela.
 * A do servidor é a que vale — e mesmo ela é a segunda linha, porque os CHECK
 * e os índices únicos do banco são a última.
 *
 * As regras vêm de `fields.ts`. Este arquivo não sabe quais campos existem.
 */

export type FieldErrors = Partial<Record<KennelFieldName, string>>;

export type KennelInput = Partial<Record<KennelFieldName, string>>;

/**
 * Normaliza antes de validar e de gravar: espaço nas pontas some, UF sobe para
 * maiúscula, campo vazio vira null.
 *
 * Guardar `""` em vez de `null` faria a completude contar o campo como
 * preenchido e o perfil público exibir um rótulo sem conteúdo.
 */
/** Exatamente a forma que o Supabase aceita num insert/update de `kennels`. */
export type KennelPatch = Database["public"]["Tables"]["kennels"]["Update"];

export function normalizeKennelInput(raw: KennelInput): KennelPatch {
  const out: KennelPatch = {};

  for (const field of KENNEL_FORM_FIELDS) {
    const value = raw[field.name];
    if (value === undefined) continue;

    let normalized = value.trim();
    if (field.input === "uf") normalized = normalized.toUpperCase();
    if (field.input === "slug") normalized = normalized.toLowerCase();
    // Aceita com ou sem "@" na frente; guarda sempre sem, para o perfil público
    // montar o link (instagram.com/<handle>) sem duplicar o símbolo.
    if (field.input === "handle") normalized = normalized.replace(/^@/, "");

    if (normalized.length > 0) {
      assign(out, field.name, normalized);
    } else if (field.weight !== "required") {
      // Vazio em campo não obrigatório vira null EXPLÍCITO: é assim que o dono
      // apaga uma cidade que preencheu antes. Guardar "" faria a completude
      // contar como preenchido e o perfil exibir rótulo sem conteúdo.
      assign(out, field.name, null);
    }
    // Obrigatório vazio não entra no patch. A validação já barrou antes, e
    // mandar null aqui violaria o NOT NULL da coluna.
  }

  return out;
}

/**
 * O compilador não consegue saber quais chaves aceitam null: a obrigatoriedade
 * vive em `fields.ts`, que é dado de runtime. Quem garante é o `if` acima —
 * este cast só admite isso em um lugar, em vez de espalhar `as` pelas actions.
 */
function assign(target: KennelPatch, key: KennelFieldName, value: string | null): void {
  (target as Record<string, string | null>)[key] = value;
}

export function validateKennel(raw: KennelInput): FieldErrors {
  const errors: FieldErrors = {};
  const values = normalizeKennelInput(raw);

  for (const field of KENNEL_FORM_FIELDS) {
    const value = values[field.name];

    if (field.weight === "required" && !value) {
      errors[field.name] = `${field.label} é obrigatório.`;
      continue;
    }

    if (!value) continue;

    if (field.maxLength && value.length > field.maxLength) {
      errors[field.name] = `${field.label} deve ter no máximo ${field.maxLength} caracteres.`;
      continue;
    }

    if (field.pattern && !field.pattern.test(value)) {
      errors[field.name] = field.patternError ?? `${field.label} está em formato inválido.`;
      continue;
    }

    if (field.input === "url" && !isHttpUrl(value)) {
      errors[field.name] = "Informe um endereço começando com http:// ou https://.";
    }
  }

  // O slug vira URL pública e a coluna é única para sempre — inclusive contra
  // canis excluídos logicamente. Comprimento mínimo evita queimar "a" e "ab".
  const slug = values.slug;
  if (slug && slug.length < 3) {
    errors.slug = "A URL precisa de ao menos 3 caracteres.";
  }

  return errors;
}

/**
 * Só http e https. `javascript:` num link de perfil público seria XSS na cara,
 * e `data:` permite embutir página inteira.
 */
export function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Sugere um slug a partir do nome. É sugestão, não imposição: o dono confirma,
 * porque depois de publicado o endereço não deveria mudar.
 *
 * Remove acento antes de filtrar — sem isso "Canil Ipê" viraria "canil-ip".
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
