"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { GalleryUploader } from "@/modules/media/components/gallery-uploader";
import { MAX_GALLERY_ITEMS } from "@/modules/media/constraints";

import { addPuppy, updatePuppy, type PuppyFormState } from "../actions";
import { LITTER_STATUS_OPTIONS, MAX_PUPPIES_PER_LITTER } from "../constraints";
import type { LitterPuppy } from "../queries";

import { Price, PuppyStatusChip, SexChip } from "./puppy-status-chip";

/**
 * ============================================================================
 * Filhotes da ninhada, no painel.
 * ============================================================================
 *
 * Cada filhote é uma linha em `dogs`, então esta tela faz DUAS coisas e
 * delega o resto:
 *
 *   - o que só existe dentro da ninhada (status e preço) é editado aqui;
 *   - o que é do CÃO (nome, foto, cor, registro CBKC, saúde) abre em
 *     `/painel/caes/[id]`, a mesma página de sempre.
 *
 * É a decisão de arquitetura aparecendo na interface: não existe "editor de
 * filhote" paralelo ao editor de cão, porque não existe entidade filhote.
 *
 * Um `<form>` por filhote, sem estado de array no client — mesmo padrão das
 * listas de saúde. Salvar um filhote não toca nos outros.
 */

function Submit({ label, compact }: { label: string; compact?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        compact
          ? "border-border-strong text-fg hover:bg-surface-hover rounded-control shrink-0 border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          : "bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {pending ? "Salvando…" : label}
    </button>
  );
}

