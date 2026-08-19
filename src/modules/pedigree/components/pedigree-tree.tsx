import {
  ELBOW,
  GENERATIONS,
  LITTER_GENERATIONS,
  PREVIEW_ELBOW,
  PREVIEW_GENERATIONS,
  treeOverflow,
  type GenerationSpec,
} from "../layout";
import { generationOf, parentPositions, type Pedigree } from "../tree";
import { AncestorCard, CompactCard, UnknownSlot } from "./pedigree-card";
import { PedigreeGenerations } from "./pedigree-generations";

/**
 * `full`: perfil público do cão. `preview`: card da home. `litter`: página da
 * ninhada — igual a `full`, menos a coluna do sujeito. Ver o comentário do
 * prop `variant` em `PedigreeTree`.
 */
type Variant = "full" | "preview" | "litter";

/**
 * ============================================================================
 * Árvore de pedigree — colunas por geração a partir de `sm`, sem JavaScript.
 * ============================================================================
 *
 * DUAS APRESENTAÇÕES, UMA ÁRVORE. Este componente decide qual desenhar:
 *
 *   < sm (640px)  `PedigreeGenerations` — lista por geração, cards empilhados
 *   >= sm         as colunas com cotovelo que este arquivo desenha
 *
 * A mesma `Pedigree` (uma consulta, um `buildPedigree`) alimenta as duas, e
 * os cards são os mesmos componentes. O que existe em dobro é o MARKUP, com
 * `sm:hidden` / `hidden sm:block` — e é assim porque o servidor não sabe a
 * largura da tela: ler `headers()` aqui tornaria a rota dinâmica e mataria o
 * ISR, que é justamente o que faz esta página abrir rápido a partir do QR
 * impresso. O custo foi medido no HTML transferido, não estimado.
 *
 * POR QUE COLUNAS NO DESKTOP: o pedigree é um documento que o criador MOSTRA
 * — de lado, no estande — e a leitura que ele quer é a comparação entre
 * linhas. Na árvore aninhada de `<details>` que existia aqui antes, ver o
 * bisavô paterno e o materno lado a lado era impossível: dois cliques e um
 * scroll, e a relação sumia no caminho. É a forma que o setor usa há um
 * século, em papel, e não por acaso.
 *
 * POR QUE NÃO NO MOBILE: a mesma coluna que alinha bem em 900px vira, em
 * 360px, card solto no meio de um vão vertical enorme — o `grid-rows-2` que
 * alinha o colchete iguala as metades, e numa tela estreita isso é quase tudo
 * espaço vazio. Ver o cabeçalho de `pedigree-generations.tsx`.
 *
 * A ROLAGEM HORIZONTAL AQUI É DESENHO, não acidente: (1) o card do sujeito é
 * `sticky left-0`, então a referência nunca sai da tela; (2) a faixa de
 * cabeçalhos define pontos de `scroll-snap`, e a rolagem assenta numa geração
 * em vez de parar no meio de um nome; (3) `scroll-padding-left` do tamanho do
 * card fixado impede o snap esconder a coluna atrás dele; (4) uma borda em
 * degradê e uma frase anunciam que há mais à direita.
 *
 * `snap-proximity`, não `mandatory`: com `mandatory` o navegador é obrigado a
 * repousar num ponto de snap, e alvo maior que a área restante vira briga de
 * rolagem com conteúdo inalcançável.
 *
 * A PARTIR DE `xl` NÃO HÁ ROLAGEM: o container é `max-w-6xl` e a árvore cheia
 * (1000px, ver `treeWidth`) cabe nos 1062px úteis. O scroller continua no
 * markup — é o mesmo HTML para todas as larguras, e ele simplesmente não tem o
 * que rolar. O que muda é a affordance, que some por `xl:hidden`. Quem decide
 * isso é `treeOverflow`, em `layout.ts`, com a régua ao lado da geometria.
 *
 * FOTO ATÉ A TERCEIRA GERAÇÃO (`MAX_PHOTO_GENERATION` em `layout.ts`).
 * Sujeito + g1..g3 = no máximo 15 miniaturas, todas `lazy`. Da quarta em
 * diante o card é texto: são 16 e 32 posições, e 48 miniaturas a mais em 4G
 * de feira custariam mais que o pedigree inteiro. A referência do cliente
 * (`assets/fotos/home-exemplo.jpg`) encolhe o card por geração pelo mesmo
 * motivo, muito antes de existir 4G.
 *
 * AS LINHAS TÊM COR, E A COR TEM DONO: cada FILHO desenha a sua própria
 * metade do colchete (`pos` par = pai = azul; ímpar = mãe = violeta — ver
 * `Branches`). Nenhum elemento tem duas cores; as duas metades se encontram
 * no meio do grupo, que é exatamente o centro do card do pai — de graça, pelo
 * `items-center`. Sobre `--color-surface` o azul mede ~3,7:1 e o violeta
 * ~3,4:1, acima dos 3,0 que a WCAG 1.4.11 pede de objeto gráfico. O dourado é
 * do selo (ver tokens.css) e não entra aqui. A cor NÃO é o único canal: a
 * relação e o caminho por extenso continuam em todo card — visíveis até a 2ª
 * geração, em `title`/`sr-only` depois (ver `pedigree-card.tsx`) — o que
 * atende 1.4.1 e sustenta o leitor de tela, onde linha colorida não existe.
 *
 * O nome do ancestral aparece SEMPRE, inclusive de registro não publicado de
 * outro criador — decisão de produto em supabase/README.md. O resto dos
 * campos o banco não devolve, e a MINIATURA só é pedida para ancestral
 * público de até a terceira geração: ver `thumbnailTargets` (`tree.ts`) e
 * `getPublicDogThumbs` (`modules/public/queries.ts`).
 */

