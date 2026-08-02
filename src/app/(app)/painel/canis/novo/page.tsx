import type { Metadata } from "next";
import Link from "next/link";

import { KennelForm } from "@/modules/kennels/components/kennel-form";

export const metadata: Metadata = { title: "Novo canil" };

export default function NovoCanilPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/painel/canis"
          className="text-fg-muted hover:text-fg self-start text-sm transition-colors"
        >
          ← Canis
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Novo canil</h1>
      </div>

      <KennelForm />
    </div>
  );
}
