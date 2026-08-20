import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { createPublicClient } from "@/lib/supabase/public";
import { SignupInvite } from "@/modules/capture/components/signup-invite";
import { dogWhatsappHref } from "@/modules/dogs/contact";
import { DogTimeline } from "@/modules/dogs/components/dog-timeline";
import { TrustBadges } from "@/modules/dogs/components/trust-badges";
import { buildDogTimeline } from "@/modules/dogs/timeline";
import { GeneticList } from "@/modules/health/components/genetic-list";
import { DogHealthSummary } from "@/modules/health/components/health-summary";
import { getGeneticTestsByDog, getHealthRecordsByDog } from "@/modules/health/queries";
import { latestByKind } from "@/modules/health/summary";
import { aspectOf } from "@/modules/media/constraints";
import { PedigreeTree } from "@/modules/pedigree/components/pedigree-tree";
import { MAX_PHOTO_GENERATION } from "@/modules/pedigree/layout";
import { getPedigree } from "@/modules/pedigree/queries";
import { thumbnailTargets } from "@/modules/pedigree/tree";
import { PhotoTrigger, PublicGallery } from "@/modules/public/components/photo-lightbox";
import { PublicImage } from "@/modules/public/components/public-image";
import { countAvailableBySex, describeAvailability } from "@/modules/litters/availability";
import { excerpt, publicMetadata, siteUrl } from "@/modules/public/metadata";
import {
  getPublicDogByPublicId,
  getPublicDogThumbs,
  getPublicDogVideo,
  getPublicKennelById,
  getPublicLitterPuppies,
  getPublicMedia,
  getPublicTestimonialsForDog,
  type PublicDog,
} from "@/modules/public/queries";
import { KennelSearch } from "@/modules/search/components/kennel-search";
import { TestimonialCard } from "@/modules/testimonials/components/testimonial-card";
import { DogVideo } from "@/modules/video/components/dog-video";

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
  // UMA instância do client anônimo para as duas consultas de `health`, não
  // uma cada — `createPublicClient()` a mais é objeto e conexão a mais por
  // regeneração de ISR, sem nada em troca.
  const anon = createPublicClient();

  const [kennel, media, pedigree, video, health, genetics, testimonials, irmaos] =
    await Promise.all([
      dog.kennel_id ? getPublicKennelById(dog.kennel_id) : Promise.resolve(null),
      getPublicMedia({ dogId: dog.id }),
      // Uma consulta para a árvore inteira, em paralelo com o resto. Entra no
      // mesmo ISR da página porque usa o mesmo client anônimo.
      getPedigree(dog.id),
      // Mesmo client anônimo das outras, então continua dentro do ISR — e ela
      // NÃO fala com o Cloudflare, só com o nosso banco.
      getPublicDogVideo(dog.id),
      // O client ANÔNIMO é passado explicitamente, e não é opcional: sem ele
      // estas duas caem no `createClient()` de cookie, e ler cookie nesta rota
      // derruba o ISR (ver `lib/supabase/public.ts`). Diferente de
      // `dog_identifiers`, as policies de `dog_health_records` e
      // `dog_genetic_tests` DELEGAM a visibilidade a `dogs_select`, então o
      // anônimo enxerga saúde e laudo de cão publicado — e só dele.
      getHealthRecordsByDog([dog.id], anon),
      getGeneticTestsByDog([dog.id], anon),
      getPublicTestimonialsForDog(dog.id),
      // Irmãos de ninhada, para o contador de disponibilidade. Só quando o cão
      // É filhote — cão adulto não tem `litter_id`, e aí a seção nem existe.
      // `getPublicLitterPuppies` já usa o client anônimo e já filtra publicado.
      dog.litter_id ? getPublicLitterPuppies(dog.litter_id) : Promise.resolve([]),
    ]);

  // Segunda onda, e é inerente: não dá para saber os `dog_id` dos ancestrais
  // antes da RPC do pedigree voltar. Uma consulta a mais, não N+1 — e roda
  // uma vez por regeneração de ISR (300s), não por acesso. Ver o comentário
  // completo em `getPublicDogThumbs`.
  const thumbs = await getPublicDogThumbs(
    pedigree ? thumbnailTargets(pedigree, MAX_PHOTO_GENERATION) : [],
  );

  const [principal, ...restante] = media;

  // `getHealthRecordsByDog` devolve um Map por `dog_id` porque serve a lista de
  // filhotes da ninhada em lote; aqui é um cão só.
  const resumoSaude = latestByKind(health.get(dog.id) ?? []);
  const exames = genetics.get(dog.id) ?? [];

  // A HISTÓRIA — eventos com data REAL, não fotos com data de upload. Ver o
  // cabeçalho de `dogs/timeline.ts`: `media` não guarda quando a foto foi
  // tirada, e datar a linha pelo upload seria uma mentira com aparência de
  // precisão. Um evento só não é linha do tempo, então a seção exige dois.
  const historia = buildDogTimeline({
    bornOn: dog.born_on,
    health: health.get(dog.id) ?? [],
    genetics: exames,
  });

  // "Restam 2 machos e 1 fêmea" — CONTADO dos irmãos publicados, nunca
  // digitado. `null` quando não sobrou nenhum, e aí a seção não aparece.
  const disponiveis = describeAvailability(countAvailableBySex(irmaos));

  // O CTA. Sem telefone cadastrado, `dogWhatsappHref` devolve null e o botão
  // simplesmente não existe — sem fallback para Instagram ou site, mesma
  // decisão já registrada no CTA da ninhada.
  const contatoHref = kennel
    ? dogWhatsappHref({
        phone: kennel.whatsapp,
        publicId: dog.public_id,
        dogName: dog.name,
        sex: dog.sex,
        siteUrl: siteUrl().origin,
      })
    : null;

  // Só entram fotos com URL resolvida — clicar num placeholder sem imagem não
  // abriria nada. `photoIndex` liga cada item de mídia (pelo id) à posição dele
  // nesta lista, porque um item sem URL no meio do caminho deslocaria os
  // índices se a lista de mídia bruta fosse usada direto.
  const photos = media
    .filter((item): item is typeof item & { url: string } => Boolean(item.url))
    .map((item) => ({ url: item.url, alt: item.alt ?? dog.name, caption: item.caption }));
  const photoIndex = new Map(
    media.filter((item) => item.url).map((item, i) => [item.id, i] as const),
  );

  const avatarImage = (
    // Recorte quadrado é intencional aqui: é o avatar do cão. A foto em
    // proporção original aparece no mosaico abaixo.
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
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-4 lg:px-8">
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
        <KennelSearch />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 lg:px-8 xl:max-w-6xl">
        <PublicGallery photos={photos}>
          <div className="flex flex-col gap-8">
            {/*
              No desktop a identidade e a FICHA ficam lado a lado, em vez de a
              ficha empurrar o pedigree para baixo da dobra. É a leitura que
              quem escaneia o QR quer primeiro: quem é o cão, e os dados dele.

              `xl:items-start` porque a ficha é mais alta que o cabeçalho e as
              duas devem alinhar pelo topo, não pelo meio.
            */}
            <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-10">
              {/* Identidade + selos. Os selos ficam FORA da coluna do nome, na
                  largura inteira: ao lado do avatar sobram ~230px num celular
                  de 390px, e a fileira empilhava um selo por linha. */}
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-4 sm:gap-6">
                  {principal && photoIndex.has(principal.id) ? (
                    <PhotoTrigger
                      index={photoIndex.get(principal.id)!}
                      label={`Ampliar foto ${photoIndex.get(principal.id)! + 1} de ${photos.length} de ${dog.name}`}
                      className="focus-visible:outline-ring rounded-card focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {avatarImage}
                    </PhotoTrigger>
                  ) : (
                    avatarImage
                  )}

                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
                      Registro
                    </span>
                    <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                      {dog.name}
                    </h1>
                    <p className="text-fg-muted text-sm">{describeDog(dog)}</p>
                    {kennel ? (
                      // Mesma razão dos links da árvore: página de leitura, saída
                      // improvável, 4G disputado. Ver pedigree-tree.tsx.
                      <BackLink
                        href={`/c/${kennel.slug}`}
                        label={kennel.name}
                        variant="link"
                        prefetch={false}
                      />
                    ) : (
                      // Ancestral fantasma ou dono ainda sem canil: sem página-pai
                      // nenhuma para apontar.
                      <BackLink href="/" label="Início" variant="link" prefetch={false} />
                    )}
                  </div>
                </div>

                {/* Cada selo só existe se o DADO existir — ver o cabeçalho de
                    `trust-badges.tsx`. Sem nenhum, a fileira inteira some. */}
                <TrustBadges
                  founderNumber={kennel?.founder_number}
                  vaccineDate={resumoSaude.find((e) => e.kind === "vaccine")?.applied_on ?? null}
                  geneticTestCount={exames.length}
                  knownAncestors={pedigree?.knownAncestors ?? 0}
                />
              </div>

              <dl className="border-border bg-surface rounded-card divide-border divide-y border">
                <Row label="Sexo" value={SEX_LABEL[dog.sex]} />
                <Row label="Raça" value={dog.breed} />
                <Row label="Nascimento" value={dog.born_on} />
                <Row label="Cor" value={dog.color} />
                <Row label="Pelagem" value={dog.coat} />
                <Row label="Títulos" value={dog.titles?.length ? dog.titles.join(" · ") : null} />
                <Row label="Peso" value={dog.weight_kg != null ? `${dog.weight_kg} kg` : null} />
                <Row
                  label="Cernelha"
                  value={dog.withers_height_cm != null ? `${dog.withers_height_cm} cm` : null}
                />
                <Row label="Identificador" value={dog.public_id} mono />
              </dl>

              {/* Resumo de saúde — o mais recente de cada tipo, nunca o log
                  inteiro: o histórico completo é do dono, no painel. Some por
                  inteiro sem registro nenhum (`DogHealthSummary` devolve null),
                  mesmo critério de vídeo e fotos mais abaixo. */}
              {resumoSaude.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h2 className="font-display text-lg font-semibold tracking-tight">Saúde</h2>
                  <DogHealthSummary entries={resumoSaude} />
                </section>
              ) : null}

              {/* Os laudos deste cão. Esta é a página que um criador abre para
                  avaliar um reprodutor antes de cruzar — e é o mesmo dado que
                  aparece sozinho em toda ninhada em que ele for pai ou mãe,
                  lido de `dog_genetic_tests`, nunca copiado. */}
              {exames.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Exames genéticos
                  </h2>
                  <GeneticList tests={exames} />
                </section>
              ) : null}
            </div>

            {/* Quantos irmãos ainda estão disponíveis. CONTADO dos filhotes
                publicados da ninhada, nunca digitado — e some por inteiro
                quando não sobrou nenhum, ou quando o cão nem é filhote. */}
            {disponiveis ? (
              <section className="border-border bg-surface rounded-card flex items-center gap-3 border p-4">
                <span aria-hidden="true" className="text-fg-faint shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    width={20}
                    height={20}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="9" cy="7" r="3" />
                    <path d="M3 20a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 5M18 20a5 5 0 0 0-2-4" />
                  </svg>
                </span>
                <p className="text-fg text-sm">
                  Restam <span className="font-medium">{disponiveis}</span> nesta ninhada.
                </p>
              </section>
            ) : null}

            {/* A HISTÓRIA — eventos com data real. Dois é o mínimo para haver
                linha do tempo; com um só, a data já está na ficha acima. */}
            {historia.length > 1 ? (
              <section className="flex min-w-0 flex-col gap-4">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  A história {dog.sex === "female" ? "da" : "do"} {dog.name}
                </h2>
                <DogTimeline events={historia} />
              </section>
            ) : null}

            <PedigreeTree
              pedigree={pedigree}
              thumbs={thumbs}
              subjectPhotoUrl={principal?.thumbUrl ?? principal?.url ?? undefined}
            />

            {/* Sem vídeo pronto, a seção NÃO EXISTE — nem título órfão nem
                caixa vazia. Mesmo padrão do `restante.length > 0` logo abaixo.
                E "pronto" é `status='ready'` no nosso banco: a página nunca
                consulta o Cloudflare, então o serviço fora do ar não muda nada
                aqui. */}
            {video ? (
              // `xl:max-w-3xl` no desktop: 16:9 ocupando os 1112px da faixa
              // seria uma tela de cinema no meio de uma ficha de registro.
              <section className="flex flex-col gap-3 xl:max-w-3xl">
                <h2 className="font-display text-lg font-semibold tracking-tight">Vídeo</h2>
                <DogVideo
                  providerUid={video.provider_uid}
                  playbackOrigin={video.playback_origin}
                  thumbnailUrl={video.thumbnail_url}
                  durationSeconds={video.duration_seconds}
                  dogName={dog.name}
                />
              </section>
            ) : null}

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
                <ul className="columns-2 gap-3 sm:columns-3 xl:columns-4">
                  {restante.map((item) => {
                    const proporcao = aspectOf(item);
                    const image = (
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
                    );
                    return (
                      <li
                        key={item.id}
                        className="border-border rounded-card mb-3 break-inside-avoid overflow-hidden border"
                      >
                        {/* `<figure>`/`<figcaption>` é o HTML correto para
                            imagem com legenda — sai de graça em acessibilidade.
                            A legenda fica FORA do `PhotoTrigger`: `<button>`
                            só aceita conteúdo de fraseado, e entrar no botão
                            também poluiria o nome acessível dele. */}
                        <figure>
                          {photoIndex.has(item.id) ? (
                            <PhotoTrigger
                              index={photoIndex.get(item.id)!}
                              label={`Ampliar foto ${photoIndex.get(item.id)! + 1} de ${photos.length} de ${dog.name}`}
                              className="focus-visible:outline-ring block w-full focus-visible:outline-2 focus-visible:-outline-offset-2"
                            >
                              {image}
                            </PhotoTrigger>
                          ) : (
                            image
                          )}
                          {item.caption ? (
                            // `line-clamp-2`: no mosaico a legenda é rótulo,
                            // não texto corrido — sem o recorte, uma legenda
                            // longa estica o cartão e desmonta o equilíbrio
                            // das colunas. O texto inteiro está no lightbox.
                            <figcaption className="text-fg-muted line-clamp-2 px-2.5 py-2 text-xs">
                              {item.caption}
                            </figcaption>
                          ) : null}
                        </figure>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {/* Só os depoimentos vinculados a ESTE cão — a vitrine geral do
                canil fica em `/c/[slug]`. Ausência completa quando não há
                nenhum, mesmo padrão do vídeo e das fotos acima. */}
            {testimonials.length > 0 ? (
              <section className="border-border flex flex-col gap-3 border-t pt-8">
                <h2 className="font-display text-lg font-semibold tracking-tight">Depoimentos</h2>
                <ul className="flex flex-col gap-3 xl:grid xl:grid-cols-2 xl:gap-4">
                  {testimonials.map((testimonial) => (
                    <TestimonialCard key={testimonial.id} testimonial={testimonial} />
                  ))}
                </ul>
              </section>
            ) : null}

            <SignupInvite source="perfil-cao" />

            {/*
              CTA FIXO NO RODAPÉ — o primeiro sticky de rodapé do projeto.

              `sticky bottom-0` e não `fixed`: como é o ÚLTIMO filho do fluxo,
              ele fica colado ao fundo da viewport durante toda a rolagem e
              assenta sozinho no fim da página, sem precisar de spacer para não
              cobrir o conteúdo — que é o preço que `fixed` cobraria.

              `-mx-5 px-5` sangra até as bordas do `main` (que tem `px-5`), para
              a barra atravessar a largura inteira em vez de flutuar com
              margem. O par vidro+blur é o mesmo do painel de busca; `bg-surface`
              é o fallback para quem não suporta `backdrop-filter`.

              `env(safe-area-inset-bottom)` só resolve diferente de zero por
              causa do `viewport-fit=cover` que este trabalho adicionou ao
              `layout.tsx` — sem o par, o botão ficaria embaixo da barra de
              gestos do iPhone.

              O lightbox continua cobrindo isto: `<dialog>` com `showModal()`
              vive na top layer, acima de qualquer z-index.
            */}
            {contatoHref ? (
              <div className="sticky bottom-0 z-20 -mx-5 mt-2 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:-mx-8 lg:px-8">
                <div className="bg-surface supports-[backdrop-filter]:bg-glass backdrop-blur-panel border-border-glass rounded-card border p-2">
                  <a
                    href={contatoHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring flex w-full items-center justify-center gap-2 px-4 py-3.5 text-center text-sm font-semibold transition-colors focus-visible:outline-2"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width={18}
                      height={18}
                      fill="currentColor"
                      aria-hidden="true"
                      className="shrink-0"
                    >
                      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.7 4.83-1.27A9.9 9.9 0 1 0 12.04 2Zm5.75 14.06c-.24.68-1.2 1.25-1.96 1.4-.52.1-1.2.19-3.5-.75-2.94-1.22-4.82-4.2-4.97-4.4-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36l.56.01c.18.01.42-.07.66.5.24.58.83 2 .9 2.15.07.14.12.31.02.5-.1.2-.15.31-.29.48-.15.17-.3.38-.43.51-.15.14-.3.3-.13.58.17.29.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.35 1.45.29.14.46.12.63-.07.17-.2.72-.85.91-1.14.2-.29.39-.24.66-.14.27.1 1.69.8 1.98.94.29.15.48.22.55.34.07.12.07.68-.17 1.36Z" />
                    </svg>
                    Falar no WhatsApp
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </PublicGallery>
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
