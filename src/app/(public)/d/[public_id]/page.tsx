import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignupInvite } from "@/modules/capture/components/signup-invite";
import { aspectOf } from "@/modules/media/constraints";
import { PedigreeTree } from "@/modules/pedigree/components/pedigree-tree";
import { getPedigree } from "@/modules/pedigree/queries";
import { PublicImage } from "@/modules/public/components/public-image";
import { excerpt, publicMetadata } from "@/modules/public/metadata";
import {
  getPublicDogByPublicId,
  getPublicKennelById,
  getPublicMedia,
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

export default async function CaoPublicoPage({
  params,
}: {
  params: Promise<{ public_id: string }>;
}) {
  const { public_id } = await params;
  const dog = await getPublicDogByPublicId(public_id);
  if (!dog) notFound();

  // `getPublicRegistrations` NÃO entra aqui de propósito: a policy de
  // `dog_identifiers` barra o anônimo por completo, então ela devolveria zero
  // linhas em toda regeneração de ISR. Volta no dia em que o cliente decidir
  // expor número de registro — ver o comentário na própria função.
  const [kennel, media, pedigree] = await Promise.all([
    dog.kennel_id ? getPublicKennelById(dog.kennel_id) : Promise.resolve(null),
    getPublicMedia({ dogId: dog.id }),
    // Uma consulta para a árvore inteira, em paralelo com o resto. Entra no
    // mesmo ISR da página porque usa o mesmo client anônimo.
    getPedigree(dog.id),
  ]);

  const [principal, ...restante] = media;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border border-b px-5 py-4 lg:px-8">
        {/*
          Sem prefetch como todo link desta página — e este em especial: por ser
          o wordmark do cabeçalho, entra na viewport SEMPRE. Era ele que ainda=
          baixava o payload da captura e fazia o pixel disparar depois de eu
          desligar o prefetch do convite no rodapé. Medido.
        */}
        <Link href="/" prefetch={false} className="rounded-control">
          <Image
            src="/brand/logo-header.png"
            alt="OrigemX"
            width={662}
            height={132}
            className="h-8 w-auto"
          />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 lg:px-8">
        <div className="flex flex-col gap-8">
          {/* Lado a lado em TODA largura — ver o mesmo bloco em
              `kennel-profile.tsx`. */}
          <div className="flex items-start gap-4 sm:gap-6">
            {/* Recorte quadrado é intencional aqui: é o avatar do cão. A foto
                em proporção original aparece no mosaico abaixo. */}
            <PublicImage
              src={principal?.thumbUrl ?? principal?.url}
              alt={principal?.alt ?? dog.name}
              fallbackText={dog.name}
              width={128}
              height={128}
              priority
              sizes="128px"
              className="border-border rounded-card size-20 shrink-0 border object-cover sm:size-32"
            />

            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
                Registro
              </span>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {dog.name}
              </h1>
              <p className="text-fg-muted text-sm">{describeDog(dog)}</p>
              {kennel ? (
                <Link
                  href={`/c/${kennel.slug}`}
                  // Mesma razão dos links da árvore: página de leitura, saída
                  // improvável, 4G disputado. Ver pedigree-tree.tsx.
                  prefetch={false}
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
          </dl>

          <PedigreeTree pedigree={pedigree} />

          {restante.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">Fotos</h2>
              {/*
                Mosaico em COLUNAS (CSS multi-coluna), não grid.
                Com `grid`, toda linha cresce até a foto mais alta dela e o
                resto da linha vira faixa preta — uma foto em pé ao lado de uma
                deitada deixava metade da linha vazia. Coluna preenche o vão.

                `break-inside-avoid` é obrigatório: sem ele o navegador corta a
                foto ao meio e joga o resto na coluna seguinte. O espaço
                vertical sai de `mb-3` nos itens, porque `gap` em multi-coluna
                só vale entre colunas.
              */}
              <ul className="columns-2 gap-3 sm:columns-3">
                {restante.map((item) => {
                  const proporcao = aspectOf(item);
                  return (
                    <li
                      key={item.id}
                      className="border-border rounded-card mb-3 break-inside-avoid overflow-hidden border"
                    >
                      <PublicImage
                        src={item.thumbUrl ?? item.url}
                        alt={item.alt ?? dog.name}
                        fallbackText={dog.name}
                        // Proporção REAL da foto, não 320×320 cravado: é o que
                        // reserva a caixa certa e evita o salto de layout.
                        width={proporcao.width}
                        height={proporcao.height}
                        sizes="(max-width: 640px) 50vw, 33vw"
                        className="h-auto w-full"
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <SignupInvite source="perfil-cao" />
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
