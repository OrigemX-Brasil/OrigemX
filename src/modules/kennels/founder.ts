/**
 * Selo "Criador Fundador" — formatação e critério, puros.
 *
 * A ATRIBUIÇÃO não está aqui, e não pode estar: ela é atômica no banco, numa
 * sequence com teto. Este módulo só formata o que já foi atribuído e diz ao
 * criador o que ainda falta para se tornar elegível — a mesma regra, do lado da
 * tela, para ele não ficar no escuro esperando um selo que não vem.
 *
 * Se as duas divergirem, quem manda é o banco.
 */

/** Espelha `maxvalue` da sequence `kennel_founder_seq`. */
export const FOUNDER_LIMIT = 100;

/** Três dígitos, como o cliente aprovou: "Criador Fundador nº 007". */
export function formatFounderNumber(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > FOUNDER_LIMIT) return null;
  return `Criador Fundador nº ${String(value).padStart(3, "0")}`;
}

/** Só o número, para onde o rótulo já apareceu. */
export function formatFounderDigits(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > FOUNDER_LIMIT) return null;
  return String(value).padStart(3, "0");
}

export type FounderInput = {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  hasLogo?: boolean;
  dogCount?: number;
};

export type FounderRequirement = {
  key: "name" | "city" | "state" | "logo" | "dog";
  label: string;
  met: boolean;
};

export type FounderEligibility = {
  eligible: boolean;
  requirements: readonly FounderRequirement[];
  missing: readonly FounderRequirement[];
};

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Mesmo critério de `public.kennel_is_founder_eligible`.
 *
 * Duplicar aqui não é redundância inútil: é o que permite a tela listar o que
 * falta ANTES de o criador descobrir sozinho que não ganhou selo. O banco
 * continua sendo quem decide.
 */
export function founderEligibility(input: FounderInput): FounderEligibility {
  const requirements: FounderRequirement[] = [
    { key: "name", label: "Nome do canil", met: filled(input.name) },
    { key: "city", label: "Cidade", met: filled(input.city) },
    { key: "state", label: "Estado", met: filled(input.state) },
    { key: "logo", label: "Logo", met: input.hasLogo === true },
    { key: "dog", label: "Ao menos 1 cão cadastrado", met: (input.dogCount ?? 0) > 0 },
  ];

  const missing = requirements.filter((r) => !r.met);

  return {
    eligible: missing.length === 0,
    requirements,
    missing,
  };
}
