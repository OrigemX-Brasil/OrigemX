import { createClient } from "@/lib/supabase/server";
import { isGhostAncestor } from "@/modules/dogs/ancestors";
import { calculateDogCompleteness } from "@/modules/dogs/completeness";
import { listMyDogs, type DogListItem } from "@/modules/dogs/queries";
import { calculateCompleteness } from "@/modules/kennels/completeness";
import { founderEligibility } from "@/modules/kennels/founder";
import { countKennelDogs, getMyKennel, type KennelListItem } from "@/modules/kennels/queries";
import { MAX_GALLERY_ITEMS } from "@/modules/media/constraints";

import { evaluateRules, mergeAlerts, type Alert, type AlertSubject } from "./engine";
import {
  ACCOUNT_RULES,
  DOG_RULES,
  KENNEL_RULES,
  type AccountFacts,
  type DogFacts,
  type KennelFacts,
} from "./rules";

/**
 * ============================================================================
 * Levantamento dos fatos que as regras avaliam.
 * ============================================================================
 *
 * ALERTA É DERIVADO, NUNCA ARMAZENADO. Não existe tabela de alertas, e a
 * ausência dela é decisão, não pendência:
 *
 * 1. Um alerta é uma afirmação sobre o dado de AGORA. Guardado, ele vira uma
 *    segunda fonte de verdade que fica velha no instante em que o criador sobe
 *    o logo — e aí o painel mente.
 * 2. Manter os dois em dia exigiria recálculo em background, e fila está FORA
 *    DE ESCOPO por contrato.
 * 3. Sem tabela não há policy nova para errar. O criador só recebe alerta sobre
 *    linha que a RLS já deixou ele ler, porque é dessa leitura que o alerta
 *    nasce. A autorização vem de graça.
 *
 * NADA AQUI LEVANTA EXCEÇÃO. Alerta é acessório: se o levantamento falhar, o
 * painel renderiza sem a seção. Um aviso sobre foto faltando não pode derrubar
 * a tela inteira.
 */

/**
 * Teto do levantamento.
 *
 * A invariante de performance não abre exceção para alerta: nenhuma listagem
 * sem limite. Este número cobre com folga o criador real — o cliente falou em
 * canis com dezenas de cães, não milhares —, e quando não cobre a tela DIZ que
 * analisou uma parte, em vez de omitir em silêncio.
 *
 * Não há teto de canis porque não há listagem de canis: o criador tem no máximo
 * um (`kennels_owner_uk`). Uma linha ou nenhuma não tem truncamento a declarar.
 */
export const ALERT_SCAN = {
  dogs: 60,
} as const;

/** Quantos itens por alerta a tela lista antes de resumir em "e mais N". */
export const ALERT_TARGETS_VISIBLE = 4;

export type AlertsResult = {
  alerts: Alert[];
  /** O que foi efetivamente analisado — a tela precisa poder ser honesta. */
  scan: {
    dogs: number;
    dogsTruncated: boolean;
  };
};

const EMPTY: AlertsResult = {
  alerts: [],
  scan: { dogs: 0, dogsTruncated: false },
};

/**
 * Quais canis e cães têm mídia, em duas consultas — nunca uma por registro.
 *
 * O limite de cada consulta é o MÁXIMO EXATO de linhas que ela pode devolver
 * (um logo por canil; `MAX_GALLERY_ITEMS` fotos por cão), então o teto não corta
 * resultado legítimo: é bound, não amostragem.
 */
async function loadMediaPresence(kennelIds: string[], dogIds: string[]) {
  const supabase = await createClient();
  const withLogo = new Set<string>();
  const withPhoto = new Set<string>();

  const [logos, photos] = await Promise.all([
    kennelIds.length > 0
      ? supabase
          .from("media")
          .select("kennel_id")
          .in("kennel_id", kennelIds)
          .eq("role", "kennel_logo")
          .is("deleted_at", null)
          .limit(kennelIds.length)
      : null,
    dogIds.length > 0
      ? supabase
          .from("media")
          .select("dog_id")
          .in("dog_id", dogIds)
          .eq("role", "dog_gallery")
          .is("deleted_at", null)
          // Uma linha por foto. A galeria é limitada por cão, então este produto
          // é o teto real, e não um corte arbitrário.
          .limit(dogIds.length * MAX_GALLERY_ITEMS)
      : null,
  ]);

  for (const row of logos?.data ?? []) if (row.kennel_id) withLogo.add(row.kennel_id);
  for (const row of photos?.data ?? []) if (row.dog_id) withPhoto.add(row.dog_id);

  return { withLogo, withPhoto };
}

/**
 * Quais canis têm ao menos um cão.
 *
 * Primeiro deduz dos cães já lidos: se um canil aparece entre eles, tem cão, e
 * não custa consulta nenhuma. Só os canis que NÃO apareceram precisam de
 * checagem — e são justamente os candidatos a estarem mesmo vazios, que é o
 * caso raro. No cenário comum isto faz zero consultas extras.
 */
