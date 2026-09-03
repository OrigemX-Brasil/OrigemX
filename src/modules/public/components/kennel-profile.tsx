import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { SignupInvite } from "@/modules/capture/components/signup-invite";
import { isoToBr } from "@/modules/dogs/br-date";
import { FaqAccordion } from "@/modules/faqs/components/faq-accordion";
import { FounderBadge } from "@/modules/kennels/components/founder-badge";
import { previewDescription } from "@/modules/litters/constraints";
import { kennelLitterStatusLabel } from "@/modules/litters/fields";
import { expectedWhelpingDate } from "@/modules/litters/gestation";
import { PhotoTrigger, PublicGallery } from "@/modules/public/components/photo-lightbox";
import { PublicImage } from "@/modules/public/components/public-image";
import {
  getPublicFaqs,
  getPublicKennelBySlug,
  getPublicLitters,
  getPublicMedia,
  getPublicTestimonials,
  listPublicDogsOfKennel,
} from "@/modules/public/queries";
import { KennelSearch } from "@/modules/search/components/kennel-search";
import { TestimonialCard } from "@/modules/testimonials/components/testimonial-card";

/**
 * ============================================================================
 * Perfil público do canil — o corpo, compartilhado pelas duas rotas.
 * ============================================================================
 *
 * Existe porque a paginação **não podia ir por query string**. Ler
 * `searchParams` numa página torna a rota DINÂMICA no Next, e esta é servida do
 * CDN com ISR — é alvo de QR impresso. Trocar o cache de borda por um `?cursor=`
 * seria pagar com a coisa mais valiosa da página para ganhar a menos importante.
 *
 * Por isso a página seguinte é uma ROTA: `/c/{slug}/p/{cursor}`. Cada página
 * vira uma entrada estática própria, cacheada igual à primeira, e o cursor
 * (base64url) passa inteiro num segmento de caminho.
 */

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

