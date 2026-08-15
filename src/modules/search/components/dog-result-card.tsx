import Link from "next/link";

import type { PublicDogSearchItem } from "@/modules/dogs/queries";

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

/**
 * Card de cão na grade de `/busca`. Mesmo padrão visual de `KennelResultCard`.
 *
 * Um rascunho só chega aqui vindo de `ownDrafts` — a RLS garante que é
 * sempre o rascunho do PRÓPRIO usuário buscando, nunca de outro. Por isso o
 * link muda: `/d/[public_id]` é 100% anônima, de propósito (ver
 * `d/[public_id]/page.tsx`), e daria 404 pro próprio dono. Aponta pro painel
 * de edição em vez disso.
 *
 * Rótulo "Rascunho" sem cor distinguindo — mesmo texto neutro que
 * `litter-card.tsx` já usa para Publicada/Rascunho: o rótulo já diz o que é.
 */
export function DogResultCard({ dog }: { dog: PublicDogSearchItem }) {
  const isDraft = dog.published_at === null;
  const href = isDraft ? `/painel/caes/${dog.id}` : `/d/${dog.public_id}`;
  const meta = [SEX_LABEL[dog.sex] ?? null, dog.breed, dog.kennel_name].filter(Boolean).join(" · ");

  return (
    <Link
      href={href}
      prefetch={false}
      className="border-border-glass bg-surface hover:bg-surface-hover shadow-card hover:shadow-card-hover inset-shadow-glass rounded-card focus-visible:outline-ring ease-panel flex flex-col gap-1.5 border p-5 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {isDraft ? <span className="text-fg-faint text-xs">Rascunho</span> : null}
      <h3 className="font-display line-clamp-2 text-base font-semibold tracking-tight">{dog.name}</h3>
      {meta ? <p className="text-fg-muted truncate text-sm">{meta}</p> : null}
    </Link>
  );
}
