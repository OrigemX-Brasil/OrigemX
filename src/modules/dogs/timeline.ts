import { healthKindLabel } from "@/modules/health/constraints";
import type { GeneticTest, HealthRecord } from "@/modules/health/queries";
import { measurementKindName, measurementUnit } from "@/modules/measurements/constraints";
import type { Measurement } from "@/modules/measurements/queries";
import type { ResolvedMedia } from "@/modules/media/queries";

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
 * (`dog_health_records.applied_on`), exames genéticos
 * (`dog_genetic_tests.tested_on`) e peso/cernelha
 * (`dog_measurements.measured_on`). Cada evento é um fato datado que o criador
 * digitou sabendo a data — e é por isso que TODA medição entra, não só a mais
 * recente: é a evolução que a Story Timeline existe para mostrar, e a última
 * pesagem sozinha já aparece no resumo da ficha (`latestMeasurement`).
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
  /** Segunda linha, quando há: produto da vacina, resultado do exame, valor
   *  da medição. */
  detail: string | null;
  kind: "birth" | "health" | "genetic" | "measurement";
  /** Só medição pode ter — é a única origem com uma foto vinculada a UM
   *  registro datado (`media.measurement_id`). `null` no resto, e também numa
   *  medição sem foto. */
  photo: ResolvedMedia | null;
};

/**
 * "1ª Semana", "3ª Semana" — a legenda do mockup, calculada a partir da data
 * de nascimento. SÓ existe quando há FOTO: sem ela a linha continua com o
 * rótulo de tipo ("Peso"/"Cernelha"), que já diz o que o número significa.
 *
 * Arredonda para a semana mais próxima, não trunca: uma pesagem no dia 7
 * exato precisa cair em "1ª Semana", não em "0ª" (truncar dividiria por 7 e
 * pegaria o piso) nem esperar o dia 14 para virar "2ª" (grandeza de calendário
 * corrido, não semana cheia). Piso de 1: uma medição no mesmo dia do
 * nascimento ainda é vida na "1ª Semana", não uma "0ª Semana" sem sentido.
 */
function weekLabel(bornOn: string, measuredOn: string): string {
  const born = Date.parse(`${bornOn}T00:00:00Z`);
  const measured = Date.parse(`${measuredOn}T00:00:00Z`);
  const diffDays = Math.round((measured - born) / 86_400_000);
  const week = Math.max(1, Math.round(diffDays / 7));
  return `${week}ª Semana`;
}

/**
 * `tested_on` é NULLABLE em `dog_genetic_tests` — laudo sem data cadastrada
 * simplesmente não entra na linha, em vez de entrar com uma data inventada.
 * É a mesma regra dos badges: nada aparece sem o dado que o sustenta.
 */
export function buildDogTimeline({
  bornOn,
  health,
  genetics,
  measurements,
  measurementPhotos = new Map(),
}: {
  bornOn: string | null;
  health: readonly HealthRecord[];
  genetics: readonly GeneticTest[];
  measurements: readonly Measurement[];
  /** Foto de CADA medição, por `measurement.id` — o que `getMeasurementPhotos`
   *  devolve. Opcional e com padrão vazio: todo chamador que ainda não busca
   *  foto continua funcionando exatamente como antes, sem foto em nenhum
   *  evento. */
  measurementPhotos?: Map<string, ResolvedMedia>;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (bornOn) {
    events.push({
      id: "birth",
      date: bornOn,
      label: "Nascimento",
      detail: null,
      kind: "birth",
      photo: null,
    });
  }

  for (const record of health) {
    events.push({
      id: `health-${record.id}`,
      date: record.applied_on,
      label: healthKindLabel(record.kind),
      detail: record.product,
      kind: "health",
      photo: null,
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
      photo: null,
    });
  }

  for (const measurement of measurements) {
    const photo = measurementPhotos.get(measurement.id) ?? null;
    events.push({
      id: `measurement-${measurement.id}`,
      date: measurement.measured_on,
      // Só COM foto a legenda vira semana — sem ela, o rótulo de tipo
      // continua dizendo o que o número significa.
      label:
        photo && bornOn
          ? weekLabel(bornOn, measurement.measured_on)
          : measurementKindName(measurement.kind),
      detail: `${measurement.value} ${measurementUnit(measurement.kind)}`,
      kind: "measurement",
      photo,
    });
  }

  // `date` é ISO `yyyy-mm-dd`, então comparar string É comparar cronologia —
  // sem `new Date()`, sem fuso. Mesmo raciocínio já documentado em
  // `health/summary.ts`.
  //
  // Empate de data desempata por `id`: dois eventos no mesmo dia (V10 +
  // antirrábica) são plausíveis, e sem o desempate a ordem viria do Postgres
  // e a página "piscaria" entre deploys.
  return events.sort((a, b) =>
    a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
}
