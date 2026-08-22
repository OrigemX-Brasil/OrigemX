"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { deleteMedia } from "@/modules/media/actions";
import { ImageUploader } from "@/modules/media/components/image-uploader";
import { formatBytes } from "@/modules/media/constraints";
import type { PublishState } from "@/modules/media/publish";
import type { ResolvedMedia } from "@/modules/media/queries";

import {
  addTestimonial,
  publishTestimonial,
  softDeleteTestimonial,
  unpublishTestimonial,
  updateTestimonial,
  type TestimonialFormState,
} from "../actions";
import { MAX_AUTHOR_NAME_LENGTH, MAX_TESTIMONIAL_TEXT_LENGTH } from "../constraints";
import type { Testimonial } from "../queries";

import { StarRating } from "./star-rating";
import { StarRatingInput } from "./star-rating-input";

/**
 * ============================================================================
 * Depoimentos — lista REPETÍVEL, mesmo desenho de `HealthSection`.
 * ============================================================================
 *
 * Sem estado de array no client: a lista vem pronta do servidor, cada linha
 * tem os próprios formulários de editar/excluir/publicar. O avatar só existe
 * depois que o depoimento já tem `id` — mesmo padrão do logo do canil e do
 * upload embutido em `PuppyRow`.
 */

const INPUT_CLS =
  "border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2 text-sm outline-none transition-colors";

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

