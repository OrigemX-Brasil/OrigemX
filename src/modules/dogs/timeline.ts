import { healthKindLabel } from "@/modules/health/constraints";
import type { GeneticTest, HealthRecord } from "@/modules/health/queries";

/**
 * ============================================================================
 * A história do cão — linha do tempo de EVENTOS COM DATA REAL.
 * ============================================================================
 *
 * PURO, sem banco: monta a linha a partir do que a página já carregou.
 *
 * POR QUE NÃO É UMA LINHA DO TEMPO DE FOTOS, que seria o óbvio: `media` não
 * guarda quando a foto foi TIRADA. As únicas colunas de tempo são
 * `created_at` (upload), `updated_at` (mexido por reordenação e por troca de
 * legenda) e `deleted_at`. O EXIF é lido na compressão só para corrigir
 * rotação, e descartado. Um criador que suba hoje as quatro fotos do filhote
 * — nascimento, 1ª, 3ª e 5ª semana — produziria quatro eventos na mesma data,
 * e a "história" seria uma mentira com aparência de precisão.
 *
 * Então a linha é feita do que TEM data de verdade e já está na página:
 * nascimento (`dogs.born_on`), vermífugo e vacina
 * (`dog_health_records.applied_on`) e exames genéticos
 * (`dog_genetic_tests.tested_on`). Cada evento é um fato datado que o criador
 * digitou sabendo a data.
 *
 * Sem teto de itens: as duas consultas de origem já limitam (60 registros de
 * saúde e 30 exames por cão), e um cão real tem poucos. O trilho rola na
 * horizontal se passar da largura.
 */

export type TimelineEvent = {
  /** Estável e único na lista — serve de `key` no React. */
  id: string;
  /** ISO `yyyy-mm-dd`. */
  date: string;
  label: string;
  /** Segunda linha, quando há: produto da vacina, resultado do exame. */
  detail: string | null;
  kind: "birth" | "health" | "genetic";
};

/**
 * `tested_on` é NULLABLE em `dog_genetic_tests` — laudo sem data cadastrada
 * simplesmente não entra na linha, em vez de entrar com uma data inventada.
 * É a mesma regra dos badges: nada aparece sem o dado que o sustenta.
 */
export function buildDogTimeline({
  bornOn,
  health,
  genetics,
}: {
  bornOn: string | null;
  health: readonly HealthRecord[];
  genetics: readonly GeneticTest[];
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (bornOn) {
    events.push({ id: "birth", date: bornOn, label: "Nascimento", detail: null, kind: "birth" });
  }

  for (const record of health) {
    events.push({
      id: `health-${record.id}`,
      date: record.applied_on,
      label: healthKindLabel(record.kind),
      detail: record.product,
      kind: "health",
    });
  }

  for (const test of genetics) {
    if (!test.tested_on) continue;
    events.push({
      id: `genetic-${test.id}`,
      date: test.tested_on,
      label: test.name,
      detail: test.result,
      kind: "genetic",
    });
  }

  // `date` é ISO `yyyy-mm-dd`, então comparar string É comparar cronologia —
  // sem `new Date()`, sem fuso. Mesmo raciocínio já documentado em
  // `health/summary.ts`.
  //
  // Empate de data desempata por `id`: dois eventos no mesmo dia (V10 +
  // antirrábica) são plausíveis, e sem o desempate a ordem viria do Postgres
  // e a página "piscaria" entre deploys.
  return events.sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
}
