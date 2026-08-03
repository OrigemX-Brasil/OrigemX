import Link from "next/link";

import { SOURCE_PARAM } from "../events";

/**
 * Convite para o cadastro no rodapé das páginas públicas.
 *
 * FECHA O FUNIL DO QR. Quem escaneia o código de um cão numa feira cai no perfil
 * dele, não na página de captura — e antes disto não havia nenhum caminho dali
 * para virar usuário. O visitante via o cão e acabava.
 *
 * Leva para a PÁGINA DE CAPTURA e não direto para o cadastro: quem chegou por um
 * QR de terceiro ainda não sabe o que é o OrigemX, e mandar essa pessoa para um
 * formulário é queimar a única chance. A captura explica e converte.
 *
 * O `?de=` carimba a origem, então acesso e cadastro vindos daqui aparecem na
 * mesma linha do relatório — dá para medir quanto o QR impresso realmente rende.
 *
 * Discreto de propósito: a página é o perfil do cão, não um anúncio. E é texto
 * com um link, sem imagem e sem JavaScript, para não pesar a página que abre em
 * 4G congestionado.
 */
export function SignupInvite({ source }: { source: string }) {
  return (
    <footer className="border-border mt-4 border-t pt-6">
      <div className="flex flex-col gap-2">
        <p className="text-fg-muted text-sm">
          É criador? Publique o pedigree dos seus cães num endereço permanente, com QR Code para
          imprimir.
        </p>
        <Link
          href={`/?${SOURCE_PARAM}=${source}`}
          className="text-link hover:text-link-hover rounded-control focus-visible:outline-ring self-start text-sm font-medium underline underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Conhecer o OrigemX
        </Link>
      </div>
    </footer>
  );
}
