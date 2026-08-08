import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";

import "./globals.css";

import { DEFAULT_OG_IMAGE, siteUrl } from "@/modules/public/metadata";

/**
 * Sora para display, Inter para corpo.
 *
 * O manual do cliente indica EXA nos títulos, que não existe no Google Fonts.
 * Enquanto o arquivo não chegar, Sora é o substituto — geométrica e com o mesmo
 * aperto do lettering do logo. Quando o cliente fornecer EXA, a troca acontece
 * aqui e em `--font-display` no tokens.css; nenhum componente muda.
 *
 * `display: "swap"` porque bloquear a pintura do texto esperando webfont é pior
 * do que um reflow: em conexão ruim, a tela fica em branco.
 */
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
  /**
   * Só os pesos que existem na tela: `font-display` aparece 25 vezes com
   * `font-semibold` e uma com `font-bold`, nunca sem peso. O regular (400)
   * estava declarado e não era usado em lugar nenhum.
   *
   * MEDIDO, e o resultado contraria a intuição: tirar o 400 economizou 120
   * bytes, não um terço do arquivo. O Google serve Sora como fonte VARIÁVEL —
   * um arquivo só cobre a faixa inteira de pesos, então declarar menos pesos
   * não encolhe o download. A lista continua aqui por ser documentação correta
   * do que a interface usa, não por economia.
   *
   * Ao acrescentar um `font-display` com peso novo, inclua o peso aqui: se o
   * Next passar a servir instâncias estáticas, o navegador sintetizaria o traço
   * e a tipografia sairia deformada.
   */
  weight: ["600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "OrigemX",
    template: "%s · OrigemX",
  },
  description: "Perfis de canis, pedigree e identidade canina.",
  // Fallback para páginas sem `publicMetadata()` próprio (login, cadastro,
  // /painel/*) — o merge de metadata do Next é raso, então uma página que
  // declara seu próprio `openGraph` (toda página pública) substitui este por
  // inteiro em vez de mesclar; ver DEFAULT_OG_IMAGE em modules/public/metadata.
  openGraph: {
    type: "website",
    siteName: "OrigemX",
    locale: "pt_BR",
    images: [{ ...DEFAULT_OG_IMAGE, alt: "OrigemX" }],
  },
  twitter: {
    card: "summary_large_image",
    images: [DEFAULT_OG_IMAGE.url],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