async function loadKennelsWithDogs(
  kennels: readonly KennelListItem[],
  dogs: readonly DogListItem[],
): Promise<Set<string>> {
  const withDogs = new Set<string>();
  for (const dog of dogs) if (dog.kennel_id) withDogs.add(dog.kennel_id);

  const unknown = kennels.filter((k) => !withDogs.has(k.id));
  const counts = await Promise.all(unknown.map((k) => countKennelDogs(k.id)));

  unknown.forEach((kennel, i) => {
    if ((counts[i] ?? 0) > 0) withDogs.add(kennel.id);
  });

  return withDogs;
}

export async function getAlertsForUser(userId: string): Promise<AlertsResult> {
  try {
    const [kennel, dogPage] = await Promise.all([
      getMyKennel(userId),
      listMyDogs(userId, {}, { limit: ALERT_SCAN.dogs }),
    ]);

    // Zero ou um. As funções abaixo e o motor de regras aceitam os dois casos
    // sem tratamento especial — `engine.ts` não conhece regra nenhuma, e ensiná-lo
    // que canil é singular seria o acoplamento que o src/modules/README.md proíbe.
    const kennels = kennel ? [kennel] : [];

    // Fantasma fora, e fora AQUI: ele é registro mínimo por definição, e cobrar
    // foto ou raça dele seria cobrar algo que não deveria existir. Excluindo na
    // montagem do sujeito, uma regra nova nasce correta sem que o cliente
    // precise lembrar da ressalva.
    const dogs = dogPage.items.filter((dog) => !isGhostAncestor(dog));

    const [{ withLogo, withPhoto }, kennelsWithDogs] = await Promise.all([
      loadMediaPresence(
        kennels.map((k) => k.id),
        dogs.map((d) => d.id),
      ),
      loadKennelsWithDogs(kennels, dogs),
    ]);

    const accountSubjects: AlertSubject<AccountFacts>[] = [
      {
        id: userId,
        label: "Sua conta",
        href: "/painel/canis/novo",
        facts: { hasKennel: kennel !== null, dogCount: dogs.length },
      },
    ];

    const kennelSubjects: AlertSubject<KennelFacts>[] = kennels.map((kennel) => {
      const hasLogo = withLogo.has(kennel.id);
      const hasDogs = kennelsWithDogs.has(kennel.id);

      // A completude pergunta pela MÍDIA, não pela coluna `logo_url`: o logo
      // mora em `media`, e a coluna seria uma segunda fonte de verdade.
      const completeness = calculateCompleteness({
        ...kennel,
        logo_url: hasLogo ? "presente" : null,
      });

      const founder = founderEligibility({
        name: kennel.name,
        city: kennel.city,
        state: kennel.state,
        hasLogo,
        dogCount: hasDogs ? 1 : 0,
      });

      return {
        id: kennel.id,
        label: kennel.name,
        href: `/painel/canis/${kennel.id}`,
        facts: {
          completenessPercent: completeness.percent,
          missingRequired: completeness.missingRequired.map((f) => ({
            name: f.name,
            label: f.label,
          })),
          missingRecommended: completeness.missingRecommended.map((f) => ({
            name: f.name,
            label: f.label,
          })),
          hasLogo,
          isPublished: Boolean(kennel.published_at),
          hasDogs,
          hasFounderBadge: kennel.founder_number !== null,
          founderMissing: founder.missing.map((r) => r.label),
        },
      };
    });

    const userHasKennel = kennel !== null;

    const dogSubjects: AlertSubject<DogFacts>[] = dogs.map((dog) => {
      // A completude pergunta pela MÍDIA, não por coluna — o cão não tem
      // coluna de foto. Mesmo par que o canil monta acima com o logo, e a
      // mesma função pura que a página de edição usa: um número só, calculado
      // num lugar só.
      const completeness = calculateDogCompleteness({
        ...dog,
        photo: withPhoto.has(dog.id) ? "1" : null,
      });

      return {
        id: dog.id,
        label: dog.name,
        href: `/painel/caes/${dog.id}`,
        facts: {
          hasPhoto: withPhoto.has(dog.id),
          hasSire: dog.sire_id !== null,
          hasDam: dog.dam_id !== null,
          hasKennel: dog.kennel_id !== null,
          isPublished: Boolean(dog.published_at),
          userHasKennel,
          completenessPercent: completeness.percent,
          missingRecommended: completeness.missingRecommended.map((f) => ({
            name: f.name,
            label: f.label,
          })),
        },
      };
    });

    return {
      alerts: mergeAlerts(
        evaluateRules(ACCOUNT_RULES, accountSubjects),
        evaluateRules(KENNEL_RULES, kennelSubjects),
        evaluateRules(DOG_RULES, dogSubjects),
      ),
      scan: {
        dogs: dogs.length,
        dogsTruncated: dogPage.nextCursor !== null,
      },
    };
  } catch {
    return EMPTY;
  }
}
