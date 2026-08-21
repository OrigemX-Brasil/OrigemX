import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isoToBr } from "@/modules/dogs/br-date";
import { GeneticList } from "@/modules/health/components/genetic-list";
import {
  getGeneticTestsByDog,
  getHealthRecordsByDog,
  type GeneticTest,
} from "@/modules/health/queries";
import {
  DogHealthSummary,
  LitterHealthSummary,
} from "@/modules/health/components/health-summary";
import { latestByKind, litterHealthCoverage } from "@/modules/health/summary";
import { whatsappHref } from "@/modules/litters/contact";
import { expectedWhelpingDate } from "@/modules/litters/gestation";
import { litterStatusLabel } from "@/modules/litters/constraints";
import { PedigreeTree } from "@/modules/pedigree/components/pedigree-tree";
import { MAX_PHOTO_GENERATION } from "@/modules/pedigree/layout";
import { getPedigree } from "@/modules/pedigree/queries";
import { thumbnailTargets } from "@/modules/pedigree/tree";
import { PublicImage } from "@/modules/public/components/public-image";
import { excerpt, publicMetadata, siteUrl } from "@/modules/public/metadata";
import {
  getPublicDogThumbs,
  getPublicLitterByPublicId,
  getPublicLitterParents,
  getPublicLitterPuppies,
  type PublicDog,
} from "@/modules/public/queries";
import { KennelSearch } from "@/modules/search/components/kennel-search";
import type { ResolvedMedia } from "@/modules/media/queries";
import { createPublicClient } from "@/lib/supabase/public";

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

