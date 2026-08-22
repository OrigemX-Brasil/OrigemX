import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isoToBr } from "@/modules/dogs/br-date";
import { TrustBadges } from "@/modules/dogs/components/trust-badges";
import { FaqAccordion } from "@/modules/faqs/components/faq-accordion";
import { GeneticList } from "@/modules/health/components/genetic-list";
import {
  getGeneticTestsByDog,
  getHealthRecordsByDog,
  type GeneticTest,
} from "@/modules/health/queries";
import { DogHealthSummary, LitterHealthSummary } from "@/modules/health/components/health-summary";
import { latestByKind, litterHealthCoverage } from "@/modules/health/summary";
import { countAvailableBySex, describeAvailability } from "@/modules/litters/availability";
import { whatsappHref } from "@/modules/litters/contact";
import { expectedWhelpingDate } from "@/modules/litters/gestation";
import { litterStatusClass, litterStatusLabel } from "@/modules/litters/constraints";
import { PedigreeTree } from "@/modules/pedigree/components/pedigree-tree";
import { MAX_PHOTO_GENERATION } from "@/modules/pedigree/layout";
import { getPedigree } from "@/modules/pedigree/queries";
import { thumbnailTargets } from "@/modules/pedigree/tree";
import { BrandX } from "@/modules/public/components/brand-x";
import { ParentCard } from "@/modules/public/components/parent-card";
import {
  CalendarIcon,
  FemaleIcon,
  MaleIcon,
  PawIcon,
  Stat,
} from "@/modules/public/components/stat-strip";
import { PhotoTrigger, PublicGallery } from "@/modules/public/components/photo-lightbox";
import { PublicImage } from "@/modules/public/components/public-image";
import { excerpt, publicMetadata, siteUrl } from "@/modules/public/metadata";
import {
  getPublicDogThumbs,
  getPublicFaqs,
  getPublicLitterByPublicId,
  getPublicLitterParents,
  getPublicLitterPuppies,
} from "@/modules/public/queries";
import { KennelSearch } from "@/modules/search/components/kennel-search";
import { createPublicClient } from "@/lib/supabase/public";
import type { ResolvedMedia } from "@/modules/media/queries";

/**
 * ============================================================================
 * Página pública da ninhada — /n/[public_id]
 * ============================================================================
 *
 * Terceiro endereço público do produto, no mesmo vocabulário dos outros dois:
 * `/c/` canil, `/d/` cão, `/n/` ninhada. O identificador é o `public_id`
 * IMUTÁVEL (trigger `kennel_litters_freeze_public_id`), pela mesma razão do
 * cão: link divulgado não pode passar a apontar para outro lugar.
 *
 * ISR de 5 minutos, client ANÔNIMO, como as demais rotas públicas.
 *
 * O QUE ESTA PÁGINA NÃO FAZ: nenhuma consulta filtra "publicado". A REGRA
 * DUPLA (`kennel_litters_select`) e `dogs_select` decidem, e o client anônimo
 * simplesmente não recebe o que não pode ver. Filhote em rascunho não aparece
 * porque a policy não o entrega — não porque um `if` aqui o escondeu.
 *
 * CAMPOS SENSÍVEIS: microchip e registro CBKC do filhote NÃO são consultados.
 * `dog_identifiers` sequer tem grant para `anon` — a garantia é do banco, não
 * desta página.
 */
export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