/** Campos compartilhados por adicionar e editar. */
function TestimonialFields({
  idPrefix,
  errors,
  defaults,
  dogs,
}: {
  idPrefix: string;
  errors: Partial<Record<"author_name" | "text" | "rating", string>>;
  defaults?: Pick<Testimonial, "author_name" | "text" | "rating" | "dog_id">;
  dogs: Array<{ id: string; name: string }>;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-author`} className="text-fg-muted text-xs font-medium">
            Nome de quem deu o depoimento
          </label>
          <input
            id={`${idPrefix}-author`}
            name="author_name"
            type="text"
            defaultValue={defaults?.author_name}
            maxLength={MAX_AUTHOR_NAME_LENGTH}
            placeholder="Maria Silva"
            className={INPUT_CLS}
          />
          {errors.author_name ? (
            <p role="alert" className="text-danger text-xs">
              {errors.author_name}
            </p>
          ) : null}
        </div>

        {dogs.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-dog`} className="text-fg-muted text-xs font-medium">
              Sobre qual cão (opcional)
            </label>
            <select
              id={`${idPrefix}-dog`}
              name="dog_id"
              defaultValue={defaults?.dog_id ?? ""}
              className={INPUT_CLS}
            >
              <option value="">Nenhum em especial</option>
              {dogs.map((dog) => (
                <option key={dog.id} value={dog.id}>
                  {dog.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-text`} className="text-fg-muted text-xs font-medium">
          Depoimento
        </label>
        <textarea
          id={`${idPrefix}-text`}
          name="text"
          rows={3}
          defaultValue={defaults?.text}
          maxLength={MAX_TESTIMONIAL_TEXT_LENGTH}
          className={INPUT_CLS}
        />
        {errors.text ? (
          <p role="alert" className="text-danger text-xs">
            {errors.text}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-fg-muted text-xs font-medium">Nota (opcional)</span>
        <StarRatingInput idPrefix={idPrefix} defaultValue={defaults?.rating} />
        {errors.rating ? (
          <p role="alert" className="text-danger text-xs">
            {errors.rating}
          </p>
        ) : null}
      </div>
    </>
  );
}

function PublishSwitch({
  testimonialId,
  isPublished,
}: {
  testimonialId: string;
  isPublished: boolean;
}) {
  const action = isPublished ? unpublishTestimonial : publishTestimonial;
  const [state, formAction] = useActionState<PublishState, FormData>(
    async (_prev, formData) => action(formData),
    {},
  );

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={testimonialId} />
      <button
        type="submit"
        className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
      >
        {isPublished ? "Ocultar" : "Publicar"}
      </button>
      {state.error ? (
        <p role="alert" className="text-danger text-xs">
          {state.error}
        </p>
      ) : null}
      {state.warning ? (
        <p role="alert" className="text-fg-faint text-xs">
          {state.warning}
        </p>
      ) : null}
    </form>
  );
}

function TestimonialRow({
  testimonial,
  kennelId,
  dogs,
  dogName,
  avatar,
  ownerId,
  initialEditing = false,
}: {
  testimonial: Testimonial;
  kennelId: string;
  dogs: Array<{ id: string; name: string }>;
  dogName: string | null;
  avatar: ResolvedMedia | null;
  ownerId: string;
  /**
   * Nasce em modo editar — só o card RECÉM-CRIADO usa isto (ver
   * `TestimonialSection`), para o uploader de avatar já estar visível sem
   * exigir um segundo clique em "Editar". Lido só na primeira renderização —
   * `useState` ignora mudanças depois disso, o que é o comportamento certo:
   * não é para fechar sozinho nem reabrir um card que o dono já mexeu.
   */
  initialEditing?: boolean;
}) {
  const [editando, setEditando] = useState(initialEditing);
  const [state, formAction] = useActionState<TestimonialFormState, FormData>(updateTestimonial, {});

  // Ajuste DURANTE O RENDER, mesmo padrão de `HealthSection`: `useActionState`
  // devolve objeto novo por submissão, então comparar o objeto inteiro (não
  // só `state.ok`) é o que evita a segunda edição não fechar.
  const [ultimoState, setUltimoState] = useState(state);
  if (state !== ultimoState) {
    setUltimoState(state);
    if (state.ok) setEditando(false);
  }

  if (editando) {
    return (
      <li className="border-border bg-surface rounded-control flex flex-col gap-3 border px-3 py-3">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={testimonial.id} />
          <input type="hidden" name="kennel_id" value={kennelId} />

          <TestimonialFields
            idPrefix={`edit-${testimonial.id}`}
            errors={state.errors ?? {}}
            defaults={testimonial}
            dogs={dogs}
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

        <div className="border-border flex items-center gap-4 border-t pt-3">
          {avatar?.thumbUrl ? (
            <Image
              src={avatar.thumbUrl}
              alt=""
              width={56}
              height={56}
              className="border-border rounded-card border object-cover"
              unoptimized
            />
          ) : null}
          <div className="flex flex-col gap-1.5">
            {avatar ? (
              <>
                <span className="text-fg-faint font-mono text-xs">
                  {formatBytes(avatar.size_bytes)}
                </span>
                <form action={deleteMedia}>
                  <input type="hidden" name="id" value={avatar.id} />
                  <button
                    type="submit"
                    className="text-fg-muted hover:text-danger self-start text-xs transition-colors"
                  >
                    Remover avatar
                  </button>
                </form>
              </>
            ) : null}
            <ImageUploader
              role="testimonial_avatar"
              entityId={testimonial.id}
              ownerId={ownerId}
              label={avatar ? "Trocar avatar" : "Adicionar avatar (opcional)"}
              consent={{
                label:
                  "Confirmo que tenho autorização desta pessoa para publicar a foto dela nesta página.",
                fieldName: "lgpd_consent",
              }}
            />
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="border-border bg-surface rounded-control flex flex-wrap items-start gap-x-3 gap-y-2 border px-3 py-2.5">
      {avatar?.thumbUrl ? (
        <Image
          src={avatar.thumbUrl}
          alt=""
          width={40}
          height={40}
          className="border-border rounded-card border object-cover"
          unoptimized
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-fg text-sm font-medium">{testimonial.author_name}</span>
          <StarRating value={testimonial.rating} />
          {dogName ? (
            <span className="border-border text-fg-faint rounded-control border px-1.5 py-0.5 text-xs">
              {dogName}
            </span>
          ) : null}
          {!testimonial.published_at ? (
            <span className="text-fg-faint text-xs">Rascunho</span>
          ) : null}
        </div>
        <p className="text-fg-muted text-sm">{testimonial.text}</p>
      </div>

      <div className="ml-auto flex items-start gap-1">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
        >
          Editar
        </button>
        <PublishSwitch
          testimonialId={testimonial.id}
          isPublished={Boolean(testimonial.published_at)}
        />
        <form action={softDeleteTestimonial}>
          <input type="hidden" name="id" value={testimonial.id} />
          <input type="hidden" name="kennel_id" value={kennelId} />
          <button
            type="submit"
            className="text-fg-faint hover:text-danger focus-visible:outline-ring rounded-control px-2 py-1 text-xs transition-colors focus-visible:outline-2"
          >
            Remover
          </button>
        </form>
      </div>
    </li>
  );
}

export function TestimonialSection({
  kennelId,
  testimonials,
  dogs,
  avatars,
  ownerId,
}: {
  kennelId: string;
  testimonials: Testimonial[];
  dogs: Array<{ id: string; name: string }>;
  avatars: Map<string, ResolvedMedia>;
  ownerId: string;
}) {
  const [state, formAction] = useActionState<TestimonialFormState, FormData>(addTestimonial, {});
  const dogsById = new Map(dogs.map((d) => [d.id, d.name]));

  // O id do depoimento que ACABOU de ser criado nesta sessão de tela — é o
  // que faz a linha nova já nascer em modo editar, com o uploader de avatar à
  // vista, sem exigir um segundo clique. Comparação de OBJETO (não só
  // `state.ok`) porque `useActionState` devolve um objeto novo a cada
  // submissão, mesmo padrão já usado em `TestimonialRow`.
  const [recemCriadoId, setRecemCriadoId] = useState<string | null>(null);
  const [ultimoState, setUltimoState] = useState(state);
  if (state !== ultimoState) {
    setUltimoState(state);
    if (state.ok && state.id) setRecemCriadoId(state.id);
  }

  return (
    <div className="flex flex-col gap-4">
      {testimonials.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {testimonials.map((testimonial) => (
            <TestimonialRow
              key={testimonial.id}
              testimonial={testimonial}
              kennelId={kennelId}
              dogs={dogs}
              dogName={testimonial.dog_id ? (dogsById.get(testimonial.dog_id) ?? null) : null}
              avatar={avatars.get(testimonial.id) ?? null}
              ownerId={ownerId}
              initialEditing={testimonial.id === recemCriadoId}
            />
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted text-sm">Nenhum depoimento cadastrado ainda.</p>
      )}

      <form action={formAction} className="border-border flex flex-col gap-3 border-t pt-4">
        <input type="hidden" name="kennel_id" value={kennelId} />

        <TestimonialFields idPrefix="testimonial" errors={state.errors ?? {}} dogs={dogs} />

        <label className="text-fg-faint flex items-start gap-2 text-xs">
          <input type="checkbox" name="lgpd_consent" className="mt-0.5" />
          Confirmo que tenho autorização desta pessoa para publicar o nome e, se eu enviar, a foto
          dela nesta página.
        </label>

        <div className="flex items-center gap-3">
          <Submit label="Adicionar depoimento" />
          {state.formError ? (
            <p role="alert" className="text-danger text-xs">
              {state.formError}
            </p>
          ) : null}
          {state.ok ? (
            <p role="status" className="text-success text-xs">
              Depoimento adicionado.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
