/**
 * ============================================================================
 * Quantos filhotes ainda estão disponíveis, por sexo. PURO, sem banco.
 * ============================================================================
 *
 * CONTADO, nunca digitado — mesma regra que a barra de resumo da ninhada já
 * segue: um total que discorda das linhas é o pior tipo de bug de vitrine.
 *
 * O denominador é a lista que o VISITANTE vê: `getPublicLitterPuppies` já
 * filtra `published_at not null`, então filhote em rascunho não entra na
 * conta. Dizer "restam 3" numa página que mostra 2 cards seria pior que não
 * dizer nada.
 */

export type Availability = { males: number; females: number };

/** Espelha o CHECK `dogs_litter_status_valid`. */
const AVAILABLE = "available";

export function countAvailableBySex(
  puppies: readonly { sex: string; litter_status: string | null }[],
): Availability {
  let males = 0;
  let females = 0;

  for (const puppy of puppies) {
    if (puppy.litter_status !== AVAILABLE) continue;
    if (puppy.sex === "male") males += 1;
    else if (puppy.sex === "female") females += 1;
  }

  return { males, females };
}

/**
 * "2 machos e 1 fêmea", "1 macho", "2 fêmeas" — ou `null` quando não restou
 * nenhum, e aí a seção inteira não aparece.
 *
 * Singular e plural resolvidos aqui, num lugar só: "1 fêmeas" é o tipo de
 * detalhe que faz a página parecer gerada por máquina.
 */
export function describeAvailability({ males, females }: Availability): string | null {
  const partes: string[] = [];
  if (males > 0) partes.push(`${males} ${males === 1 ? "macho" : "machos"}`);
  if (females > 0) partes.push(`${females} ${females === 1 ? "fêmea" : "fêmeas"}`);

  if (partes.length === 0) return null;
  return partes.join(" e ");
}
