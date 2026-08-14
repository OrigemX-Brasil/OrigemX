import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { getAuthUser } from "@/modules/auth/queries";
import { softDeleteKennel } from "@/modules/kennels/actions";
import { deleteMedia } from "@/modules/media/actions";
import { ImageUploader } from "@/modules/media/components/image-uploader";
import { PublishToggle } from "@/modules/media/components/publish-toggle";
import { formatBytes } from "@/modules/media/constraints";
import { getKennelLogo } from "@/modules/media/queries";
import { calculateCompleteness } from "@/modules/kennels/completeness";
import { CompletenessMeter } from "@/modules/kennels/components/completeness-meter";
import { FounderBadge, FounderChecklist } from "@/modules/kennels/components/founder-badge";
import { KennelForm } from "@/modules/kennels/components/kennel-form";
import { founderEligibility } from "@/modules/kennels/founder";
import { countKennelDogs, getManageableKennelById } from "@/modules/kennels/queries";
import { QrCard } from "@/modules/qr/components/qr-card";

export const metadata: Metadata = { title: "Meu canil" };

export default async function EditarCanilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) notFound();

  // `getManageableKennelById`, não `getKennelById`: a policy de leitura também
  // devolve canil PUBLICADO de terceiro, porque o diretório é público. Esta tela
  // edita, então precisa de posse, não de visibilidade.
  const kennel = await getManageableKennelById(id, user.id);
  if (!kennel) notFound();

  const [logo, dogCount] = await Promise.all([
    getKennelLogo(kennel.id),
    countKennelDogs(kennel.id),
  ]);

  const founder = founderEligibility({
    name: kennel.name,
    city: kennel.city,
    state: kennel.state,
    hasLogo: Boolean(logo),
    dogCount,
  });

  // A completude pergunta pela mídia, não pela coluna: o logo mora em `media`,
  // e `logo_url` seria uma segunda fonte de verdade para o mesmo fato.
  const completeness = calculateCompleteness({ ...kennel, logo_url: logo?.storage_path ?? null });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        {/* Aponta para `/painel`, não para `/painel/canis`: aquela rota
            redireciona para cá quando existe canil, e o link viraria um laço. */}
        <BackLink href="/painel" label="Painel" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">{kennel.name}</h1>
        <p className="text-fg-faint font-mono text-xs">/c/{kennel.slug}</p>
      </div>

      {/*
        Mesma divisão da tela do cão: à esquerda o que se edita, à direita o QR
        (consulta) e a exclusão. E pelo mesmo motivo — QR e "excluir canil" já
        eram os dois últimos itens da pilha do celular, nessa ordem, então
        movê-los para o trilho não muda nada abaixo de `xl`.
      */}
      <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-10">
        <div className="flex flex-col gap-8">
          {/*
        Selo quando houver. Quando não houver, a lista do que falta — senão o
        criador com cadastro quase completo não descobre por que não recebeu.
      */}
          <section className="border-border bg-surface rounded-card flex flex-col gap-4 border p-5">
            {kennel.founder_number ? (
              <>
                <FounderBadge number={kennel.founder_number} />
                <p className="text-fg-muted text-sm">
                  Este selo é permanente e intransferível. Ele não muda e não volta ao pool.
                </p>
              </>
            ) : (
              <FounderChecklist eligibility={founder} />
            )}
          </section>

          <PublishToggle
            kind="kennel"
            id={kennel.id}
            publicPath={`/c/${kennel.slug}`}
            isPublished={Boolean(kennel.published_at)}
          />

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
        </div>

        {/* `xl:sticky`: o QR acompanha a rolagem — é o que o criador confere
            antes de mandar imprimir. */}
        <div className="flex flex-col gap-8 xl:sticky xl:top-8">
          <QrCard
            kind="kennel"
            entityId={kennel.id}
            stableId={kennel.slug}
            label="Aponta para o perfil público do canil. Codifica o endereço, que é reservado para sempre — trocar o nome do canil não quebra o que já foi impresso."
          />

          {/*
            Exclusão LÓGICA, e o texto diz as DUAS metades da regra. Omitir a
            segunda seria esconder metade: a vaga volta (`kennels_owner_uk` é
            parcial por `deleted_at`), o endereço não (`kennels_slug_key` é global).
          */}
          <section className="border-border flex flex-col gap-3 border-t pt-6">
            <h2 className="text-fg text-sm font-medium">Excluir canil</h2>
            <p className="text-fg-muted text-sm">
              O canil sai do ar e dos seus painéis. Você poderá cadastrar outro canil depois — mas
              com outro endereço: <code className="text-fg-faint font-mono">/c/{kennel.slug}</code>{" "}
              segue reservado para sempre e não poderá ser usado por ninguém, nem por você.
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
      </div>
    </div>
  );
}
