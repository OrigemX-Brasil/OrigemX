"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { isoToBr } from "@/modules/dogs/br-date";
import { deleteMedia } from "@/modules/media/actions";
import { ImageUploader } from "@/modules/media/components/image-uploader";
import type { ResolvedMedia } from "@/modules/media/queries";

import {
  addMeasurement,
  deleteMeasurement,
  updateMeasurement,
  type MeasurementFormState,
} from "../actions";
import { measurementKindName, measurementUnit } from "../constraints";
import type { Measurement } from "../queries";

import { MeasurementFields } from "./measurement-fields";

/**
 * ============================================================================
 * Peso e cernelha — lista REPETÍVEL, com CRUD completo.
 * ============================================================================
 *
 * Mesmo desenho de `health/components/health-section.tsx`: um `<form>` por
 * linha, adicionar é outro, sem estado de array no client — a lista
 * rerenderiza do servidor.
 */

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="border-border-strong text-fg hover:bg-surface-hover rounded-control shrink-0 border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Salvando…" : label}
    </button>
  );
}

function MeasurementRow({
  measurement,
  dogId,
  readOnly,
  photo,
  ownerId,
  initialEditing = false,
}: {
  measurement: Measurement;
  dogId: string;
  readOnly?: boolean;
  photo: ResolvedMedia | null;
  ownerId: string;
  /** Nasce em modo editar — mesmo mecanismo de `TestimonialRow`, só a linha
   *  RECÉM-CRIADA usa isto, para o uploader já estar visível sem um segundo
   *  clique em "Editar". */
  initialEditing?: boolean;
}) {
  const [editando, setEditando] = useState(initialEditing);
  const [state, formAction] = useActionState<MeasurementFormState, FormData>(updateMeasurement, {});

  // Ajuste DURANTE O RENDER — mesmo padrão de `health-section.tsx`: reagir a
  // uma mudança de valor sem `useEffect`, proibido pelo lint do projeto.
  const [ultimoState, setUltimoState] = useState(state);
  if (state !== ultimoState) {
    setUltimoState(state);
    if (state.ok) setEditando(false);
  }

  if (editando) {
    return (
      <li className="border-border bg-surface rounded-control flex flex-col gap-3 border px-3 py-3">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={measurement.id} />
          <input type="hidden" name="dog_id" value={dogId} />

          <MeasurementFields
            idPrefix={`edit-${measurement.id}`}
            errors={state.errors ?? {}}
            defaults={measurement}
          />

          <div className="flex items-center gap-3">
            <Submit label="Salvar" />
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="text-fg-faint hover:text-fg rounded-control px-2 py-1 text-xs transition-colors"
            >
              Cancelar
            </button>
            {state.formError ? (
              <p role="alert" className="text-danger text-xs">
                {state.formError}
              </p>
            ) : null}
          </div>
        </form>

        {/* A foto DESTE momento — alimenta a Story Timeline do perfil público.
            Sem gate de LGPD: não é foto de terceiro, é o próprio filhote. */}
        <div className="border-border flex items-center gap-4 border-t pt-3">
          {photo?.thumbUrl ? (
            <Image
              src={photo.thumbUrl}
              alt=""
              width={56}
              height={56}
              className="border-border rounded-card border object-cover"
              unoptimized
            />
          ) : null}
          <div className="flex flex-col gap-1.5">
            {photo ? (
              <form action={deleteMedia}>
                <input type="hidden" name="id" value={photo.id} />
                <button
                  type="submit"
                  className="text-fg-muted hover:text-danger self-start text-xs transition-colors"
                >
                  Remover foto
                </button>
              </form>
            ) : null}
            <ImageUploader
              role="measurement_photo"
              entityId={measurement.id}
              ownerId={ownerId}
              label={photo ? "Trocar foto" : "Adicionar foto (opcional)"}
              helpText="Aparece na história do perfil público, ao lado desta medição."
            />
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="border-border bg-surface rounded-control flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2.5">
      {photo?.thumbUrl ? (
        <Image
          src={photo.thumbUrl}
          alt=""
          width={40}
          height={40}
          className="border-border rounded-card border object-cover"
          unoptimized
        />
      ) : null}
      <span className="text-fg text-sm font-medium">{measurementKindName(measurement.kind)}</span>
      <span className="text-data font-mono text-sm">
        {measurement.value} {measurementUnit(measurement.kind)}
      </span>
      <span className="text-fg-muted font-mono text-sm tabular-nums">
        {isoToBr(measurement.measured_on)}
      </span>
      {measurement.notes ? (
        <span className="text-fg-faint w-full text-xs">{measurement.notes}</span>
      ) : null}

      {!readOnly ? (
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
          >
            Editar
          </button>
          <form action={deleteMeasurement}>
            <input type="hidden" name="id" value={measurement.id} />
            <input type="hidden" name="dog_id" value={dogId} />
            <button
              type="submit"
              className="text-fg-faint hover:text-danger focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
            >
              Remover
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}

export function MeasurementsSection({
  dogId,
  measurements,
  readOnly,
  photos,
  ownerId,
}: {
  dogId: string;
  measurements: Measurement[];
  /** Cão de terceiro: mostra o histórico, não oferece formulário que a RLS recusaria. */
  readOnly?: boolean;
  photos: Map<string, ResolvedMedia>;
  ownerId: string;
}) {
  const [state, formAction] = useActionState<MeasurementFormState, FormData>(addMeasurement, {});

  // O id da medição RECÉM-CRIADA nesta sessão de tela — mesmo mecanismo de
  // `TestimonialSection`: a linha nova nasce já em modo editar, com o
  // uploader de foto à vista, sem exigir um segundo clique.
  const [recemCriadaId, setRecemCriadaId] = useState<string | null>(null);
  const [ultimoStateAdd, setUltimoStateAdd] = useState(state);
  if (state !== ultimoStateAdd) {
    setUltimoStateAdd(state);
    if (state.ok && state.id) setRecemCriadaId(state.id);
  }

  return (
    <div className="flex flex-col gap-4">
      {measurements.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {measurements.map((measurement) => (
            <MeasurementRow
              key={measurement.id}
              measurement={measurement}
              dogId={dogId}
              readOnly={readOnly}
              photo={photos.get(measurement.id) ?? null}
              ownerId={ownerId}
              initialEditing={measurement.id === recemCriadaId}
            />
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted text-sm">Nenhuma medição registrada ainda.</p>
      )}

      {readOnly ? null : (
        <form action={formAction} className="border-border flex flex-col gap-3 border-t pt-4">
          <input type="hidden" name="dog_id" value={dogId} />

          <MeasurementFields idPrefix="measurement" errors={state.errors ?? {}} />

          <div className="flex items-center gap-3">
            <Submit label="Adicionar medição" />
            {state.formError ? (
              <p role="alert" className="text-danger text-xs">
                {state.formError}
              </p>
            ) : null}
            {state.ok ? (
              <p role="status" className="text-success text-xs">
                Medição registrada.
              </p>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