const STATUS_CLS: Record<string, string> = {
  available: "border-success/40 bg-success-subtle text-success",
  reserved: "border-data/40 bg-data-subtle text-data",
  sold: "border-border-strong bg-surface-raised text-fg-faint",
};

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

  return publicMetadata({
    title: `Ninhada — ${litter.kennel.name}`,
    description: excerpt(litter.description) ?? fallback,
    path: `/n/${litter.public_id}`,
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
  const [genetics, health] = await Promise.all([
    getGeneticTestsByDog([litter.sire_id, litter.dam_id], supabase),
    getHealthRecordsByDog(
      puppies.map((p) => p.id),
      supabase,
    ),
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
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <Link
              href={`/c/${litter.kennel.slug}`}
              prefetch={false}
              className="text-link hover:text-link-hover focus-visible:outline-ring w-fit text-sm transition-colors focus-visible:outline-2"
            >
              {litter.kennel.name}
            </Link>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Ninhada
            </h1>
          </div>

          {sire || dam ? (
            <section className="border-border bg-surface rounded-card flex flex-col gap-5 border p-5">
              <h2 className="text-fg-faint text-xs font-medium tracking-widest uppercase">
                Progenitores
              </h2>

              {/* `max-w-3xl` e centralizado: sem o teto, numa faixa `xl` de
                  ~1200px as duas fotos 4:3 viravam dois painéis gigantes e
                  empurravam o resto da página para baixo da dobra. O par de
                  progenitores é a abertura, não o conteúdo inteiro. */}
              <div className="mx-auto grid w-full max-w-3xl grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
                <ParentCard parent={dam} fallback="Mãe não informada" />

                {/*
                  O ELEMENTO-ASSINATURA DA PÁGINA.

                  Em pedigree, "×" significa "cruzado com". A marca do produto
                  também é um X. Os dois glifos são o mesmo — então aqui o
                  símbolo do cruzamento É a marca, pintado com
                  `text-brand-gradient` (azul→violeta), o utilitário que
                  `tokens.css` descreve como "o mesmo do X do logo" e que até
                  agora não tinha uso em lugar nenhum do projeto.

                  `aria-hidden`: quem usa leitor de tela já ouve "Mãe · nome" e
                  "Pai · nome" nos dois cards; um "×" solto no meio não
                  acrescentaria nada.
                */}
                <span
                  aria-hidden="true"
                  className="text-brand-gradient font-display self-center text-3xl leading-none font-bold sm:text-5xl"
                >
                  ×
                </span>

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
              value={litter.born_on ? isoToBr(litter.born_on) : previsao ? isoToBr(previsao) : "—"}
            />
            <Stat icon={<PawIcon />} label="Filhotes" value={String(puppies.length)} />
            <Stat icon={<MaleIcon />} label="Machos" value={String(machos)} />
            <Stat icon={<FemaleIcon />} label="Fêmeas" value={String(femeas)} />
          </section>

      {litter.description ? (
        <p className="text-fg-muted text-sm whitespace-pre-line">{litter.description}</p>
      ) : null}

      {litter.photos.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-fg-faint text-xs font-medium tracking-widest uppercase">Fotos</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {litter.photos.map((photo) => (
              <li key={photo.id} className="bg-surface-hover rounded-card overflow-hidden">
                <PublicImage
                  src={photo.url}
                  alt={photo.alt ?? ""}
                  fallbackText={litter.kennel.name}
                  width={photo.width ?? 1}
                  height={photo.height ?? 1}
                  className="aspect-square w-full object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {puppies.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-fg-faint text-xs font-medium tracking-widest uppercase">Filhotes</h2>

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
                    <div className="bg-surface-hover aspect-[4/3] w-full">
                      <PublicImage
                        src={puppy.cover?.url ?? null}
                        alt=""
                        fallbackText={puppy.name}
                        width={puppy.cover?.width ?? 4}
                        height={puppy.cover?.height ?? 3}
                        className="size-full object-cover"
                      />
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
                        {status ? (
                          <span
                            className={`rounded-control border px-2 py-0.5 text-xs font-medium ${
                              STATUS_CLS[puppy.litter_status ?? ""] ?? STATUS_CLS.sold
                            }`}
                          >
                            {status}
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

                      {preco ? (
                        <span className="text-fg font-mono text-sm font-medium tabular-nums">
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
        <section className="border-border bg-surface rounded-card flex flex-col gap-4 border p-5">
          <h2 className="text-fg-faint text-xs font-medium tracking-widest uppercase">
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
      {litterPedigree ? (
        <PedigreeTree pedigree={litterPedigree} thumbs={pedigreeThumbs} variant="litter" />
      ) : null}

      {contatoHref ? (
        <a
          href={contatoHref}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-card focus-visible:outline-ring w-full px-4 py-4 text-center text-sm font-semibold transition-colors focus-visible:outline-2"
        >
          Tenho interesse nesta ninhada
        </a>
      ) : null}

          {/* A referência traz "Responda em até 24h" ao lado do nome do canil.
              Fica de fora: é uma promessa sobre o comportamento do CRIADOR que
              a plataforma não tem como garantir, e exibi-la seria o produto
              assumindo um compromisso por terceiro. Nome e praça, que são
              fatos. */}
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
        </div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span aria-hidden="true" className="text-fg-faint shrink-0">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-fg-faint text-[0.625rem] font-medium tracking-widest uppercase">
          {label}
        </span>
        <span className="text-fg font-mono text-base font-medium tabular-nums">{value}</span>
      </span>
    </div>
  );
}

/**
 * Os quatro ícones da barra de resumo.
 *
 * SVG inline, como todo ícone deste projeto (não há biblioteca) — mesmo
 * precedente do `CalendarIcon` em `dogs/components/date-field.tsx`. Todos com
 * `currentColor` e sem `aria`: quem anuncia é o rótulo de texto ao lado, e o
 * `aria-hidden` está no `<span>` que os envolve em `Stat`.
 */
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function CalendarIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/** Pata — quatro dedos e o coxim, a marca da contagem de filhotes. */
function PawIcon() {
  return (
    <svg {...ICON_PROPS}>
      <ellipse cx="8" cy="7" rx="1.9" ry="2.5" />
      <ellipse cx="16" cy="7" rx="1.9" ry="2.5" />
      <ellipse cx="4.5" cy="12.5" rx="1.7" ry="2.2" />
      <ellipse cx="19.5" cy="12.5" rx="1.7" ry="2.2" />
      <path d="M12 12.5c3 0 5 2.2 5 4.5 0 2-1.7 3.2-3.4 2.7-1-.3-2.2-.3-3.2 0C8.7 20.2 7 19 7 17c0-2.3 2-4.5 5-4.5Z" />
    </svg>
  );
}

function MaleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="10" cy="14" r="5" />
      <path d="M15 9l5-5M15 4h5v5" />
    </svg>
  );
}

function FemaleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7M9 18h6" />
    </svg>
  );
}

function ParentCard({
  parent,
  fallback,
}: {
  parent: (PublicDog & { cover: ResolvedMedia | null }) | null;
  fallback: string;
}) {
  if (!parent) {
    return (
      <div className="text-fg-faint flex flex-col items-center gap-2 text-center text-sm">
        {fallback}
      </div>
    );
  }

  return (
    <Link
      href={`/d/${parent.public_id}`}
      className="focus-visible:outline-ring flex flex-col items-center gap-2 text-center focus-visible:outline-2"
    >
      <div className="bg-surface-hover rounded-card aspect-[4/3] w-full overflow-hidden">
        <PublicImage
          src={parent.cover?.url ?? null}
          alt=""
          fallbackText={parent.name}
          width={parent.cover?.width ?? 4}
          height={parent.cover?.height ?? 3}
          className="size-full object-cover"
        />
      </div>
      <span className="text-fg text-sm font-semibold">{parent.name}</span>
      <span className="border-border-strong bg-surface-raised text-fg-muted rounded-control border px-2 py-0.5 text-xs font-medium">
        {SEX_LABEL[parent.sex]}
      </span>
    </Link>
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
    <section className="flex flex-col gap-3">
      <h2 className="text-fg-faint text-xs font-medium tracking-widest uppercase">
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