function formatPrice(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ public_id: string }>;
}): Promise<Metadata> {
  const { public_id } = await params;
  const litter = await getPublicLitterByPublicId(public_id);
  if (!litter) return { title: "Ninhada não encontrada" };

  const quando = litter.born_on
    ? `nascida em ${isoToBr(litter.born_on)}`
    : litter.mated_on
      ? `prevista para ${isoToBr(expectedWhelpingDate(litter.mated_on) ?? "")}`
      : null;

  const fallback = [quando, `Ninhada do ${litter.kennel.name}.`].filter(Boolean).join(" · ");

  /**
   * O card de compartilhamento usa a foto do PAI ou da MÃE — nunca a foto da
   * própria ninhada. Decisão de produto: a foto de um progenitor com pedigree
   * vende mais que um mosaico de filhotes recém-nascidos, e mantém o card
   * consistente com o que a seção "Progenitores" desta mesma página já
   * mostra (mesma função, mesma capa).
   *
   * `getPublicLitterParents` é `cache()`, mas o array `[sire_id, dam_id]`
   * nasce de novo aqui e de novo no corpo da página — react `cache()`
   * dedupliza por IDENTIDADE do argumento, não por igualdade de conteúdo, e
   * dois arrays literais nunca são o mesmo objeto. Uma consulta indexada a
   * mais (`limit 2`) é o preço de reusar a função em vez de inventar um
   * canal entre `generateMetadata` e a página só para isto.
   *
   * ORDEM PAI → MÃE: quando os dois têm foto, o pai vence. Sem nenhum dos
   * dois, `capa` fica `null` e `publicMetadata` cai sozinho na imagem de
   * marca — não há mais fallback intermediário na foto da própria ninhada.
   *
   * `cover.url` é a mesma URL PERMANENTE de sempre (bucket público, sem
   * token) — `getDogCovers`, por trás de `getPublicLitterParents`, resolve
   * do mesmo jeito que `resolveMediaUrls` resolve em toda página pública.
   */
  const parents = await getPublicLitterParents([litter.sire_id, litter.dam_id]);
  const sire = litter.sire_id ? (parents.get(litter.sire_id) ?? null) : null;
  const dam = litter.dam_id ? (parents.get(litter.dam_id) ?? null) : null;

  let capa: ResolvedMedia | null = null;
  let imageAlt: string | undefined;
  if (sire?.cover) {
    capa = sire.cover;
    imageAlt = `${sire.name}, pai da ninhada do ${litter.kennel.name}`;
  } else if (dam?.cover) {
    capa = dam.cover;
    imageAlt = `${dam.name}, mãe da ninhada do ${litter.kennel.name}`;
  }

  return publicMetadata({
    title: `Ninhada — ${litter.kennel.name}`,
    description: excerpt(litter.description) ?? fallback,
    path: `/n/${litter.public_id}`,
    imageUrl: capa?.url ?? null,
    imageAlt,
    imageWidth: capa?.width ?? null,
    imageHeight: capa?.height ?? null,
  });
}

