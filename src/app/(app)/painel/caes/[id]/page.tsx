import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAuthUser } from "@/modules/auth/queries";
import { softDeleteDog } from "@/modules/dogs/actions";
import { isGhostAncestor, type AncestorCandidate } from "@/modules/dogs/ancestors";
import { DogForm } from "@/modules/dogs/components/dog-form";
import { getDogById, getDogsByIds } from "@/modules/dogs/queries";
import { listMyKennels } from "@/modules/kennels/queries";

export const metadata: Metadata = { title: "Editar cão" };

export default async function EditarCaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [dog, user] = await Promise.all([getDogById(id), getAuthUser()]);
  if (!dog || !user) notFound();

  const [kennels, parents] = await Promise.all([
    listMyKennels(user.id, { limit: 100 }),
    getDogsByIds([dog.sire_id, dog.dam_id].filter((v): v is string => Boolean(v))),
  ]);

  const toCandidate = (id: string | null): AncestorCandidate | null => {
    const found = parents.find((p) => p.id === id);
    if (!found) return null;
    return {
      id: found.id,
      name: found.name,
      sex: found.sex as "male" | "female",
      born_on: found.born_on,
      breed: found.breed,
      kennel_id: found.kennel_id,
      owner_id: found.owner_id,
    };
  };

  const ghost = isGhostAncestor(dog);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/painel/caes"
          className="text-fg-muted hover:text-fg self-start text-sm transition-colors"
        >
          ← Cães
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{dog.name}</h1>
        <p className="text-fg-faint font-mono text-xs">/d/{dog.public_id}</p>
      </div>

      {ghost ? (
        <div className="border-border-strong bg-surface-raised rounded-card border border-dashed p-4">
          <p className="text-fg text-sm font-medium">Este registro é um ancestral.</p>
          <p className="text-fg-muted mt-1 text-sm">
            Ele existe para compor pedigrees: não tem dono nem canil. Vincular um canil ou definir
            um dono transforma-o em cão gerenciável, e ele deixa de ficar visível como nó público de
            árvore.
          </p>
        </div>
      ) : null}

      <DogForm
        dog={dog}
        kennels={kennels.items.map((k) => ({ id: k.id, name: k.name }))}
        sire={toCandidate(dog.sire_id)}
        dam={toCandidate(dog.dam_id)}
      />

      <section className="border-border flex flex-col gap-3 border-t pt-6">
        <h2 className="text-fg text-sm font-medium">Excluir cão</h2>
        <p className="text-fg-muted text-sm">
          O cão sai das listagens e do perfil público. O registro permanece, porque pedigrees de
          descendentes apontam para ele — apagá-lo de verdade quebraria a árvore de outros
          criadores.
        </p>
        <form action={softDeleteDog}>
          <input type="hidden" name="id" value={dog.id} />
          <button
            type="submit"
            className="border-danger text-danger hover:bg-danger-subtle rounded-control self-start border px-4 py-2 text-sm font-medium transition-colors"
          >
            Excluir cão
          </button>
        </form>
      </section>
    </div>
  );
}
