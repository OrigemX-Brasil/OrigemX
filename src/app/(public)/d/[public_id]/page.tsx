import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Wordmark } from "@/modules/auth/components/wordmark";
import { PublicImage } from "@/modules/public/components/public-image";
import { excerpt, publicMetadata } from "@/modules/public/metadata";
import {
  getPublicDogById,
  getPublicDogByPublicId,
  getPublicKennelById,
  getPublicMedia,
  getPublicRegistrations,
  type PublicDog,
} from "@/modules/public/queries";

/**
 * Perfil público do cão — o alvo do QR Code impresso.
 *
 * ISR de 5 minutos. A invalidação por evento (publicar, despublicar, editar) é
 * o mecanismo principal; este tempo é a rede de segurança para o que escapar
 * dela. Uma hora deixaria um criador publicar no estande e o QR não refletir a
 * mudança durante a feira inteira.
 *
 * Todas as consultas usam o client ANÔNIMO — ver src/lib/supabase/public.ts.
 * Sem isso não há ISR, e pior: o HTML cacheado carregaria a visão de quem
 * abriu primeiro.
 *
 * CAMPOS SENSÍVEIS NUNCA APARECEM AQUI: microchip, telefone, e-mail e endereço
 * não são sequer consultados.
 */
export const revalidate = 300;
export const dynamicParams = true;

/** Ver a rota do canil: lista vazia + dynamicParams = estática com fallback. */
export function generateStaticParams() {
  return [];
}

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

function describeDog(dog: PublicDog, kennelName?: string | null): string {
  const parts = [
    SEX_LABEL[dog.sex],
    dog.breed,
    dog.born_on ? `nascido em ${dog.born_on.slice(0, 4)}` : null,
    kennelName,
  ].filter(Boolean);
  return parts.join(" · ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ public_id: string }>;
}): Promise<Metadata> {
  const { public_id } = await params;
  const dog = await getPublicDogByPublicId(public_id);
  if (!dog) return { title: "Cão não encontrado" };

  const [kennel, media] = await Promise.all([
    dog.kennel_id ? getPublicKennelById(dog.kennel_id) : Promise.resolve(null),
    getPublicMedia({ dogId: dog.id }),
  ]);

  return publicMetadata({
    title: dog.name,
    description:
      excerpt(describeDog(dog, kennel?.name)) ?? `Perfil e pedigree de ${dog.name} no OrigemX.`,
    // Canônico é SEMPRE o public_id: identificador estável, o mesmo do QR.
    path: `/d/${dog.public_id}`,
    imageUrl: media[0]?.url ?? null,
    imageAlt: dog.name,
    type: "profile",
  });
}

/** Pai ou mãe: link só quando o ancestral é público de verdade. */
async function ParentLine({ id, label }: { id: string | null; label: string }) {
  if (!id) {
    return (
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-fg-muted text-sm">{label}</dt>
        <dd className="text-fg-faint text-sm">Não informado</dd>
      </div>
    );
  }

  const parent = await getPublicDogById(id);

  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className="text-right text-sm">
        {parent ? (
          <Link
            href={`/d/${parent.public_id}`}
            className="text-link hover:text-link-hover underline underline-offset-4 transition-colors"
          >
            {parent.name}
          </Link>
        ) : (
          // A RLS não devolveu o ancestral: é rascunho de outra pessoa. Mostrar
          // que existe um vínculo, sem link e sem nome, é mais honesto que
          // fingir que não há pai.
          <span className="text-fg-faint">Registro não público</span>
        )}
      </dd>
    </div>
  );
}

export default async function CaoPublicoPage({
  params,
}: {
  params: Promise<{ public_id: string }>;
}) {
  const { public_id } = await params;
  const dog = await getPublicDogByPublicId(public_id);
  if (!dog) notFound();

  const [kennel, media, registrations] = await Promise.all([
    dog.kennel_id ? getPublicKennelById(dog.kennel_id) : Promise.resolve(null),
    getPublicMedia({ dogId: dog.id }),
    getPublicRegistrations(dog.id),
  ]);

  const [principal, ...restante] = media;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border border-b px-5 py-4 lg:px-8">
        <Link href="/" className="rounded-control">
          <Wordmark className="text-base" />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 lg:px-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <PublicImage
              src={principal?.thumbUrl ?? principal?.url}
              alt={principal?.alt ?? dog.name}
              fallbackText={dog.name}
              width={128}
              height={128}
              priority
              sizes="128px"
              className="border-border rounded-card shrink-0 border object-cover"
            />

            <div className="flex flex-col gap-2">
              <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
                Registro
              </span>
              <h1 className="font-display text-3xl font-semibold tracking-tight">{dog.name}</h1>
              <p className="text-fg-muted text-sm">{describeDog(dog)}</p>
              {kennel ? (
                <Link
                  href={`/c/${kennel.slug}`}
                  className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
                >
                  {kennel.name}
                </Link>
              ) : null}
            </div>
          </div>

          <dl className="border-border bg-surface rounded-card divide-border divide-y border">
            <Row label="Sexo" value={SEX_LABEL[dog.sex]} />
            <Row label="Raça" value={dog.breed} />
            <Row label="Nascimento" value={dog.born_on} />
            <Row label="Cor" value={dog.color} />
            <Row label="Pelagem" value={dog.coat} />
            <Row label="Identificador" value={dog.public_id} mono />
            {registrations.map((r) => (
              <Row
                key={r.id}
                label={r.issuer ? `Registro ${r.issuer}` : "Registro"}
                value={r.value}
                mono
              />
            ))}
          </dl>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">Pedigree</h2>
            <dl className="border-border bg-surface rounded-card divide-border flex flex-col divide-y border px-5">
              <div className="py-4">
                <ParentLine id={dog.sire_id} label="Pai" />
              </div>
              <div className="py-4">
                <ParentLine id={dog.dam_id} label="Mãe" />
              </div>
            </dl>
          </section>

          {restante.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">Fotos</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {restante.map((item) => (
                  <li key={item.id} className="border-border rounded-card overflow-hidden border">
                    <PublicImage
                      src={item.thumbUrl ?? item.url}
                      alt={item.alt ?? dog.name}
                      fallbackText={dog.name}
                      width={320}
                      height={320}
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="h-auto w-full object-cover"
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className={`text-fg text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
