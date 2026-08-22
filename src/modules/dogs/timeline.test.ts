import { describe, expect, it } from "vitest";

import type { GeneticTest, HealthRecord } from "@/modules/health/queries";
import type { ResolvedMedia } from "@/modules/media/queries";
import type { Measurement } from "@/modules/measurements/queries";

import { buildDogTimeline } from "./timeline";

function health(over: Partial<HealthRecord> & { id: string }): HealthRecord {
  return {
    dog_id: "d1",
    kind: "vaccine",
    applied_on: "2026-08-20",
    product: null,
    notes: null,
    ...over,
  };
}

function genetic(over: Partial<GeneticTest> & { id: string }): GeneticTest {
  return {
    dog_id: "d1",
    name: "Displasia coxofemoral",
    result: "A/A",
    tested_on: "2026-09-01",
    lab: null,
    ...over,
  };
}

function measurement(over: Partial<Measurement> & { id: string }): Measurement {
  return {
    dog_id: "d1",
    kind: "weight",
    value: 4.5,
    measured_on: "2026-08-20",
    notes: null,
    ...over,
  };
}

function photo(over: Partial<ResolvedMedia> & { id: string }): ResolvedMedia {
  return {
    bucket_id: "kennel-media-public",
    storage_path: `owner/medidas/${over.id}/foto.webp`,
    thumb_path: null,
    kennel_id: null,
    dog_id: null,
    litter_id: null,
    testimonial_id: null,
    measurement_id: over.id,
    role: "measurement_photo",
    mime: "image/webp",
    size_bytes: 1000,
    width: 800,
    height: 800,
    thumb_bytes: null,
    alt: null,
    caption: null,
    position: 0,
    owner_id: "u1",
    created_at: "2026-08-20T00:00:00Z",
    url: "https://example.test/foto.webp",
    thumbUrl: "https://example.test/foto-thumb.webp",
    ...over,
  };
}

