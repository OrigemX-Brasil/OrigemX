/**
 * Status visível de canil e cão, para o painel administrativo — lógica pura,
 * sem banco, para poder ser testada sem fixture.
 *
 * PRECEDÊNCIA, da mais forte para a mais fraca: excluído > oculto > (fantasma,
 * só para cão) > publicado > rascunho. Exclusão e ocultação são decisão do
 * ADMIN e escondem qualquer outro estado — é o que o admin mais precisa ver
 * primeiro. "Fantasma" describe o REGISTRO (sem dono, sem canil, nó de
 * árvore), não decisão de moderação, então fica abaixo das duas primeiras mas
 * acima de publicado/rascunho, mesmo critério que `/painel/caes` já usa
 * (`isGhostAncestor(dog) ? "Ancestral" : dog.published_at ? "Publicado" :
 * "Rascunho"`).
 */

import { isGhostAncestor } from "@/modules/dogs/ancestors";

export type KennelStatus = "deleted" | "hidden" | "published" | "draft";

export function kennelStatus(row: {
  deleted_at: string | null;
  hidden_at: string | null;
  published_at: string | null;
}): KennelStatus {
  if (row.deleted_at) return "deleted";
  if (row.hidden_at) return "hidden";
  return row.published_at ? "published" : "draft";
}

export type DogStatus = "deleted" | "hidden" | "ghost" | "published" | "draft";

export function dogStatus(row: {
  deleted_at: string | null;
  hidden_at: string | null;
  published_at: string | null;
  owner_id: string | null;
  kennel_id: string | null;
}): DogStatus {
  if (row.deleted_at) return "deleted";
  if (row.hidden_at) return "hidden";
  if (isGhostAncestor(row)) return "ghost";
  return row.published_at ? "published" : "draft";
}

export const KENNEL_STATUS_LABEL: Record<KennelStatus, string> = {
  deleted: "Excluído",
  hidden: "Oculto",
  published: "Publicado",
  draft: "Rascunho",
};

export const DOG_STATUS_LABEL: Record<DogStatus, string> = {
  deleted: "Excluído",
  hidden: "Oculto",
  ghost: "Ancestral",
  published: "Publicado",
  draft: "Rascunho",
};

/** Tom do `StatusChip` por severidade — ver o comentário do componente. */
export const KENNEL_STATUS_TONE: Record<KennelStatus, "danger" | "secondary" | "success" | "neutral"> = {
  deleted: "danger",
  hidden: "secondary",
  published: "success",
  draft: "neutral",
};

export const DOG_STATUS_TONE: Record<DogStatus, "danger" | "secondary" | "success" | "neutral"> = {
  deleted: "danger",
  hidden: "secondary",
  ghost: "neutral",
  published: "success",
  draft: "neutral",
};