/** Card do sujeito + o padding esquerdo do scroller (`px-3` = 12px). Sem
 * isto, o `scroll-snap` esconde a coluna assentada atrás do card fixo. */
const SCROLL_PADDING = GENERATIONS[0]!.card + 12;

export function PedigreeTree({
  pedigree,
  thumbs,
  subjectPhotoUrl,
  variant = "full",
}: {
  pedigree: Pedigree | null;
  /** `dog_id` → URL da miniatura, geração 1 a 3. Ver `thumbnailTargets`. */
  thumbs?: ReadonlyMap<string, string>;
  /** Foto do PRÓPRIO cão — a página já busca por outra consulta; nunca
   * refazer aqui a mesma ida ao Storage. */
  subjectPhotoUrl?: string;
  /**
   * `full` (padrão): perfil público do cão — com scroller, cabeçalho e foto.
   * `preview`: card de exemplo da home (`example-profile-card.tsx`), cujo
   * card INTEIRO já é um `<Link>`. Sem scroller/sticky/cabeçalho e — crucial —
   * NUNCA emite `<Link>` próprio, senão seria `<a>` dentro de `<a>`.
   * `litter`: página pública da ninhada. Igual a `full`, MENOS a coluna do
   * sujeito: a ninhada não tem "este cão", a árvore começa nos progenitores.
   * Quem chama passa a árvore de um filhote qualquer — ele é só a âncora da
   * RPC (a numeração Ahnentafel precisa de uma raiz) e nunca é renderizado.
   */
  variant?: Variant;
}) {
  if (!pedigree?.subject) return null;

  const specs =
    variant === "preview"
      ? PREVIEW_GENERATIONS
      : variant === "litter"
        ? LITTER_GENERATIONS
        : GENERATIONS;

  /**
   * Onde esta árvore transborda — ver `treeOverflow` em `layout.ts`.
   *
   * Duas respostas, uma por breakpoint, porque a partir de `xl` o container é
   * quase o dobro e a árvore de 5 gerações passa a caber INTEIRA. A decisão
   * vira classe de CSS (`xl:hidden`), nunca medição no navegador: a
   * profundidade é conhecida no servidor e a página precisa continuar estática.
   */
  /** A ninhada começa a desenhar na geração 1 — ver `LITTER_GENERATIONS`. */
  const primeiraGeracao = variant === "litter" ? 1 : 0;

  const overflow =
    variant !== "preview"
      ? treeOverflow(pedigree.depth, specs, primeiraGeracao)
      : { base: false, xl: false };

  /** Rola no base mas cabe no desktop: a affordance existe, e some lá. */
  const soNoBase = overflow.base && !overflow.xl ? "xl:hidden" : "";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {variant === "litter" ? "Pedigree dos progenitores" : "Pedigree"}
        </h2>
        <p className="text-fg-faint text-xs">
          {pedigree.knownAncestors === 0
            ? "Nenhum ancestral cadastrado"
            : `${pedigree.knownAncestors} de ${pedigree.possibleAncestors} ancestrais · ${pedigree.depth} ${pedigree.depth === 1 ? "geração" : "gerações"}`}
        </p>
      </div>

      {pedigree.knownAncestors === 0 ? (
        <p className="border-border bg-surface rounded-card text-fg-faint border px-5 py-4 text-sm">
          Pai e mãe ainda não foram informados.
        </p>
      ) : (
        <>
          {/*
            MOBILE: lista por geração — ver `pedigree-generations.tsx` para o
            porquê. A `preview` fica de fora: são duas gerações dentro de um
            `<Link>`, onde `<details>` navegaria e expandiria no mesmo toque.
          */}
          {variant !== "preview" ? (
            <div className="sm:hidden">
              <PedigreeGenerations pedigree={pedigree} thumbs={thumbs} />
            </div>
          ) : null}

          {/*
            A partir de `sm`, a árvore em colunas. Os dois markups convivem e o
            CSS escolhe: o servidor não sabe a largura da tela, e ler
            `headers()` aqui tornaria a rota dinâmica e mataria o ISR — que é o
            que faz esta página abrir rápido a partir do QR impresso.
          */}
          <div className={variant !== "preview" ? "relative hidden sm:block" : "relative"}>
            <div
              role={variant !== "preview" ? "group" : undefined}
              tabIndex={variant !== "preview" ? 0 : undefined}
              aria-label={
                variant === "preview"
                  ? undefined
                  : variant === "litter"
                    ? // Nunca o nome do filhote-âncora: ele não está na tela, e
                      // anunciá-lo diria a quem usa leitor de tela algo que
                      // quem enxerga não vê.
                      "Árvore de pedigree dos progenitores da ninhada. Role na horizontal para ver as gerações."
                    : `Árvore de pedigree de ${pedigree.subject.name}. Role na horizontal para ver as gerações.`
              }
              style={
                variant !== "preview"
                  ? // Sem coluna de sujeito não há card fixo para o snap
                    // respeitar — o recuo de rolagem seria um buraco à esquerda.
                    { scrollPaddingLeft: variant === "litter" ? 0 : SCROLL_PADDING }
                  : undefined
              }
              className={
                variant !== "preview"
                  ? "border-border bg-surface rounded-card focus-visible:outline-ring snap-x snap-proximity overflow-x-auto overscroll-x-contain border px-3 py-3 focus-visible:-outline-offset-2 focus-visible:outline-2"
                  : "border-border bg-surface rounded-card overflow-hidden border p-2.5"
              }
            >
              <div className="flex w-max flex-col gap-3">
                {variant !== "preview" ? (
                  <HeaderRow
                    specs={specs}
                    depth={pedigree.depth}
                    from={primeiraGeracao}
                  />
                ) : null}
                <SubjectRow
                  pedigree={pedigree}
                  specs={specs}
                  thumbs={thumbs}
                  subjectPhotoUrl={subjectPhotoUrl}
                  variant={variant}
                />
              </div>
            </div>

            {overflow.base ? (
              <div
                aria-hidden="true"
                className={`from-surface rounded-r-card pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent ${soNoBase}`}
              />
            ) : null}
          </div>
        </>
      )}

      {pedigree.repeated.size > 0 ? (
        <p className="text-fg-faint text-xs">
          O selo <span className="text-data font-mono">×N</span> marca o ancestral que ocupa N
          posições desta árvore (linebreeding). Cada ocorrência aparece no seu próprio caminho.
        </p>
      ) : null}

      {variant !== "preview" && pedigree.depth >= 1 ? <ColorLegend /> : null}

      {/* `hidden sm:block`: no mobile não há árvore lateral para arrastar — a
          navegação lá é o acordeão por geração. E `xl:hidden` quando a árvore
          passa a caber no desktop: anunciar rolagem que não existe mais é pior
          do que não anunciar nada. */}
      {overflow.base ? (
        <p className={`text-fg-faint hidden text-xs sm:block ${soNoBase}`}>
          Arraste para o lado para ver as gerações →
        </p>
      ) : null}
    </section>
  );
}

