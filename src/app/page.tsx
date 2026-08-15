import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { ExampleProfileCard } from "@/modules/capture/components/example-profile-card";
import { ExampleQrCard } from "@/modules/capture/components/example-qr-card";
import { MeasurePixel } from "@/modules/capture/components/measure-pixel";
import { publicMetadata } from "@/modules/public/metadata";

/**
 * ============================================================================
 * Página de captura — o destino do QR Code impresso. (Anexo I.11)
 * ============================================================================
 *
 * ESTÁTICA, E ISSO É REQUISITO. É a primeira coisa que alguém vê depois de
 * escanear um QR numa feira, com 4G disputado por mil aparelhos no mesmo
 * pavilhão. Servida do CDN, chega em dezenas de milissegundos; renderizada no
 * servidor a cada acesso, pagaria ida e volta até a origem, com risco de partida
 * a frio.
 *
 * Por isso não há `searchParams`, `headers()` nem `cookies()` nesta página:
 * qualquer um dos três a tornaria dinâmica e jogaria fora o cache de borda.
 * A medição acontece por `<img>`, no fim do documento — ver `MeasurePixel`.
 *
 * PESO: nenhum ícone de biblioteca, nenhum componente de cliente. As exceções
 * deliberadas são a logo do cabeçalho (~38 KB, `priority` — é o LCP), o QR de
 * exemplo (SVG puro, poucos KB), o avatar do cão de exemplo em
 * `ExampleProfileCard` (~44 KB) e o mockup da árvore genealógica logo abaixo
 * da seção de exemplo (~190 KB, a maior imagem da página) — estas duas
 * últimas com `loading="lazy"`, por não serem o LCP. Pedido explícito do
 * cliente para MOSTRAR o produto, não só prometer em texto.
 *
 * O mockup amplia em tela cheia ao clicar, também sem JavaScript: âncora +
 * `:target` puro, não um componente de cliente com `useState`. Ver o
 * comentário junto do bloco.
 *
 * A CHAMADA PARA CADASTRO É O CONTEÚDO, não um enfeite no rodapé: quem chega
 * aqui veio de um papel impresso e tem trinta segundos de paciência.
 */

export const metadata: Metadata = publicMetadata({
  title: "OrigemX — registro de origem e pedigree de cães",
  description:
    "Perfil público do canil, pedigree de cinco gerações e um identificador permanente por animal — o mesmo que vai impresso no QR Code.",
  path: "/",
});

