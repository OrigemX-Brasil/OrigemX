"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { publishLitter, unpublishLitter } from "@/modules/litters/actions";

import {
  publishDog,
  publishKennel,
  unpublishDog,
  unpublishKennel,
  type PublishState,
} from "../publish";

/**
 * Publicar e despublicar.
 *
 * O texto do botão diz o que acontece com as IMAGENS, não só com a página:
 * publicar move os arquivos para um endereço público permanente, e é isso que
 * torna o QR impresso viável. O usuário precisa saber disso antes de clicar.
 */
const ACTIONS = {
  kennel: { publish: publishKennel, unpublish: unpublishKennel },
  dog: { publish: publishDog, unpublish: unpublishDog },
  litter: { publish: publishLitter, unpublish: unpublishLitter },
} as const;

const LABEL = { kennel: "canil", dog: "cão", litter: "ninhada" } as const;

export function PublishToggle({
  kind,
  id,
  publicPath,
  isPublished,
  kennelPublished,
}: {
  kind: "kennel" | "dog" | "litter";
  id: string;
  publicPath: string;
  isPublished: boolean;
  /**
   * Só faz sentido para `kind === "litter"` — se o CANIL da ninhada também
   * está publicado. A regra é dupla (`kennel_litters_select`), então
   * `isPublished` sozinho não diz se a ninhada está REALMENTE visível.
   * Ausente/`false` faz o texto tratar como "ainda não" — o lado seguro
   * quando o chamador não informa.
   */
  kennelPublished?: boolean;
}) {
  const action = isPublished ? ACTIONS[kind].unpublish : ACTIONS[kind].publish;

  const [state, formAction] = useActionState<PublishState, FormData>(
    async (_prev, formData) => action(formData),
    {},
  );

  const label = LABEL[kind];

  return (
    <section className="border-border bg-surface rounded-card flex flex-col gap-4 border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-sm font-medium">
          {isPublished ? "Publicado" : "Não publicado"}
        </h2>
        <p className="text-fg-muted text-sm">
          {isPublished ? (
            kind === "litter" && !kennelPublished ? (
              <>
                Esta ninhada está publicada. Ela aparece em{" "}
                <code className="text-fg-faint font-mono text-xs">{publicPath}</code> assim que o
                canil TAMBÉM estiver publicado — a regra é das duas publicações juntas, não só
                desta ninhada.
              </>
            ) : (
              <>
                Qualquer pessoa pode abrir{" "}
                <code className="text-fg-faint font-mono text-xs">{publicPath}</code>. As imagens
                estão num endereço público permanente.
              </>
            )
          ) : (
            <>
              Este {label} não aparece para o público. Publicar move as imagens para um endereço
              permanente — é o que faz o QR Code impresso continuar funcionando. Ao despublicar, as
              imagens saem na hora, mas podem seguir em cache por até uma hora para quem tiver o
              link direto.
            </>
          )}
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      {state.warning ? (
        <p
          role="alert"
          className="border-selo bg-selo-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
        >
          {state.warning}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <form action={formAction}>
          <input type="hidden" name="id" value={id} />
          <Submit isPublished={isPublished} />
        </form>

        {isPublished ? (
          <Link
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link hover:text-link-hover text-sm underline underline-offset-4 transition-colors"
          >
            Ver a página pública
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Submit({ isPublished }: { isPublished: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        isPublished
          ? "border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          : "bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
      }
    >
      {pending ? "Aguarde…" : isPublished ? "Despublicar" : "Publicar"}
    </button>
  );
}