function PuppyRow({
  puppy,
  litterId,
  ownerId,
}: {
  puppy: LitterPuppy;
  litterId: string;
  ownerId: string;
}) {
  const [state, formAction] = useActionState<PuppyFormState, FormData>(updatePuppy, {});
  const [fotoAberta, setFotoAberta] = useState(false);
  const router = useRouter();

  return (
    <li className="border-border bg-surface rounded-card flex flex-col gap-4 border p-4">
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="bg-surface-hover rounded-control text-fg-faint flex size-16 items-center justify-center overflow-hidden">
            {puppy.cover?.thumbUrl ? (
              <Image
                src={puppy.cover.thumbUrl}
                alt=""
                width={64}
                height={64}
                className="size-16 object-cover"
                unoptimized
              />
            ) : (
              <span className="text-[11px]">Sem foto</span>
            )}
          </div>
          {/* Upload embutido AQUI, sem sair da ninhada — mesmo componente com
              compressão que a página do cão usa (`GalleryUploader`), só
              escondido atrás de um clique para não pesar a linha quando o
              criador só quer ajustar status/preço. Gerenciar a galeria
              inteira (reordenar, remover) continua exclusivo da página do
              cão, linkada abaixo. */}
          <button
            type="button"
            onClick={() => setFotoAberta((v) => !v)}
            className="text-link hover:text-link-hover focus-visible:outline-ring rounded-control text-[11px] underline underline-offset-2 focus-visible:outline-2"
          >
            {fotoAberta ? "Fechar" : puppy.cover ? "Trocar foto" : "Adicionar foto"}
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href={`/painel/caes/${puppy.id}`}
            className="text-fg hover:text-link-hover focus-visible:outline-ring truncate font-medium transition-colors focus-visible:outline-2"
          >
            {puppy.name}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <SexChip sex={puppy.sex} />
            <PuppyStatusChip status={puppy.litter_status} />
            <Price value={puppy.price_brl} />
          </div>
          <p className="text-fg-faint text-xs">
            Mais fotos, nome e registro são editados na{" "}
            <Link href={`/painel/caes/${puppy.id}`} className="text-link hover:text-link-hover">
              página do cão
            </Link>
            .
          </p>
        </div>
      </div>

      {fotoAberta ? (
        <div className="border-border bg-bg rounded-control border p-3">
          <GalleryUploader
            entityId={puppy.id}
            ownerId={ownerId}
            role="dog_gallery"
            maxItems={MAX_GALLERY_ITEMS}
            remaining={MAX_GALLERY_ITEMS - puppy.photoCount}
            onComplete={() => {
              setFotoAberta(false);
              router.refresh();
            }}
          />
        </div>
      ) : null}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="dog_id" value={puppy.id} />
        <input type="hidden" name="litter_id" value={litterId} />

        <div className="flex min-w-[9rem] flex-1 flex-col gap-1.5">
          <label htmlFor={`status-${puppy.id}`} className="text-fg-muted text-xs font-medium">
            Status
          </label>
          <select
            id={`status-${puppy.id}`}
            name="litter_status"
            defaultValue={puppy.litter_status ?? "available"}
            className="border-border-strong bg-bg text-fg focus-visible:border-accent rounded-control border px-3 py-2 text-sm outline-none transition-colors"
          >
            {LITTER_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-[9rem] flex-1 flex-col gap-1.5">
          <label htmlFor={`price-${puppy.id}`} className="text-fg-muted text-xs font-medium">
            Preço (R$)
          </label>
          <input
            id={`price-${puppy.id}`}
            name="price_brl"
            type="text"
            inputMode="decimal"
            defaultValue={puppy.price_brl === null ? "" : String(puppy.price_brl).replace(".", ",")}
            placeholder="4500,00"
            className="border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control border px-3 py-2 text-sm outline-none transition-colors"
          />
        </div>

        <Submit label="Salvar" compact />
      </form>

      {state.formError ? (
        <p role="alert" className="text-danger text-xs">
          {state.formError}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-success text-xs">
          Filhote atualizado.
        </p>
      ) : null}
    </li>
  );
}

export function PuppyManager({
  litterId,
  puppies,
  hasParents,
  ownerId,
}: {
  litterId: string;
  puppies: LitterPuppy[];
  /** Sem progenitor escolhido o filhote não tem de quem herdar `sire_id`/`dam_id`. */
  hasParents: boolean;
  /** Sessão atual — o `GalleryUploader` inline exige para o prefixo do caminho no Storage. */
  ownerId: string;
}) {
  const [state, formAction] = useActionState<PuppyFormState, FormData>(addPuppy, {});
  const cheio = puppies.length >= MAX_PUPPIES_PER_LITTER;

  return (
    <div className="flex flex-col gap-4">
      {puppies.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {puppies.map((puppy) => (
            <PuppyRow key={puppy.id} puppy={puppy} litterId={litterId} ownerId={ownerId} />
          ))}
        </ul>
      ) : (
        <p className="border-border bg-surface rounded-card text-fg-muted border p-4 text-sm">
          Nenhum filhote cadastrado ainda. Cada um vira um cão de verdade: entra no pedigree, pode
          receber registro CBKC e ganha perfil próprio.
        </p>
      )}

      {!hasParents ? (
        <p className="border-border bg-surface rounded-card text-fg-muted border p-4 text-sm">
          Escolha ao menos um progenitor acima para poder cadastrar filhotes — é dele que o filhote
          herda a linhagem.
        </p>
      ) : cheio ? (
        <p className="text-fg-faint text-sm">
          Esta ninhada atingiu o limite de {MAX_PUPPIES_PER_LITTER} filhotes.
        </p>
      ) : (
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="litter_id" value={litterId} />

          <div className="flex min-w-[9rem] flex-col gap-1.5">
            <label htmlFor="novo-filhote-sexo" className="text-fg-muted text-xs font-medium">
              Sexo do filhote
            </label>
            <select
              id="novo-filhote-sexo"
              name="sex"
              defaultValue="male"
              className="border-border-strong bg-bg text-fg focus-visible:border-accent rounded-control border px-3 py-2 text-sm outline-none transition-colors"
            >
              <option value="male">Macho</option>
              <option value="female">Fêmea</option>
            </select>
          </div>

          <Submit label="Adicionar filhote" />
        </form>
      )}

      {state.formError ? (
        <p role="alert" className="text-danger text-sm">
          {state.formError}
        </p>
      ) : null}
    </div>
  );
}
