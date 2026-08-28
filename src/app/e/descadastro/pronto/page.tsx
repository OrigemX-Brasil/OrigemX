import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Descadastro" };

/**
 * Confirmação do descadastro.
 *
 * PÚBLICA e sem sessão, como a rota que redireciona para cá: quem clica no
 * rodapé do e-mail costuma não estar logado, e exigir login aqui esvaziaria o
 * sentido do link.
 *
 * O texto não afirma que "encontramos sua inscrição" — a rota responde igual
 * para token válido e inválido de propósito (senão vira verificador de
 * tokens), então a página também não pode revelar qual foi o caso.
 */
export default function DescadastroProntoPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5 py-16">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Pedido registrado</h1>

      <p className="text-fg-muted text-sm leading-relaxed">
        Você não vai mais receber nossos e-mails sobre o seu cadastro. Avisos de segurança da conta
        — confirmação de e-mail e recuperação de senha — continuam chegando, porque são necessários
        para você entrar.
      </p>

      <p className="text-fg-muted text-sm leading-relaxed">
        Mudou de ideia? Dá para voltar a receber pelo painel, a qualquer momento.
      </p>

      <Link
        href="/painel"
        className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring mt-2 w-fit px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Ir para o painel
      </Link>
    </div>
  );
}
