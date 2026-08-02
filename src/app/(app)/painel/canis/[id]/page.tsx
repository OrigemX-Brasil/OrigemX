import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAuthUser } from "@/modules/auth/queries";
import { softDeleteKennel } from "@/modules/kennels/actions";
import { deleteMedia } from "@/modules/media/actions";
import { ImageUploader } from "@/modules/media/components/image-uploader";
import { formatBytes } from "@/modules/media/constraints";
import { getKennelLogo } from "@/modules/media/queries";
import { calculateCompleteness } from "@/modules/kennels/completeness";
import { CompletenessMeter } from "@/modules/kennels/components/completeness-meter";
import { KennelForm } from "@/modules/kennels/components/kennel-form";
import { getKennelById } from "@/modules/kennels/queries";

export const metadata: Metadata = { title: "Editar canil" };

export default async function EditarCanilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [kennel, user] = await Promise.all([getKennelById(id), getAuthUser()]);

  // A RLS já devolve nada quando o canil é de outra pessoa ou foi excluído
  // logicamente. Aqui só traduzimos ausência em 404.
  if (!kennel || !user) notFound();

  const logo = await getKennelLogo(kennel.id);

  // A completude pergunta pela mídia, não pela coluna: o logo mora em `media`,
  // e `logo_url` seria uma segunda fonte de verdade para o mesmo fato.
  const completeness = calculateCompleteness({ ...kennel, logo_url: logo?.storage_path ?? null });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/painel/canis"
          className="text-fg-muted hover:text-fg self-start text-sm transition-colors"
        >
          ← Canis
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{kennel.name}</h1>
        <p className="text-fg-faint font-mono text-xs">/c/{kennel.slug}</p>
      </div>

      <CompletenessMeter completeness={completeness} />

      <section className="border-border bg-surface rounded-card flex flex-col gap-4 border p-5">
        <h2 className="text-fg text-sm font-medium">Logo do canil</h2>
        {logo?.thumbUrl ? (
          <div className="flex items-center gap-4">
            {/* Prévia usa o thumbnail, como toda listagem. */}
            <Image
              src={logo.thumbUrl}
              alt={logo.alt ?? `Logo de ${kennel.name}`}
              width={96}
              height={96}
              className="border-border rounded-card border object-cover"
              unoptimized
            />
            <div className="flex flex-col gap-1">
              <span className="text-fg-faint font-mono text-xs">
                {logo.width}×{logo.height} · {formatBytes(logo.size_bytes)}
              </span>
              <form action={deleteMedia}>
                <input type="hidden" name="id" value={logo.id} />
                <button
                  type="submit"
                  className="text-fg-muted hover:text-danger self-start text-xs transition-colors"
                >
                  Remover logo
                </button>
              </form>
            </div>
          </div>
        ) : null}

        <ImageUploader
          role="kennel_logo"
          entityId={kennel.id}
          ownerId={user.id}
          label={logo ? "Trocar logo" : "Enviar logo"}
          helpText="Quadrado funciona melhor. O envio substitui o logo atual."
        />
      </section>

      <KennelForm kennel={kennel} />

      {/*
        Exclusão LÓGICA. O botão diz o que realmente acontece: o endereço
        público continua reservado, para um link já divulgado não passar a
        resolver para outro canil.
      */}
      <section className="border-border flex flex-col gap-3 border-t pt-6">
        <h2 className="text-fg text-sm font-medium">Excluir canil</h2>
        <p className="text-fg-muted text-sm">
          O canil sai do ar e dos seus painéis. O endereço{" "}
          <code className="text-fg-faint font-mono">/c/{kennel.slug}</code> segue reservado e não
          poderá ser usado por outra pessoa.
        </p>
        <form action={softDeleteKennel}>
          <input type="hidden" name="id" value={kennel.id} />
          <button
            type="submit"
            className="border-danger text-danger hover:bg-danger-subtle rounded-control self-start border px-4 py-2 text-sm font-medium transition-colors"
          >
            Excluir canil
          </button>
        </form>
      </section>
    </div>
  );
}