export async function KennelProfile({ slug, cursor }: { slug: string; cursor?: string }) {
  const kennel = await getPublicKennelBySlug(slug);
  if (!kennel) notFound();

  const [media, dogs, litters, testimonials, faqs] = await Promise.all([
    getPublicMedia({ kennelId: kennel.id }),
    listPublicDogsOfKennel(kennel.id, { cursor }),
    // Só na primeira página: a lista de ninhadas não pagina, então repeti-la
    // em `/c/[slug]/p/[cursor]` seria a mesma seção mostrada de novo debaixo
    // de uma página de CÃES diferente — informação repetida, não nova.
    cursor ? Promise.resolve([]) : getPublicLitters(kennel.id),
    // Mesmo raciocínio: depoimento e FAQ não são filtrados por cursor de cão,
    // repeti-los numa página seguinte mostraria a mesma vitrine debaixo de
    // outros cães.
    cursor ? Promise.resolve([]) : getPublicTestimonials(kennel.id),
    cursor ? Promise.resolve([]) : getPublicFaqs(kennel.id),
  ]);

  // Cursor apontando para o nada devolve lista vazia. Na primeira página isso é
  // "canil sem cães"; numa página seguinte é URL inventada, e aí 404 é a
  // resposta honesta em vez de uma página vazia que parece quebrada.
  if (cursor && dogs.items.length === 0) notFound();

  const logo = media[0];
  const local = [kennel.city, kennel.state].filter(Boolean).join(" · ");

  // Uma foto só (o logo), quando existe de fato — clicar num placeholder sem
  // imagem não abriria nada útil. `PublicGallery` com lista vazia é inofensivo:
  // sem `PhotoTrigger` correspondente, o diálogo nunca é acionado.
  const logoPhotos = logo?.url
    ? [{ url: logo.url, alt: logo.alt ?? `Logo do ${kennel.name}` }]
    : [];

  const logoImage = (
    // Avatar recorta de propósito (`object-cover`): quadrado é a forma do
    // slot. Respeitar proporção original é regra do mosaico de fotos, lá
    // embaixo, não daqui.
    <PublicImage
      src={logo?.thumbUrl ?? logo?.url}
      alt={logo?.alt ?? `Logo do ${kennel.name}`}
      fallbackText={kennel.name}
      width={112}
      height={112}
      priority
      sizes="112px"
      className="border-border rounded-card size-20 shrink-0 border object-cover sm:size-28"
    />
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-4 lg:px-8">
        {/* Entra na viewport sempre — por isso `prefetch={false}`. Ver a rota
            do cão: foi aqui que um prefetch disparava o pixel de medição da
            captura por engano. */}
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
        <PublicGallery photos={logoPhotos}>
          <div className="flex flex-col gap-8">
            {cursor ? (
              <BackLink
                href={`/c/${kennel.slug}`}
                label="Início da lista"
                variant="link"
                prefetch={false}
              />
            ) : (
              <BackLink href="/" label="Início" variant="link" prefetch={false} />
            )}

            {/* Lado a lado em TODA largura, não só a partir de `sm`. Empilhado, o
                nome do canil começava abaixo da dobra em celular estreito — e é
                por celular que quase todo mundo chega, vindo do QR impresso. */}
            <div className="flex items-start gap-4 sm:gap-6">
              {logo?.url ? (
                <PhotoTrigger
                  index={0}
                  label={`Ampliar logo do ${kennel.name}`}
                  className="focus-visible:outline-ring rounded-card focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {logoImage}
                </PhotoTrigger>
              ) : (
                logoImage
              )}

              {/* `min-w-0`: sem isto, nome longo estica o flex e vaza a tela em
                vez de quebrar linha. */}
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
                    Canil
                  </span>
                  <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                    {kennel.name}
                  </h1>
                  {local ? <p className="text-fg-muted text-sm">{local}</p> : null}

                  {/*
                    Lista, e não texto corrido: a coluna é `text[]` e cada raça é um
                    item — juntar tudo numa frase perderia a estrutura que o criador
                    digitou e que o filtro do diretório vai querer um dia.
                  */}
                  {kennel.breeds && kennel.breeds.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Raças criadas">
                      {kennel.breeds.map((raca) => (
                        <li
                          key={raca}
                          className="border-border text-fg-muted rounded-control border px-2 py-0.5 text-xs"
                        >
                          {raca}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {kennel.registration_number ? (
                    <p className="text-fg-faint font-mono text-xs">
                      Registro: {kennel.registration_number}
                    </p>
                  ) : null}
                </div>

                <FounderBadge number={kennel.founder_number} />
              </div>
            </div>

            {kennel.description ? (
              <p className="text-fg-muted max-w-prose text-base whitespace-pre-line">
                {kennel.description}
              </p>
            ) : null}

            {kennel.website_url ? (
              <a
                href={kennel.website_url}
                // noopener/noreferrer: sem eles a página de destino recebe
                // window.opener e pode redirecionar esta aba.
                rel="noopener noreferrer nofollow"
                target="_blank"
                className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
              >
                {kennel.website_url}
              </a>
            ) : null}

            {kennel.instagram_handle ? (
              <a
                href={`https://instagram.com/${kennel.instagram_handle}`}
                rel="noopener noreferrer nofollow"
                target="_blank"
                className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
              >
                @{kennel.instagram_handle}
              </a>
            ) : null}

            <section className="border-border flex flex-col gap-4 border-t pt-8">
              <h2 className="font-display text-lg font-semibold tracking-tight">Cães</h2>

              {dogs.items.length === 0 ? (
                <p className="text-fg-muted text-sm">Nenhum cão publicado ainda.</p>
              ) : (
                <>
                  {/* Três colunas no desktop: o cartão do cão aqui é curto —
                      nome e uma linha de meta — então a ~360px ele fica
                      confortável, e empilhado numa faixa de 1152px viraria uma
                      escada de blocos quase vazios. */}
                  <ul className="flex flex-col gap-3 xl:grid xl:grid-cols-3 xl:gap-4">
                    {dogs.items.map((dog) => (
                      <li key={dog.id}>
                        <Link
                          href={`/d/${dog.public_id}`}
                          // Sem prefetch: com a lista cheia, abrir o perfil de um
                          // canil baixaria um payload por cão de uma vez. Ver
                          // pedigree-tree.tsx.
                          prefetch={false}
                          className="border-border bg-surface hover:bg-surface-hover rounded-card flex flex-col gap-1 border p-4 transition-colors"
                        >
                          <span className="text-fg font-medium">{dog.name}</span>
                          <span className="text-fg-faint font-mono text-xs">
                            {[SEX_LABEL[dog.sex], dog.breed, dog.born_on?.slice(0, 4)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {dogs.nextCursor ? (
                    <Link
                      href={`/c/${kennel.slug}/p/${dogs.nextCursor}`}
                      prefetch={false}
                      className="border-border-strong text-fg hover:bg-surface-hover rounded-control focus-visible:outline-ring self-start border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      Ver mais cães
                    </Link>
                  ) : null}

                  {cursor ? (
                    <BackLink
                      href={`/c/${kennel.slug}`}
                      label="Voltar ao início da lista"
                      variant="link"
                      prefetch={false}
                    />
                  ) : null}
                </>
              )}
            </section>

            {/* Ausência completa quando não há ninhada publicada, não uma
                frase vazia como "Cães" usa: diferente de cães, ninhada é
                conteúdo opcional de verdade — muitos canis nunca terão uma. */}
            {litters.length > 0 ? (
              <section className="border-border flex flex-col gap-4 border-t pt-8">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Ninhadas disponíveis
                </h2>

                {/* Card virou LINK para `/n/[public_id]`, não mais gatilho de
                    lightbox. A ninhada deixou de ser "texto + até 4 fotos" e
                    passou a ter progenitores, filhotes, saúde e pedigree — isso
                    não cabe num modal, e o criador precisa de um endereço para
                    divulgar. O lightbox continua existindo para a galeria do
                    canil, acima; aqui ele mostraria uma fração da ninhada e
                    esconderia o resto. */}
                <ul className="flex flex-col gap-3 xl:grid xl:grid-cols-3 xl:gap-4">
                  {litters.map((litter) => {
                    const [capa] = litter.photos;
                    const resumo = previewDescription(litter.description);
                    const quando = litter.born_on
                      ? `Nascida em ${isoToBr(litter.born_on)}`
                      : litter.mated_on
                        ? `Prevista para ${isoToBr(expectedWhelpingDate(litter.mated_on) ?? "")}`
                        : null;

                    return (
                      <li key={litter.id}>
                        <Link
                          href={`/n/${litter.public_id}`}
                          // Sem prefetch: mesmo motivo do card de cão acima —
                          // com a lista cheia, cada card em viewport baixaria o
                          // payload da ninhada inteira (progenitores, pedigree,
                          // exames) sem o visitante nunca ter pedido.
                          prefetch={false}
                          className="border-border bg-surface hover:bg-surface-hover focus-visible:outline-ring rounded-card flex w-full gap-4 border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
                        >
                          <div className="bg-surface-hover rounded-control text-fg-faint flex size-16 shrink-0 items-center justify-center overflow-hidden">
                            {capa?.thumbUrl ? (
                              <Image
                                src={capa.thumbUrl}
                                alt=""
                                width={64}
                                height={64}
                                className="size-16 object-cover"
                                unoptimized
                              />
                            ) : (
                              <span className="text-[11px]">Sem foto</span>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col gap-1">
                            {/* O NOME vira o título quando existe; a data desce a uma
                                linha de apoio. Sem nome, a data continua sendo o título,
                                que é o comportamento que esta lista sempre teve. */}
                            {litter.name ? (
                              <span className="text-fg text-sm font-medium">{litter.name}</span>
                            ) : null}
                            {quando ? (
                              <span
                                className={
                                  litter.name
                                    ? "text-fg-muted text-xs"
                                    : "text-fg text-sm font-medium"
                                }
                              >
                                {quando}
                              </span>
                            ) : null}
                            {litter.breed || kennelLitterStatusLabel(litter.status) ? (
                              <span className="text-fg-faint text-xs">
                                {[litter.breed, kennelLitterStatusLabel(litter.status)]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            ) : null}
                            {resumo ? (
                              <p className="text-fg-muted min-w-0 text-sm whitespace-pre-line">
                                {resumo}
                              </p>
                            ) : null}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {/* Mesmo padrão de ausência completa de "Ninhadas disponíveis":
                depoimento é conteúdo opcional, muitos canis nunca terão um. */}
            {testimonials.length > 0 ? (
              <section className="border-border flex flex-col gap-4 border-t pt-8">
                <h2 className="font-display text-lg font-semibold tracking-tight">Depoimentos</h2>
                <ul className="flex flex-col gap-3 xl:grid xl:grid-cols-3 xl:gap-4">
                  {testimonials.map((testimonial) => (
                    <TestimonialCard key={testimonial.id} testimonial={testimonial} />
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Última seção antes do CTA — responde a última dúvida antes de
                convidar pro cadastro. Mesmo padrão de ausência completa. */}
            {faqs.length > 0 ? (
              <section className="border-border flex flex-col gap-4 border-t pt-8">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Perguntas frequentes
                </h2>
                <FaqAccordion faqs={faqs} />
              </section>
            ) : null}

            <SignupInvite source="perfil-canil" />
          </div>
        </PublicGallery>
      </main>
    </div>
  );
}
