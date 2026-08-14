"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { ImageUploader } from "@/modules/media/components/image-uploader";

import {
  createGhostAncestor,
  searchAncestors,
  type AncestorSearchState,
  type DogFormState,
} from "../actions";
import {
  describeCandidate,
  isGhostAncestor,
  SLOT_LABEL,
  type AncestorCandidate,
  type ParentSlot,
} from "../ancestors";
import { DOG_GHOST_FIELDS } from "../fields";

/**
 * Seleção de pai ou mãe por BUSCA em cães já cadastrados.
 *
 * Nunca por digitação livre: campo de texto criaria um "Rex" por descendente, e
 * o pedigree viraria uma coleção de homônimos desconectados. A plataforma
 * depende de o mesmo ancestral ser a mesma linha.
 *
 * As Server Actions são chamadas como função, e não por `<form action>`, porque
 * este componente vive DENTRO do formulário do cão — e formulário aninhado é
 * inválido em HTML.
 */

const EMPTY_SEARCH: AncestorSearchState = {
  slot: "sire",
  term: "",
  results: [],
  truncated: false,
  searched: false,
};

export function ParentPicker({
  slot,
  dogId,
  ownerId,
  selected,
  otherParentId,
  error,
  onChange,
}: {
  slot: ParentSlot;
  dogId?: string | null;
  /** Dono da SESSÃO (não do ancestral — o fantasma não tem dono). Prefixo do
   *  caminho no Storage, exigido pela policy de `storage.objects`. */
  ownerId: string;
  selected: AncestorCandidate | null;
  otherParentId?: string | null;
  error?: string;
  onChange: (candidate: AncestorCandidate | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState<AncestorSearchState>({ ...EMPTY_SEARCH, slot });
  const [ghostOpen, setGhostOpen] = useState(false);
  const [ghostError, setGhostError] = useState<DogFormState>({});
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoAdded, setPhotoAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  const fieldName = slot === "sire" ? "sire_id" : "dam_id";

  const runSearch = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slot", slot);
      fd.set("term", term);
      if (dogId) fd.set("dog_id", dogId);
      if (otherParentId) fd.set("other_parent_id", otherParentId);
      setSearch(await searchAncestors({ ...EMPTY_SEARCH, slot }, fd));
    });
  };

  const createGhost = (formEl: HTMLFieldSetElement) => {
    startTransition(async () => {
      const fd = new FormData();
      for (const field of DOG_GHOST_FIELDS) {
        const el = formEl.querySelector<HTMLInputElement | HTMLSelectElement>(
          `[data-ghost="${field.name}"]`,
        );
        if (el) fd.set(field.name, el.value);
      }
      const result = await createGhostAncestor({}, fd);
      if (result.created) {
        onChange(result.created);
        setGhostOpen(false);
        setOpen(false);
        setGhostError({});
        // Fantasma recém-criado nunca tem foto — abre a foto direto, para o
        // "cadastrar → adicionar foto" ser um gesto só, sem clique extra.
        setPhotoOpen(true);
        setPhotoAdded(false);
      } else {
        setGhostError(result);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={fieldName} value={selected?.id ?? ""} />

      <div className="flex items-center justify-between gap-3">
        <span className="text-fg text-sm font-medium">{SLOT_LABEL[slot]}</span>
        {selected ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setPhotoOpen(false);
              setPhotoAdded(false);
            }}
            className="text-fg-muted hover:text-fg rounded-control text-xs transition-colors"
          >
            Remover
          </button>
        ) : null}
      </div>

      {selected ? (
        <div className="flex flex-col gap-2">
          <div className="border-border-strong bg-surface rounded-control flex items-center justify-between gap-3 border px-3 py-2.5">
            <span className="flex flex-col">
              <span className="text-fg text-sm">{selected.name}</span>
              <span className="text-fg-faint font-mono text-xs">
                {describeCandidate(selected)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-link hover:text-link-hover text-xs underline underline-offset-4 transition-colors"
            >
              Trocar
            </button>
          </div>

          {/*
            Só ancestral fantasma ganha esta oferta: um cão gerenciável de
            verdade já tem ficha e galeria próprias, e quem o selecionou aqui
            não é necessariamente quem o administra — RLS (`can_manage_dog`)
            recusaria o upload em silêncio na maioria dos casos. O fantasma é
            diferente: quem o criou (`created_by`) sempre pode gravar mídia
            nele, para sempre — não só no instante da criação.
          */}
          {isGhostAncestor(selected) ? (
            photoAdded ? (
              <p className="text-fg-muted text-xs">
                Foto adicionada.{" "}
                <Link
                  href={`/painel/caes/${selected.id}`}
                  className="text-link hover:text-link-hover underline underline-offset-4"
                >
                  Editar ficha do ancestral
                </Link>
              </p>
            ) : photoOpen ? (
              <div className="border-border rounded-control border border-dashed p-3">
                <ImageUploader
                  role="dog_gallery"
                  entityId={selected.id}
                  ownerId={ownerId}
                  label="Foto do ancestral"
                  onUploaded={() => {
                    setPhotoOpen(false);
                    setPhotoAdded(true);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setPhotoOpen(false)}
                  className="text-fg-muted hover:text-fg mt-2 text-xs transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                className="text-link hover:text-link-hover self-start text-xs underline underline-offset-4 transition-colors"
              >
                Adicionar foto
              </button>
            )
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-border-strong text-fg-muted hover:text-fg hover:border-accent rounded-control border border-dashed px-3 py-2.5 text-left text-sm transition-colors"
        >
          Buscar {slot === "sire" ? "o pai" : "a mãe"} entre os cães cadastrados
        </button>
      )}

      {error ? (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="border-border bg-surface rounded-card flex flex-col gap-4 border p-4">
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-fg-muted text-xs">Nome, registro ou microchip</span>
              <input
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  // Enter aqui submeteria o formulário do cão inteiro.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
              />
            </label>
            <button
              type="button"
              onClick={runSearch}
              disabled={pending || term.trim().length < 2}
              className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Buscando…" : "Buscar"}
            </button>
          </div>

          {search.searched ? (
            search.results.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {search.results.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      disabled={Boolean(candidate.blockedReason)}
                      onClick={() => {
                        onChange(candidate);
                        setOpen(false);
                        setPhotoOpen(false);
                        setPhotoAdded(false);
                      }}
                      className="border-border hover:bg-surface-hover rounded-control flex w-full flex-col items-start gap-0.5 border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-fg text-sm">{candidate.name}</span>
                      <span className="text-fg-faint font-mono text-xs">
                        {describeCandidate(candidate)}
                      </span>
                      {/* Candidato inválido aparece bloqueado COM o motivo, em
                          vez de sumir: sumir faz o criador achar que precisa
                          cadastrar de novo, e criar o duplicado. */}
                      {candidate.blockedReason ? (
                        <span className="text-danger text-xs">{candidate.blockedReason}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted text-sm">Nenhum cão encontrado com esse termo.</p>
            )
          ) : null}

          {search.truncated ? (
            <p className="text-fg-faint text-xs">
              Mostrando os primeiros resultados. Refine a busca para encontrar o cão certo.
            </p>
          ) : null}

          <div className="border-border flex flex-col gap-3 border-t pt-3">
            {ghostOpen ? (
              <GhostForm
                slot={slot}
                pending={pending}
                error={ghostError}
                onCancel={() => setGhostOpen(false)}
                onSubmit={createGhost}
              />
            ) : (
              <button
                type="button"
                onClick={() => setGhostOpen(true)}
                className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
              >
                Não encontrei — cadastrar como ancestral
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-fg-muted hover:text-fg self-start text-xs transition-colors"
          >
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cadastro mínimo do ancestral.
 *
 * `fieldset`, não `form`: está dentro do formulário do cão. E o texto diz com
 * todas as letras o que está sendo criado, porque um ancestral NÃO é um cão
 * gerenciável — não tem dono, não tem canil, não aparece na lista de cães do
 * criador como animal dele.
 */
function GhostForm({
  slot,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  slot: ParentSlot;
  pending: boolean;
  error: DogFormState;
  onCancel: () => void;
  onSubmit: (el: HTMLFieldSetElement) => void;
}) {
  const [el, setEl] = useState<HTMLFieldSetElement | null>(null);

  return (
    <fieldset ref={setEl} className="flex flex-col gap-3">
      <legend className="sr-only">Cadastrar ancestral</legend>

      <div className="border-border-strong bg-surface-raised rounded-control border border-dashed p-3">
        <p className="text-fg text-xs font-medium">Isto cria um ANCESTRAL, não um cão seu.</p>
        <p className="text-fg-muted mt-1 text-xs">
          Ele existe só para compor o pedigree: não tem dono, não fica no seu canil e não aparece
          entre os seus cães. Se este {slot === "sire" ? "macho" : "fêmea"} é um animal seu, feche e
          cadastre-o como cão.
        </p>
      </div>

      {DOG_GHOST_FIELDS.map((field) => (
        <label key={field.name} className="flex flex-col gap-1.5">
          <span className="text-fg-muted text-xs">
            {field.label}
            {field.weight === "required" ? " (obrigatório)" : ""}
          </span>
          {field.options ? (
            <select
              data-ghost={field.name}
              defaultValue={field.name === "sex" ? (slot === "sire" ? "male" : "female") : ""}
              // O sexo é ditado pela posição: um ancestral criado no lugar do
              // pai só pode ser macho, e deixar escolher garantiria um erro.
              disabled={field.name === "sex"}
              className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none disabled:opacity-70"
            >
              {field.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              data-ghost={field.name}
              type={field.input === "date" ? "date" : "text"}
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
            />
          )}
          {error.errors?.[field.name] ? (
            <span role="alert" className="text-danger text-xs">
              {error.errors[field.name]}
            </span>
          ) : null}
        </label>
      ))}

      {error.formError ? (
        <p role="alert" className="text-danger text-xs">
          {error.formError}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => el && onSubmit(el)}
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {pending ? "Criando…" : "Criar ancestral"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted hover:text-fg text-sm transition-colors"
        >
          Cancelar
        </button>
      </div>
    </fieldset>
  );
}
