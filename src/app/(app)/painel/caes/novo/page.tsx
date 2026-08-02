import type { Metadata } from "next";
import Link from "next/link";

import { getAuthUser } from "@/modules/auth/queries";
import { DogForm } from "@/modules/dogs/components/dog-form";
import { listMyKennels } from "@/modules/kennels/queries";

export const metadata: Metadata = { title: "Novo cão" };

export default async function NovoCaoPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const kennels = await listMyKennels(user.id, { limit: 100 });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/painel/caes"
          className="text-fg-muted hover:text-fg self-start text-sm transition-colors"
        >
          ← Cães
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Novo cão</h1>
      </div>

      <DogForm kennels={kennels.items.map((k) => ({ id: k.id, name: k.name }))} />
    </div>
  );
}
