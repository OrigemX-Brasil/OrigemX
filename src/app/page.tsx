import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PedigreeMark } from "@/modules/auth/components/pedigree-mark";
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
 * PESO: nenhum ícone de biblioteca, nenhum componente de cliente. A única
 * exceção deliberada é a logo do cabeçalho, ~38 KB — pedido explícito para
 * substituir o wordmark de texto aqui também. Fora dela, nenhuma foto: uma
 * foto de cão custaria mais que a página inteira.
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

const DESTAQUES = [
  {
    titulo: "Pedigree de cinco gerações",
    texto: "A linhagem inteira numa página, com cada ancestral no seu caminho.",
  },
  {
    titulo: "Endereço que não muda",
    texto: "O identificador do cão é permanente. Trocar o nome não quebra o QR já impresso.",
  },
  {
    titulo: "Perfil público do canil",
    texto: "Seus cães num endereço só, que você divulga no crachá, no folder e na placa.",
  },
];

export default function CapturaPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-10 px-5 py-16">
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

      <div className="flex flex-col gap-5">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
          Registro de origem
        </span>
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          A linhagem de cada cão em cinco gerações, num endereço que não muda.
        </h1>
        <p className="text-fg-muted max-w-xl text-base">
          Cadastre seu canil, registre a origem dos seus cães e entregue a quem compra um filhote a
          prova de procedência — num QR Code que continua funcionando depois de impresso.
        </p>
      </div>

      {/* A chamada vem ANTES da lista de destaques: quem já se convenceu no
          papel impresso não precisa ler mais nada para agir. */}
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
            Criar conta de criador
          </Link>
          <Link
            href="/login"
            className="border-border-strong text-fg hover:bg-surface-hover rounded-control focus-visible:outline-ring border px-5 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Já tenho conta
          </Link>
        </div>
        <p className="text-fg-faint text-xs">Leva menos de um minuto.</p>
      </div>

      <ul className="border-border divide-border grid gap-px overflow-hidden border-y sm:grid-cols-3 sm:border-x sm:rounded-card sm:border">
        {DESTAQUES.map((item) => (
          <li key={item.titulo} className="bg-surface flex flex-col gap-1.5 px-5 py-4">
            <h2 className="text-fg text-sm font-medium">{item.titulo}</h2>
            <p className="text-fg-muted text-sm">{item.texto}</p>
          </li>
        ))}
      </ul>

      <span className="text-border-strong" aria-hidden="true">
        <PedigreeMark generations={3} />
      </span>

      {/* Último elemento do documento, de propósito: não atrapalha nada acima. */}
      <MeasurePixel />
    </main>
  );
}
