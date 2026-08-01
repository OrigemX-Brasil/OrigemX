import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";

import "./globals.css";

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
  weight: ["400", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OrigemX",
    template: "%s · OrigemX",
  },
  description: "Perfis de canis, pedigree e identidade canina.",
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