describe("buildDogTimeline", () => {
  it("sem nada, devolve lista vazia — a seção some por inteiro", () => {
    expect(buildDogTimeline({ bornOn: null, health: [], genetics: [], measurements: [] })).toEqual(
      [],
    );
  });

  it("nascimento vira o primeiro evento", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [],
      genetics: [],
      measurements: [],
    });
    expect(linha).toHaveLength(1);
    expect(linha[0]).toMatchObject({ date: "2026-08-15", label: "Nascimento", kind: "birth" });
  });

  it("ordena cronologicamente, misturando as quatro origens", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [
        health({ id: "h2", kind: "vaccine", applied_on: "2026-09-20" }),
        health({ id: "h1", kind: "deworming", applied_on: "2026-08-25" }),
      ],
      genetics: [genetic({ id: "g1", tested_on: "2026-09-05" })],
      measurements: [measurement({ id: "m1", measured_on: "2026-08-30" })],
    });

    expect(linha.map((e) => e.date)).toEqual([
      "2026-08-15",
      "2026-08-25",
      "2026-08-30",
      "2026-09-05",
      "2026-09-20",
    ]);
  });

  it("não depende da ordem de entrada — embaralhar dá o mesmo resultado", () => {
    const registros = [
      health({ id: "h1", applied_on: "2026-09-01" }),
      health({ id: "h2", applied_on: "2026-08-20" }),
      health({ id: "h3", applied_on: "2026-10-05" }),
    ];

    const direto = buildDogTimeline({
      bornOn: "2026-08-15",
      health: registros,
      genetics: [],
      measurements: [],
    });
    const invertido = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [...registros].reverse(),
      genetics: [],
      measurements: [],
    });

    expect(direto.map((e) => e.id)).toEqual(invertido.map((e) => e.id));
  });

  it("empate de data é estável, desempatado por id", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [
        health({ id: "hb", applied_on: "2026-08-20" }),
        health({ id: "ha", applied_on: "2026-08-20" }),
      ],
      genetics: [],
      measurements: [],
    });

    expect(linha.map((e) => e.id)).toEqual(["health-ha", "health-hb"]);
  });

  /**
   * A regra central: nada entra sem data real. Laudo sem `tested_on` fica de
   * fora em vez de aparecer com uma data inventada.
   */
  it("exame SEM tested_on não entra na linha", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [],
      genetics: [genetic({ id: "g1", tested_on: null }), genetic({ id: "g2" })],
      measurements: [],
    });

    expect(linha).toHaveLength(1);
    expect(linha[0].id).toBe("genetic-g2");
  });

  it("leva o rótulo traduzido e o detalhe de cada origem", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [health({ id: "h1", kind: "deworming", product: "Drontal" })],
      genetics: [genetic({ id: "g1", name: "L2HGA", result: "Livre" })],
      measurements: [
        measurement({ id: "m1", kind: "weight", value: 4.5, measured_on: "2026-09-02" }),
      ],
    });

    expect(linha[0]).toMatchObject({ label: "Vermífugo", detail: "Drontal" });
    expect(linha[1]).toMatchObject({ label: "L2HGA", detail: "Livre" });
    expect(linha[2]).toMatchObject({ label: "Peso", detail: "4.5 kg" });
  });

  it("os ids são únicos entre origens — servem de key no React", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [health({ id: "x" })],
      genetics: [genetic({ id: "x" })],
      measurements: [measurement({ id: "x" })],
    });

    expect(new Set(linha.map((e) => e.id)).size).toBe(linha.length);
  });

  /**
   * "Evolução", não "valor mais recente": TODA medição entra na linha do
   * tempo, mesmo várias do mesmo tipo — é o resumo da ficha
   * (`latestMeasurement`) que mostra só a última, não a timeline.
   */
  it("toda medição do mesmo tipo entra — a evolução, não só a mais recente", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [],
      genetics: [],
      measurements: [
        measurement({ id: "m1", kind: "weight", value: 1.2, measured_on: "2026-08-01" }),
        measurement({ id: "m2", kind: "weight", value: 2.4, measured_on: "2026-08-15" }),
        measurement({ id: "m3", kind: "weight", value: 3.6, measured_on: "2026-08-29" }),
      ],
    });

    expect(linha).toHaveLength(3);
    expect(linha.map((e) => e.detail)).toEqual(["1.2 kg", "2.4 kg", "3.6 kg"]);
  });

  it("cernelha usa a unidade cm", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [],
      genetics: [],
      measurements: [
        measurement({ id: "m1", kind: "withers_height", value: 45, measured_on: "2026-08-20" }),
      ],
    });

    expect(linha[0]).toMatchObject({ label: "Cernelha", detail: "45 cm" });
  });

  /**
   * ==========================================================================
   * Foto na medição — legenda vira semana calculada, SÓ quando há foto.
   * ==========================================================================
   */

  it("sem measurementPhotos (parâmetro omitido), nenhum evento tem foto — comportamento antigo intacto", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [],
      genetics: [],
      measurements: [measurement({ id: "m1", measured_on: "2026-08-22" })],
    });

    const evento = linha.find((e) => e.kind === "measurement")!;
    expect(evento.photo).toBeNull();
    expect(evento.label).toBe("Peso");
  });

  it("medição SEM foto mantém o rótulo de tipo, mesmo com nascimento conhecido", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [],
      genetics: [],
      measurements: [measurement({ id: "m1", measured_on: "2026-08-22" })],
      measurementPhotos: new Map(),
    });

    const evento = linha.find((e) => e.kind === "measurement")!;
    expect(evento).toMatchObject({ label: "Peso", photo: null });
  });

  it("medição COM foto e nascimento conhecido: legenda vira semana calculada", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [],
      genetics: [],
      // Exatamente 7, 21 e 35 dias depois do nascimento — os mesmos saltos do
      // mockup original ("1ª Semana", "3ª Semana", "5ª Semana").
      measurements: [
        measurement({ id: "m1", measured_on: "2026-08-22" }),
        measurement({ id: "m2", measured_on: "2026-09-05" }),
        measurement({ id: "m3", measured_on: "2026-09-19" }),
      ],
      measurementPhotos: new Map([
        ["m1", photo({ id: "m1" })],
        ["m2", photo({ id: "m2" })],
        ["m3", photo({ id: "m3" })],
      ]),
    });

    const eventos = linha.filter((e) => e.kind === "measurement");
    expect(eventos.map((e) => e.label)).toEqual(["1ª Semana", "3ª Semana", "5ª Semana"]);
    expect(eventos.every((e) => e.photo !== null)).toBe(true);
  });

  it("medição COM foto mas SEM nascimento conhecido: cai de volta pro rótulo de tipo", () => {
    const linha = buildDogTimeline({
      bornOn: null,
      health: [],
      genetics: [],
      measurements: [measurement({ id: "m1", kind: "withers_height", measured_on: "2026-08-22" })],
      measurementPhotos: new Map([["m1", photo({ id: "m1" })]]),
    });

    // Sem nascimento não há semana para calcular — mentir uma semana seria
    // pior que manter o rótulo de tipo, mesma regra de "nada aparece sem o
    // dado que o sustenta" do resto do arquivo.
    expect(linha[0]).toMatchObject({ label: "Cernelha", photo: expect.anything() });
  });

  it("semana nunca cai a zero — medição no mesmo dia do nascimento vira 1ª Semana", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [],
      genetics: [],
      measurements: [measurement({ id: "m1", measured_on: "2026-08-15" })],
      measurementPhotos: new Map([["m1", photo({ id: "m1" })]]),
    });

    const evento = linha.find((e) => e.kind === "measurement")!;
    expect(evento.label).toBe("1ª Semana");
  });

  it("eventos de outra origem nunca têm foto, mesmo com measurementPhotos preenchido", () => {
    const linha = buildDogTimeline({
      bornOn: "2026-08-15",
      health: [health({ id: "h1" })],
      genetics: [genetic({ id: "g1" })],
      measurements: [],
      measurementPhotos: new Map([["m1", photo({ id: "m1" })]]),
    });

    expect(linha.every((e) => e.photo === null)).toBe(true);
  });
});