/**
 * Faixa de rótulos de geração ("1ª GERAÇÃO · PAIS"…). Alinha com os cards por
 * construção — as duas leem a MESMA `specs[g].band` de `layout.ts` — e é ela
 * que hospeda os pontos de `scroll-snap`: a recursão não tem um elemento por
 * coluna onde pendurá-los, mas esta faixa tem, um por geração.
 *
 * NÃO `sticky top-0`: `overflow-x: auto` no container força `overflow-y` a
 * computar `auto` também, e o scrollport passa a ser esta caixa, que não rola
 * verticalmente — `sticky` vertical aqui teria curso zero.
 */
function HeaderRow({
  specs,
  depth,
  from = 0,
}: {
  specs: readonly GenerationSpec[];
  depth: number;
  /**
   * Primeira geração renderizada. `0` em toda árvore com sujeito; `1` na da
   * NINHADA, onde a coluna do sujeito não existe.
   *
   * Sem isto o cabeçalho ficaria deslocado da largura de um card inteiro: o
   * slot 0 continua no array de specs (ver `LITTER_GENERATIONS`) e reservaria
   * a faixa dele aqui, enquanto os cards abaixo já começam nos pais.
   */
  from?: number;
}) {
  return (
    <div className="flex shrink-0">
      {specs.slice(from, depth + 1).map((gen, i) => {
        const g = i + from;
        return (
          <div
            key={g}
            // O recuo do cotovelo existe em toda coluna que TEM uma coluna à
            // esquerda dentro desta faixa — por isso a conta é contra `from`,
            // não contra 0.
            style={{ width: gen.band, paddingLeft: g > from ? ELBOW : 0 }}
            className="shrink-0 snap-start"
          >
            <span className="text-fg-faint font-mono text-[0.625rem] tracking-[0.15em] uppercase">
              {gen.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** O sujeito e, à direita, as duas ramificações (pai/mãe). */
function SubjectRow({
  pedigree,
  specs,
  thumbs,
  subjectPhotoUrl,
  variant,
}: {
  pedigree: Pedigree;
  specs: readonly GenerationSpec[];
  thumbs?: ReadonlyMap<string, string>;
  subjectPhotoUrl?: string;
  variant: Variant;
}) {
  // A NINHADA NÃO TEM SUJEITO. A árvore dela começa nos progenitores: o cão
  // usado na consulta é um filhote qualquer, presente só porque a numeração
  // Ahnentafel da RPC precisa de uma raiz. Renderizá-lo obrigaria a página a
  // responder "por que ESTE filhote?", que é uma pergunta sem resposta boa.
  if (variant === "litter") {
    return (
      <div className="flex items-center">
        <Branches pos={1} pedigree={pedigree} specs={specs} thumbs={thumbs} variant={variant} />
      </div>
    );
  }

  const subject = pedigree.subject!;
  const card = (
    <AncestorCard
      node={subject}
      width={specFor(specs, 0).card}
      thumbUrl={subjectPhotoUrl}
      linkable={false}
    />
  );

  return (
    <div className="flex items-center">
      {variant !== "preview" ? (
        // `bg-surface` opaco: sem ele as colunas passariam por baixo ao
        // rolar. `shrink-0`: sem ele o flex comprime o card fixo. O `after:`
        // é o degradê de 12px que faz ler como "fixado", não como régua dura.
        <div className="bg-surface after:from-surface sticky left-0 z-10 shrink-0 after:pointer-events-none after:absolute after:inset-y-0 after:-right-3 after:w-3 after:bg-gradient-to-r after:to-transparent">
          {card}
        </div>
      ) : (
        card
      )}
      <Branches pos={1} pedigree={pedigree} specs={specs} thumbs={thumbs} variant={variant} />
    </div>
  );
}

/**
 * O grupo dos dois pais de `pos`, se ao menos um for conhecido — senão
 * `null`, e o nó de `pos` vira folha. Um `<ol>` vazio de placeholders em
 * cada nível seria ruído: 32 "Não informado" na 5ª geração não é dado.
 *
 * `grid grid-rows-2` e não `flex-col`: `flex-1`/`basis-0` NÃO iguala alturas
 * num container de altura automática (o `min-height:auto` do item trava no
 * conteúdo, não sobra espaço pro `grow` distribuir). `minmax(0,1fr)` iguala
 * de verdade — e é isso que garante que o MEIO do grupo seja sempre a
 * fronteira entre as duas linhas, mesmo com subárvores bem assimétricas (pai
 * com oito bisavós, mãe folha). É o que alinha as colunas de verdade.
 *
 * `self-stretch` É METADE DA RÉGUA VERTICAL, e a outra metade está no `div`
 * de `Subtree`. Sem ele o grupo ficava com a ALTURA NATURAL do conteúdo,
 * centralizado na faixa que recebeu — e então dividia ao meio a própria
 * altura pequena, não a faixa. Numa árvore assimétrica isso saía como escada
 * irregular: os avós paternos a 180px um do outro e os maternos a 90px,
 * cada card materno 45px fora da posição do seu nó (medido; ver
 * `e2e/03-cao-pedigree.spec.ts`). Preenchendo a faixa, a indução fecha —
 * faixa da raiz é a árvore, cada `<li>` é metade da faixa do pai, o nó
 * preenche o `<li>`, o grupo preenche o nó — e TODA faixa da geração g passa
 * a ser `altura/2^g`, em qualquer formato de árvore.
 */
function Branches({
  pos,
  pedigree,
  specs,
  thumbs,
  variant,
}: {
  pos: number;
  pedigree: Pedigree;
  specs: readonly GenerationSpec[];
  thumbs?: ReadonlyMap<string, string>;
  variant: Variant;
}) {
  const [sirePos, damPos] = parentPositions(pos);
  if (!pedigree.byPosition.has(sirePos) && !pedigree.byPosition.has(damPos)) return null;

  const elbow = variant === "preview" ? PREVIEW_ELBOW : ELBOW;

  return (
    <ol className="before:bg-border-strong relative grid grid-rows-2 gap-y-1 self-stretch before:absolute before:top-1/2 before:left-0 before:h-px before:w-2 before:content-['']">
      {/* PAI: posição par. Cada filho pinta a SUA metade do colchete — nenhum
          elemento tem duas cores. As duas metades se encontram no meio do
          grupo (o tronco neutro de 8px acima), que é o centro do card pai. */}
      <li className="relative flex items-center" style={{ paddingLeft: elbow }}>
        <span
          aria-hidden="true"
          className="border-accent pointer-events-none absolute top-1/2 -bottom-0.5 left-2 w-4 rounded-tl-md border-t border-l"
        />
        <Subtree
          pos={sirePos}
          pedigree={pedigree}
          specs={specs}
          thumbs={thumbs}
          variant={variant}
        />
      </li>
      {/* MÃE: posição ímpar. */}
      <li className="relative flex items-center" style={{ paddingLeft: elbow }}>
        <span
          aria-hidden="true"
          className="border-secondary pointer-events-none absolute -top-0.5 bottom-1/2 left-2 w-4 rounded-bl-md border-b border-l"
        />
        <Subtree pos={damPos} pedigree={pedigree} specs={specs} thumbs={thumbs} variant={variant} />
      </li>
    </ol>
  );
}

/**
 * Um nó (card + suas próprias ramificações) ou, sem ancestral cadastrado, a
 * lacuna.
 *
 * O nó PREENCHE a faixa que o `<li>` lhe deu (`self-stretch`) e centraliza o
 * card dentro dela (`items-center`) — ver o comentário de `Branches` para o
 * porquê. O card fica então no centro da faixa, que é exatamente a fronteira
 * entre as faixas dos dois pais: o colchete encontra no meio do card sozinho,
 * sem ninguém calcular posição.
 *
 * A LACUNA NÃO ESTICA, de propósito: `UnknownSlot` é devolvido direto, sem o
 * `div`, e o `items-center` do `<li>` a mantém centralizada no tamanho dela.
 * Uma caixa tracejada de "Não informado" com 350px de altura seria pior que o
 * problema que este arquivo resolve.
 */
function Subtree({
  pos,
  pedigree,
  specs,
  thumbs,
  variant,
}: {
  pos: number;
  pedigree: Pedigree;
  specs: readonly GenerationSpec[];
  thumbs?: ReadonlyMap<string, string>;
  variant: Variant;
}) {
  const node = pedigree.byPosition.get(pos);
  // A geração sai da POSIÇÃO, não do nó: dá o mesmo número (`buildPedigree`
  // recalcula `generation` a partir de `pos`, e é a posição que manda) e vale
  // também para a lacuna, que não tem nó de quem perguntar.
  const spec = specFor(specs, generationOf(pos));

  if (!node) return <UnknownSlot pos={pos} width={spec.card} compact={!spec.photo} />;

  const occurrences = pedigree.repeated.get(node.dog_id)?.length;
  const linkable = variant !== "preview";

  const card = spec.photo ? (
    <AncestorCard
      node={node}
      width={spec.card}
      thumbUrl={thumbs?.get(node.dog_id)}
      repeatCount={occurrences}
      linkable={linkable}
    />
  ) : (
    <CompactCard node={node} width={spec.card} repeatCount={occurrences} linkable={linkable} />
  );

  return (
    <div className="flex items-center self-stretch">
      {card}
      <Branches pos={pos} pedigree={pedigree} specs={specs} thumbs={thumbs} variant={variant} />
    </div>
  );
}

/**
 * A régua daquela geração. Geração além do array (não acontece hoje, mas o
 * tipo permite) cai na última — encolher mais que a 5ª não faria sentido.
 */
function specFor(specs: readonly GenerationSpec[], generation: number): GenerationSpec {
  return specs[generation] ?? specs.at(-1)!;
}

/**
 * Conveniência, não conformidade: quem não distingue azul de violeta já tem a
 * mesma informação no `RelationChip`/`title`/`sr-only` de cada card (WCAG
 * 1.4.1). Isto aqui é só o glossário de cores pra quem enxerga.
 */
function ColorLegend() {
  return (
    <div className="text-fg-faint flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="bg-accent inline-block h-0.5 w-4 rounded-full" />
        Linha paterna
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="bg-secondary inline-block h-0.5 w-4 rounded-full" />
        Linha materna
      </span>
    </div>
  );
}
