import type { Metadata } from "next";

import { BackLink } from "@/components/back-link";
import { getAuthUser } from "@/modules/auth/queries";
import { DogForm } from "@/modules/dogs/components/dog-form";
import { getMyKennel } from "@/modules/kennels/queries";

export const metadata: Metadata = { title: "Novo cão" };

export default async function NovoCaoPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const kennel = await getMyKennel(user.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackLink href="/painel/caes" label="Cães" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Novo cão</h1>
      </div>

      <DogForm kennel={kennel && { id: kennel.id, name: kennel.name }} ownerId={user.id} />
    </div>
  );
}