export default async function NinhadaPublicaPage({
  params,
}: {
  params: Promise<{ public_id: string }>;
}) {
  const { public_id } = await params;

  const litter = await getPublicLitterByPublicId(public_id);
  if (!litter) notFound();

  const [parents, puppies] = await Promise.all([
    getPublicLitterParents([litter.sire_id, litter.dam_id]),
    getPublicLitterPuppies(litter.id),
  ]);

  const sire = litter.sire_id ? (parents.get(litter.sire_id) ?? null) : null;
  const dam = litter.dam_id ? (parents.get(litter.dam_id) ?? null) : null;

  // Exames dos PAIS e saúde dos FILHOTES, cada um em uma consulta em lote.
  //
  // O exame não é copiado nem importado: mora em `dog_genetic_tests` com o
  // `dog_id` do reprodutor, e esta página só LÊ por sire_id/dam_id. Cadastrar
  // no perfil do pai basta para aparecer em toda ninhada dele.
  const supabase = createPublicClient();
  const [genetics, health, faqs] = await Promise.all([
    getGeneticTestsByDog([litter.sire_id, litter.dam_id], supabase),
    getHealthRecordsByDog(
      puppies.map((p) => p.id),
      supabase,
    ),
    // O FAQ é do CANIL, não da ninhada — mesma fonte de `/c/[slug]`. Quem
    // chega pela ninhada tem as mesmas dúvidas de quem chega pelo canil
    // ("como funciona a entrega?", "qual a garantia?"), e mandá-lo a outra
    // página para lê-las custaria a visita.
    getPublicFaqs(litter.kennel.id),
  ]);

  /**
   * O pedigree da ninhada: UMA árvore de 5 gerações de progenitores (pais →
   * avós → bisavós → trisavós → tetravós) — a mesma profundidade da página do
   * cão, só começando um passo à frente dela.
   *
   * A âncora é o primeiro filhote publicado, e não os progenitores, por uma
   * razão de estrutura: a numeração Ahnentafel da RPC precisa de UMA raiz para
   * que os dois lados sejam ramos da MESMA árvore. Pedindo a partir de cada
   * progenitor sairiam duas árvores separadas — que foi o que esta página fez
   * até agora, e é justamente a duplicação que o redesenho remove. O filhote
   * nunca é renderizado: `variant="litter"` omite a coluna do sujeito.
   *
   * As 5 gerações são pedidas na CONSULTA, não cortadas no layout: a recursão
   * de `Branches` para por falta de nó, então limitar aqui é o único corte que
   * funciona de verdade. `LITTER_GENERATIONS` (`pedigree/layout.ts`) precisa
   * ter uma entrada por geração pedida aqui — é o mesmo teto em dois lugares.
   *
   * Sem filhote publicado não há seção. O pedigree da ninhada é o dos filhotes;
   * sem nenhum, não há o que mostrar a um comprador — e os progenitores estão
   * no topo, cada um com link para o próprio perfil, onde a árvore completa
   * deles vive.
   */
  const ancora = puppies[0];
  const litterPedigree = ancora ? await getPedigree(ancora.id, 5) : null;

  // Miniaturas dos ancestrais, em lote — o mesmo padrão de `/d/[public_id]`.
  // Sem isto a árvore renderiza sem foto nenhuma, que é o que ela vinha
  // fazendo aqui (as duas chamadas antigas passavam `new Map()`).
  const pedigreeThumbs = await getPublicDogThumbs(
    litterPedigree ? thumbnailTargets(litterPedigree, MAX_PHOTO_GENERATION) : [],
  );

  const previsao = litter.born_on ? null : expectedWhelpingDate(litter.mated_on);
  const machos = puppies.filter((p) => p.sex === "male").length;
  const femeas = puppies.filter((p) => p.sex === "female").length;

  // Cobertura de saúde da ninhada. O denominador é `puppies` — a lista que ESTA
  // página renderizou, já filtrada por `published_at` — e não todos os filhotes
  // do banco: "2 de 6" numa página que mostra 2 cards não teria como ser
  // reconciliado por quem lê.
  const healthCoverage = litterHealthCoverage(
    puppies.map((p) => p.id),
    health,
  );

  // "Restam 2 machos e 1 fêmea" — CONTADO do `litter_status` dos filhotes
  // publicados, nunca digitado. `null` quando não sobrou nenhum, e aí a seção
  // não existe: "restam 0" é a frase que faz o visitante fechar a página.
  //
  // Note que isto é DIFERENTE dos totais da barra de resumo acima (machos e
  // fêmeas da ninhada INTEIRA, vendidos inclusive) — são duas leituras
  // legítimas, e a barra continua respondendo "como foi a ninhada".
  const disponibilidade = countAvailableBySex(puppies);
  const disponiveis = describeAvailability(disponibilidade);
  const totalDisponiveis = disponibilidade.males + disponibilidade.females;

  /**
   * A raça sai dos PROGENITORES, não dos filhotes.
   *
   * `dogs.breed` é texto livre e opcional em todo cão, e o filhote recém-
   * cadastrado costuma nascer sem ele — o criador preenche o reprodutor com
   * cuidado e despacha os filhotes. Perguntar primeiro à mãe, depois ao pai e
   * só então ao primeiro filhote é a ordem que mais frequentemente acha um
   * valor. Sem nenhum, a linha não é renderizada.
   */
  const raca = dam?.breed ?? sire?.breed ?? puppies.find((p) => p.breed)?.breed ?? null;

  /**
   * O selo de vacina só sai com cobertura COMPLETA.
   *
   * É a mesma regra da honestidade que `LitterHealthSummary` já aplica logo
   * abaixo: numa ninhada de seis com um vacinado, um selo dizendo "Vacina em
   * 20/09" afirmaria da NINHADA o que é verdade de um filhote só. Cobertura
   * parcial continua aparecendo — com o número real ("Vacina: 1 de 6
   * filhotes"), na seção de saúde, que é onde cabe a nuance.
   */
  const vacinaCompleta =
    healthCoverage.find((c) => c.kind === "vaccine" && c.complete)?.applied_on ?? null;

  // Só fotos com URL resolvida entram no lightbox — clicar num placeholder sem
  // imagem não abriria nada. Mesmo filtro de `/d/[public_id]`.
  const photos = litter.photos
    .filter((photo): photo is typeof photo & { url: string } => Boolean(photo.url))
    .map((photo) => ({
      url: photo.url,
      alt: photo.alt ?? `Foto da ninhada do ${litter.kennel.name}`,
      caption: photo.caption,
      width: photo.width,
      height: photo.height,
    }));

  // `id` → posição em `photos`. Uma foto sem URL no meio do caminho deslocaria
  // os índices se a lista bruta fosse usada direto — mesmo cuidado de
  // `/d/[public_id]`.
  const photoIndex = new Map(
    litter.photos.filter((photo) => photo.url).map((photo, i) => [photo.id, i] as const),
  );

  // Sem telefone cadastrado, `whatsappHref` devolve null e o CTA simplesmente
  // não existe — SEM fallback para Instagram ou site. Um botão escrito "Tenho
  // interesse NESTA ninhada" que abre um perfil genérico promete uma coisa e
  // entrega outra. Quem quiser os outros contatos do canil tem o link para
  // `/c/[slug]` no topo e no rodapé desta página.
  const contatoHref = whatsappHref({
    phone: litter.kennel.whatsapp,
    publicId: litter.public_id,
    bornOn: litter.born_on,
    matedOn: litter.mated_on,
    siteUrl: siteUrl().origin,
  });

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Mesmo shell de `/c/` e `/d/`. A página da ninhada nasceu sem ele e
          ficava órfã da marca — a referência do cliente tem o wordmark no topo,
          e um link divulgado no WhatsApp abre sem nenhum contexto de onde está.
          `prefetch={false}` como em toda página pública: o wordmark está SEMPRE
          na viewport e o prefetch dele disparava o pixel da captura. */}
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-4 lg:px-8">
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
        {/* `description`: o prop existe desde sempre PARA a ninhada (ver o doc
            dele em `photo-lightbox.tsx`) e nunca teve quem o passasse — a
            ficha da ninhada é o texto inteiro, não uma legenda presa a uma
            foto. */}
        <PublicGallery photos={photos} description={litter.description}>
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <Link
                href={`/c/${litter.kennel.slug}`}
                prefetch={false}
                className="text-link hover:text-link-hover focus-visible:outline-ring w-fit text-sm transition-colors focus-visible:outline-2"
              >
                {litter.kennel.name}
              </Link>

              {/*
                O TÍTULO CARREGA A DATA, e não é enfeite: `kennel_litters` não
                tem coluna de nome (ver `litters/contact.ts`), então "Ninhada"
                sozinho não distingue esta das outras três do mesmo canil para
                quem recebeu o link no WhatsApp. A mesma escolha entre
                nascimento e previsão que a mensagem do CTA já faz.
              */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {litter.born_on
                    ? `Ninhada de ${isoToBr(litter.born_on)}`
                    : previsao
                      ? `Ninhada prevista para ${isoToBr(previsao)}`
                      : "Ninhada"}
                </h1>

                {/* A pílula responde "tem algo pra mim aqui?" antes da dobra;
                    o detalhamento por sexo fica na faixa abaixo. Some quando
                    não sobrou nenhum — "0 disponíveis" é a frase que faz o
                    visitante fechar a página, e o status de cada filhote
                    continua visível card a card. */}
                {totalDisponiveis > 0 ? (
                  <span className="border-success/40 bg-success-subtle text-success rounded-control inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 text-xs font-medium">
                    <span aria-hidden="true" className="bg-success size-1.5 rounded-full" />
                    {totalDisponiveis} {totalDisponiveis === 1 ? "disponível" : "disponíveis"}
                  </span>
                ) : null}
              </div>

              {raca ? <p className="text-fg-muted text-sm">{raca}</p> : null}

              {/* Cada selo só existe se o DADO existir — ver o cabeçalho de
                  `trust-badges.tsx`, que também explica por que NÃO há
                  "Criador Verificado" nem "vacinas em dia". */}
              <TrustBadges
                founderNumber={litter.kennel.founder_number}
                vaccineDate={vacinaCompleta}
                geneticTestCount={
                  (genetics.get(litter.sire_id ?? "") ?? []).length +
                  (genetics.get(litter.dam_id ?? "") ?? []).length
                }
                knownAncestors={litterPedigree?.knownAncestors ?? 0}
              />
            </div>

            {sire || dam ? (
              <section className="border-border bg-surface rounded-card flex flex-col gap-5 border p-5">
                <h2 className="font-display text-lg font-semibold tracking-tight">Progenitores</h2>

                {/*
                DUAS LINHAS DE GRID, e é isso que centraliza o X.

                `max-w-3xl` e centralizado: sem o teto, numa faixa `xl` de
                ~1200px as duas fotos 4:3 viravam dois painéis gigantes e
                empurravam o resto da página para baixo da dobra. O par de
                progenitores é a abertura, não o conteúdo inteiro.

                As linhas são [FOTO, NOME+SEXO]: cada `ParentCard` é
                `row-span-2 grid-rows-subgrid`, então as duas fotos dividem a
                linha 1 e os dois nomes a linha 2 — as fotos alinham entre si
                mesmo com nomes de comprimentos diferentes. E o X, sendo
                `row-start-1 self-center`, centraliza na LINHA DAS FOTOS.

                Antes ele era `self-center` num grid de linha única, o que o
                centralizava na altura do CARD INTEIRO (foto + nome + chip) e o
                deixava visivelmente abaixo do meio das fotos.
              */}
                <div className="mx-auto grid w-full max-w-3xl grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto] items-start gap-3 sm:gap-6">
                  <ParentCard parent={dam} fallback="Mãe não informada" />

                  {/*
                  O ELEMENTO-ASSINATURA DA PÁGINA.

                  Em pedigree, "×" significa "cruzado com". A marca do produto
                  também é um X. Os dois glifos são o mesmo — então aqui o
                  símbolo do cruzamento É a marca, desenhada com a mesma
                  geometria do favicon (ver `brand-x.tsx`).
                */}
                  {/* `col-start-2` NÃO é decorativo: `row-start-1` sozinho torna
                    este um item de posição definida, e o algoritmo do grid
                    posiciona esses ANTES dos automáticos — o X ia parar na
                    coluna 1 e empurrava mãe e pai para a direita. Fixar a
                    coluna devolve a ordem mãe · X · pai. */}
                  <BrandX className="col-start-2 row-start-1 size-9 self-center sm:size-14" />

                  <ParentCard parent={sire} fallback="Pai não informado" />
                </div>
              </section>
            ) : null}

            {/*
            Barra de resumo. 2×2 no mobile e 4 colunas a partir de `sm`, com
            divisores entre as células — a referência os usa para separar as
            quatro leituras, e sem eles os números correm juntos.

            Machos e fêmeas são CONTADOS dos filhotes publicados, nunca
            digitados: total que discorda das linhas é o pior tipo de bug de
            vitrine.
          */}
            <section className="border-border bg-surface rounded-card divide-border grid grid-cols-2 divide-x divide-y border sm:grid-cols-4 sm:divide-y-0">
              <Stat
                icon={<CalendarIcon />}
                label={litter.born_on ? "Nascimento" : "Previsão de parto"}
                value={
                  litter.born_on ? isoToBr(litter.born_on) : previsao ? isoToBr(previsao) : "—"
                }
              />
              <Stat icon={<PawIcon />} label="Filhotes" value={String(puppies.length)} />
              <Stat icon={<MaleIcon />} label="Machos" value={String(machos)} />
              <Stat icon={<FemaleIcon />} label="Fêmeas" value={String(femeas)} />
            </section>

            {/* Quantos ainda estão disponíveis, DETALHADO por sexo — a pílula do
          topo dá só o total. Contado do `litter_status`, nunca digitado; some
          por inteiro quando não sobrou nenhum. */}
            {disponiveis ? (
              <section className="border-success/40 bg-success-subtle rounded-card flex items-center gap-3 border px-5 py-4">
                <span aria-hidden="true" className="text-success shrink-0">
                  <PawIcon />
                </span>
                <p className="text-fg text-sm">
                  Restam <strong className="font-semibold">{disponiveis}</strong> disponíveis nesta
                  ninhada.
                </p>
              </section>
            ) : null}

            {litter.description ? (
              <p className="text-fg-muted text-sm whitespace-pre-line">{litter.description}</p>
            ) : null}

            {litter.photos.length > 0 ? (
              <section className="border-border flex flex-col gap-4 border-t pt-8">
                <h2 className="font-display text-lg font-semibold tracking-tight">Fotos</h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {litter.photos.map((photo) => {
                    const imagem = (
                      <PublicImage
                        src={photo.url}
                        alt={photo.alt ?? ""}
                        fallbackText={litter.kennel.name}
                        width={photo.width ?? 1}
                        height={photo.height ?? 1}
                        className="aspect-square w-full object-cover"
                      />
                    );

                    return (
                      <li key={photo.id} className="bg-surface-hover rounded-card overflow-hidden">
                        {/* Só a foto que TEM url resolvida vira gatilho — ampliar um
                      placeholder sem imagem não abriria nada. */}
                        {photoIndex.has(photo.id) ? (
                          <PhotoTrigger
                            index={photoIndex.get(photo.id)!}
                            label={`Ampliar foto ${photoIndex.get(photo.id)! + 1} de ${photos.length} da ninhada`}
                            className="focus-visible:outline-ring block w-full focus-visible:outline-2 focus-visible:-outline-offset-2"
                          >
                            {imagem}
                          </PhotoTrigger>
                        ) : (
                          imagem
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {puppies.length > 0 ? (
              <section className="border-border flex flex-col gap-4 border-t pt-8">
                <h2 className="font-display text-lg font-semibold tracking-tight">Filhotes</h2>

                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {puppies.map((puppy) => {
                    const status = litterStatusLabel(puppy.litter_status);
                    const preco = formatPrice(puppy.price_brl);
                    const registros = health.get(puppy.id) ?? [];

                    return (
                      <li
                        key={puppy.id}
                        className="border-border bg-surface rounded-card flex flex-col overflow-hidden border"
                      >
                        <Link
                          href={`/d/${puppy.public_id}`}
                          className="focus-visible:outline-ring flex flex-col focus-visible:outline-2 focus-visible:-outline-offset-2"
                        >
                          {/* O STATUS SOBE PARA A FOTO. Antes ele era o terceiro
                        chip de uma fileira com sexo e cor, todos do mesmo
                        tamanho — e "Disponível" vs. "Vendido" é justamente a
                        leitura que decide se o card interessa. Sobre a
                        imagem, com fundo próprio, ele é lido antes do nome.

                        `bg-surface/90` atrás do chip: sobre foto clara, o
                        verde de `bg-success-subtle` sozinho não teria
                        contraste garantido. */}
                          <div className="bg-surface-hover relative aspect-[4/3] w-full">
                            <PublicImage
                              src={puppy.cover?.url ?? null}
                              alt=""
                              fallbackText={puppy.name}
                              width={puppy.cover?.width ?? 4}
                              height={puppy.cover?.height ?? 3}
                              className="size-full object-cover"
                            />
                            {status ? (
                              <span
                                className={`rounded-control bg-surface/90 absolute top-2 right-2 border px-2 py-0.5 text-xs font-medium backdrop-blur-sm ${
                                  litterStatusClass(puppy.litter_status) ?? ""
                                }`}
                              >
                                {status}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex flex-col gap-2 p-3">
                            <span className="text-fg font-medium">{puppy.name}</span>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="border-border-strong bg-surface-raised text-fg-muted rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-xs font-medium">
                                <span aria-hidden="true">{puppy.sex === "female" ? "♀" : "♂"}</span>
                                {SEX_LABEL[puppy.sex]}
                              </span>
                              {puppy.color ? (
                                <span className="border-border-strong bg-surface-raised text-fg-muted rounded-control border px-2 py-0.5 text-xs">
                                  {puppy.color}
                                </span>
                              ) : null}
                              {/* Puramente informativo — sem mecanismo de oferta.
                            Independente do preço: pode aparecer mesmo sem
                            valor cadastrado ("só sob consulta"). Estilo
                            neutro (mesmo do chip de cor), não o verde de
                            "Disponível" — os dois na mesma fileira
                            competiriam por atenção sem diferenciar sentido. */}
                              {puppy.accepts_offer ? (
                                <span className="border-border-strong bg-surface-raised text-fg-muted rounded-control border px-2 py-0.5 text-xs font-medium">
                                  Aceita proposta
                                </span>
                              ) : null}
                            </div>

                            {/* Preço com mais peso que os chips: é a segunda
                          pergunta de quem já decidiu que o filhote serve. */}
                            {preco ? (
                              <span className="text-fg font-mono text-base font-semibold tabular-nums">
                                {preco}
                              </span>
                            ) : null}

                            {/* O mais recente de CADA tipo, não as N primeiras
                          linhas do log: três doses de vacina empurrariam o
                          vermífugo fora da lista e o card diria menos do que
                          o filhote tem. */}
                            <DogHealthSummary entries={latestByKind(registros)} />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {/* Saúde da ninhada, entre Filhotes e Pedigree — a ordem da referência.
          Ausente por inteiro quando nenhum filhote tem registro: título sobre
          caixa vazia é pior que seção nenhuma. */}
            {healthCoverage.length > 0 ? (
              <section className="border-border flex flex-col gap-4 border-t pt-8">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Saúde e garantias
                </h2>
                <LitterHealthSummary coverage={healthCoverage} />
              </section>
            ) : null}

            <GeneticBlock sire={sire} dam={dam} genetics={genetics} />

            {/* UMA árvore, começando nos progenitores — `variant="litter"` omite a
          coluna do sujeito. Antes eram DUAS (materna e paterna), com dois
          cabeçalhos de pedigree na mesma página; a referência mostra uma só,
          e é também a leitura correta: os avós maternos e paternos são ramos
          da MESMA árvore, não duas árvores.

          `pedigree` vem de um filhote (ver `pedigreeDaNinhada`), que serve só
          de âncora para a numeração da RPC e nunca aparece na tela. */}
            {/* `min-w-0`: a árvore rola dentro de si, e sem isto um filho de flex
          com conteúdo largo estoura o container em vez de rolar — que é
          exatamente o que o teste de 360px existe para pegar. */}
            {litterPedigree ? (
              <div className="border-border flex min-w-0 flex-col border-t pt-8">
                <PedigreeTree pedigree={litterPedigree} thumbs={pedigreeThumbs} variant="litter" />
              </div>
            ) : null}

            {/* FAQ do CANIL, não da ninhada — quem chega por aqui tem as mesmas
          dúvidas de quem chega por `/c/[slug]`, e mandá-lo a outra página
          para lê-las custaria a visita. Some quando o canil não cadastrou
          nenhuma pergunta. */}
            {faqs.length > 0 ? (
              <section className="border-border flex flex-col gap-4 border-t pt-8">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Perguntas frequentes
                </h2>
                <FaqAccordion faqs={faqs} />
              </section>
            ) : null}

            {/* A referência traz "Responda em até 24h" ao lado do nome do canil.
              Fica de fora: é uma promessa sobre o comportamento do CRIADOR que
              a plataforma não tem como garantir, e exibi-la seria o produto
              assumindo um compromisso por terceiro. Nome e praça, que são
              fatos.

              SOBE PARA ANTES DO CTA: `sticky` só gruda enquanto o elemento
              está no fluxo do container, e o container acaba no último filho.
              Com o rodapé DEPOIS do CTA, o botão descolaria antes do fim da
              página. */}
            <p className="text-fg-faint text-center text-sm">
              <Link
                href={`/c/${litter.kennel.slug}`}
                prefetch={false}
                className="text-link hover:text-link-hover"
              >
                {litter.kennel.name}
              </Link>
              {litter.kennel.city ? ` · ${litter.kennel.city}` : ""}
              {litter.kennel.state ? `/${litter.kennel.state}` : ""}
            </p>

            {/*
            CTA STICKY — o mesmo bloco de `/d/[public_id]`.

            `sticky` e não `fixed`: funciona porque este é o ÚLTIMO filho do
            container de fluxo. `-mx-5 px-5` sangra contra o `px-5` do `main`
            (e `lg:-mx-8 lg:px-8` contra o `lg:px-8`), então a barra ocupa a
            largura inteira sem furar o container.

            `pb-[max(...,env(safe-area-inset-bottom))]` depende de
            `viewport-fit=cover`, que está no `layout.tsx` raiz — sem o par, o
            `env()` resolve 0 no iOS e o botão fica sob a barra de gestos.
          */}
            {contatoHref ? (
              <div className="sticky bottom-0 z-20 -mx-5 mt-2 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:-mx-8 lg:px-8">
                <div className="bg-surface supports-[backdrop-filter]:bg-glass backdrop-blur-panel border-border-glass rounded-card flex flex-col gap-2 border p-2">
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
                    Tenho interesse nesta ninhada
                  </a>

                  {/* O QUE ACONTECE AO CLICAR, dito antes do clique. O botão
                    abre uma conversa com o CRIADOR — a OrigemX não recebe a
                    mensagem, não guarda quem clicou e não intermedeia. É a
                    fronteira do produto (a negociação acontece toda fora da
                    plataforma) escrita onde o visitante a lê. */}
                  {/* Compacto de propósito: a barra fica FIXA no rodapé, e
                      cada linha aqui é altura permanentemente subtraída da
                      tela de quem lê a página num celular. */}
                  <p className="text-fg-faint px-2 pb-0.5 text-center text-[0.6875rem] leading-snug">
                    Ao clicar, você fala direto com o criador pelo WhatsApp — a OrigemX não
                    participa da negociação.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </PublicGallery>
      </main>
    </div>
  );
}

/**
 * Exames dos progenitores.
 *
 * Renderiza só o que EXISTE no perfil de cada pai. Não há campo de exame na
 * ninhada, e é o ponto: o laudo tem um dono só, e é o cão.
 *
 * VISIBILIDADE NÃO É DECIDIDA AQUI. `sire`/`dam` vêm de
 * `getPublicLitterParents` e os exames de `getGeneticTestsByDog`, ambos com o
 * client ANÔNIMO — então progenitor que não passa em `dog_is_public` nem chega
 * como objeto, e exame de cão em rascunho nem chega no Map. O `filter` abaixo
 * trata da AUSÊNCIA de exame, não de permissão.
 */
function GeneticBlock({
  sire,
  dam,
  genetics,
}: {
  sire: { id: string; name: string } | null;
  dam: { id: string; name: string } | null;
  genetics: Map<string, GeneticTest[]>;
}) {
  const blocos = [
    { parent: dam, label: "Mãe" },
    { parent: sire, label: "Pai" },
  ].filter((b) => b.parent && (genetics.get(b.parent.id) ?? []).length > 0);

  if (blocos.length === 0) return null;

  return (
    <section className="border-border flex flex-col gap-4 border-t pt-8">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Exames genéticos dos progenitores
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {blocos.map(({ parent, label }) => (
          <div
            key={parent!.id}
            className="border-border bg-surface rounded-card flex flex-col gap-2 border p-4"
          >
            <span className="text-fg text-sm font-medium">
              {label} · {parent!.name}
            </span>
            <GeneticList tests={genetics.get(parent!.id) ?? []} />
          </div>
        ))}
      </div>
    </section>
  );
}