export default function CapturaPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-10 px-5 py-16 xl:max-w-6xl">
      <Image
        src="/brand/logo-header.png"
        alt="OrigemX"
        width={662}
        height={132}
        priority
        // `main` é flex-col sem `items-center`: sem `self-start`, o stretch
        // padrão do eixo cruzado ignora `w-auto` e esprema a logo até a
        // largura inteira do container.
        className="h-10 w-auto self-start"
      />

      {/*
        UMA COLUNA TAMBÉM NO DESKTOP, e isso foi decidido olhando a tela.

        Cheguei a montar o hero em duas colunas (texto à esquerda, exemplos à
        direita). Não fecha: a coluna dos exemplos empilha dois cartões e fica
        quase o dobro da altura do texto, deixando ~530px de vazio embaixo à
        esquerda. As saídas eram piores — lado a lado numa coluna de 552px cada
        cartão fica com 268px e a prévia do pedigree (284px de largura fixa)
        estoura; e encolher o mockup para caber ali torna ilegível justamente a
        imagem que o cliente pediu para MOSTRAR o produto.

        Então a largura extra vai para onde rende sem criar vão: os dois
        cartões de exemplo passam de 356px para ~548px cada, e o mockup de
        768px para ~1112px. O que precisa de teto é só o texto.
      */}
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-10">
          {/* `xl:max-w-4xl`: a manchete não tem largura máxima própria, e sem
              isto ela se esticaria pelos 1112px da faixa — exatamente a parede
              de texto que este trabalho existe para evitar. O parágrafo já
              tinha o seu `max-w-xl`. */}
          <div className="flex flex-col gap-5 xl:max-w-4xl">
            <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
              A inteligência por trás das linhagens de excelência
            </span>
            <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
              A história do seu cão não deveria terminar em um pedigree.
            </h1>
            <p className="text-fg-muted max-w-xl text-base">
              Origem, linhagem e história. Tudo em uma identidade digital que acompanha seu cão por
              toda a vida.
            </p>
          </div>

          {/* A chamada vem ANTES da prova visual: quem já se convenceu no papel
              impresso não precisa rolar para agir. */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/*
                Sem `?de=` fixo aqui, de propósito. Esta página é estática e serve o
                mesmo HTML para `/` e para `/?de=feira` — um parâmetro cravado no
                link apagaria a campanha e faria toda conversão cair na mesma origem,
                enquanto os acessos continuariam separados. O `/cadastro` recupera a
                origem pelo `Referer`, que traz a URL completa por ser mesma origem.
              */}
              <Link
                href="/cadastro"
                className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring px-6 py-3 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Criar meu perfil no OrigemX
              </Link>
              <Link
                href="/login"
                className="border-border-strong text-fg hover:bg-surface-hover rounded-control focus-visible:outline-ring border px-5 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Já tenho conta
              </Link>
            </div>
            <p className="text-fg-faint text-xs">Grátis para começar · leva menos de 1 minuto.</p>
          </div>
        </div>

        {/*
          Prova visual do que o texto promete. Antes disto a página só dizia "QR
          Code" e "endereço que não muda" sem mostrar nenhum dos dois — pedido
          direto do cliente. Os dois cards levam pro perfil de um cão REAL
          (Fire Moon New Creation & Power Chronos, ver
          src/modules/capture/example-dog.ts) — clicar não cai num link morto.
          É cão de cliente real (canil New Creation, com consentimento), não
          mais o exemplo neutro anterior — a etiqueta "Exemplo" é sobre o
          card ser demonstração, não sobre a origem do cão.
        */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-lg font-semibold tracking-tight">Veja como fica</h2>
            <p className="text-fg-muted text-sm">
              O QR que vai no crachá, e o perfil que ele abre — os dois são o produto de verdade, só
              o cão é de exemplo.
            </p>
          </div>
          {/* Duas colunas seguem valendo no desktop — com a faixa mais larga,
              cada cartão passa de 356px para ~548px. É a largura extra indo
              para o conteúdo em vez de virar margem. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <ExampleQrCard />
            <ExampleProfileCard />
          </div>
        </section>
      </div>

      {/*
        Ampliação por âncora + `:target`, sem uma linha de JavaScript — a
        página continua estática. Clicar leva para `#exemplo-ampliado`; o
        próprio elemento vira o alvo do CSS e aparece em tela cheia. Clicar em
        qualquer ponto da tela cheia (a `<a>` cobre tudo) volta para `#` e
        fecha. Sem Escape para fechar — é a única perda real do truque sem JS,
        aceitável numa imagem só.
      */}
      <a
        href="#exemplo-ampliado"
        className="group border-border hover:border-border-strong focus-visible:outline-ring rounded-card block border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label="Ampliar a árvore genealógica de exemplo"
      >
        <Image
          src="/brand/home-exemplo.jpg"
          alt="Árvore genealógica do OrigemX: fotos, gerações, campeões e análise genética num só perfil."
          width={1536}
          height={1024}
          // A primeira cláusula é a de antes, intocada — abaixo de 768px o
          // navegador escolhe exatamente o mesmo candidato do `srcset`. A
          // terceira só passa a valer no desktop, onde o container é
          // `max-w-6xl` e a imagem ocupa ~1112px em vez de 768.
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 768px, 1120px"
          loading="lazy"
          className="rounded-card w-full"
        />
      </a>

      <a
        href="#"
        id="exemplo-ampliado"
        aria-label="Fechar imagem ampliada"
        className="bg-bg/95 fixed inset-0 z-50 hidden items-center justify-center p-4 sm:p-8 [&:target]:flex"
      >
        <span className="bg-bg/70 text-fg hover:bg-bg/90 absolute top-3 right-3 flex size-10 items-center justify-center rounded-full transition-colors sm:top-6 sm:right-6">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element -- ampliação em tela cheia: dimensão vem do viewport, não faz sentido fixar width/height do next/image aqui. */}
        <img
          src="/brand/home-exemplo.jpg"
          alt="Árvore genealógica do OrigemX: fotos, gerações, campeões e análise genética num só perfil."
          className="border-border rounded-card max-h-full max-w-full border object-contain"
        />
      </a>

      {/*
        Rodapé mínimo — não é site institucional de várias colunas, é
        transparência exigida pela LGPD: o site coleta dado de canil/cão, então
        precisa dizer quem responde por isso e onde está a política. Pedido
        direto do cliente.
      */}
      <footer className="border-border flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p className="text-fg-faint">
          © {new Date().getFullYear()} OrigemX. Todos os direitos reservados.
        </p>
        <div className="text-fg-faint flex flex-wrap gap-x-4 gap-y-2">
          <a href="mailto:contato@origemxbr.com" className="hover:text-fg-muted transition-colors">
            contato@origemxbr.com
          </a>
          <a
            href="https://instagram.com/origemxbr"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-fg-muted transition-colors"
          >
            @origemxbr
          </a>
          <Link href="/privacidade" className="hover:text-fg-muted transition-colors">
            Política de privacidade
          </Link>
        </div>
      </footer>

      {/* Último elemento do documento, de propósito: não atrapalha nada acima. */}
      <MeasurePixel />
    </main>
  );
}
