import Link from "next/link";

/**
 * ============================================================================
 * Boas-vindas do primeiro acesso.
 * ============================================================================
 *
 * Server Component: são dois links e um parágrafo. Nada aqui precisa de
 * JavaScript no cliente.
 *
 * O QUE ELA SUBSTITUI: antes, quem criava conta caía no painel e descobria o
 * próximo passo pelo alerta `conta-sem-canil` — um cartão entre outros, na
 * lista de Pendências, do lado de avisos sobre logo e foto. Funcionava como
 * informação e falhava como direção: tudo tinha o mesmo peso.
 *
 * O QUE ELA PRESERVA: a decisão registrada em `painel/canis/page.tsx` de NÃO
 * despejar o criador dentro de um formulário sem contexto. Ele continua lendo
 * uma frase sobre o que ganha antes de qualquer campo aparecer — só que agora
 * a frase é o assunto da tela, não um aviso lateral.
 *
 * DESAPARECE SOZINHA. Não há "marcar como visto" nem coluna de onboarding: a
 * condição é `countMyDogs === 0`, então cadastrar o primeiro cão apaga esta
 * tela para sempre, pelo próprio dado. Mesmo princípio dos alertas — derivado,
 * nunca armazenado.
 */

/** `/painel?explorar=1` mostra o painel normal sem cadastrar nada. */
export const EXPLORAR_PARAM = "explorar";

export function WelcomePanel({
  href,
  nome,
  email,
}: {
  href: string;
  nome?: string | null;
  /** Anexo I.2 — ver `IdentificacaoDaConta`, no fim do arquivo. */
  email?: string | null;
}) {
  const primeiroNome = nome?.trim().split(/\s+/)[0];

  return (
    <section className="flex flex-col items-start gap-6 py-4 sm:py-8">
      <div className="flex flex-col gap-3">
        <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">
          Bem-vindo
        </span>

        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {primeiroNome ? `Vamos começar, ${primeiroNome}` : "Vamos começar"}
        </h1>

        {/* A frase única: o que o produto faz POR ELE, em coisas que ele
            reconhece — página, pedigree, QR na feira. Não fala em "cadastro",
            "plataforma" nem "gestão". */}
        <p className="text-fg-muted max-w-prose text-base leading-relaxed">
          Cada cão seu ganha uma página própria, com pedigree de cinco gerações e QR Code para
          imprimir e levar à feira.
        </p>
      </div>

      <div className="flex flex-col items-start gap-4">
        <Link
          href={href}
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cadastrar meu primeiro cão
        </Link>

        {/* Secundária e DISCRETA: link de texto, não botão. Quem chegou para
            olhar antes de cadastrar tem saída — sem competir com a ação
            principal por atenção. */}
        <Link
          href={`/painel?${EXPLORAR_PARAM}=1`}
          className="text-fg-muted hover:text-fg focus-visible:outline-ring rounded-control text-sm underline underline-offset-4 transition-colors focus-visible:outline-2"
        >
          Explorar o painel
        </Link>
      </div>

      <IdentificacaoDaConta email={email} />
    </section>
  );
}

/**
 * Quem está logado — NÃO é enfeite, é requisito do Anexo I.2: "o painel
 * identifica quem está logado".
 *
 * Esta linha existe porque a suíte a cobrou. Ao trocar o painel pelas
 * boas-vindas, o `<dl>` com e-mail, identificador e papel deixou de ser
 * renderizado — e três cenários de `01-auth`/`09-admin` falharam, todos
 * conferindo o e-mail na tela depois de entrar. A tentação era dar um cão aos
 * usuários de teste para eles voltarem a ver o painel; seria estreitar um
 * requisito de contrato para acomodar a tela nova, e justamente para o usuário
 * que mais precisa saber em que conta entrou — o que acabou de se cadastrar.
 *
 * Só o E-MAIL, e não o `<dl>` inteiro: identificador e papel são dado de
 * registro que não ajuda quem ainda não cadastrou nada, e a tela de
 * boas-vindas vive de ter uma decisão só. O painel completo continua a um
 * clique, em "Explorar o painel".
 */
function IdentificacaoDaConta({ email }: { email?: string | null }) {
  if (!email) return null;

  return (
    <p className="text-fg-faint border-border mt-2 border-t pt-6 text-xs">
      Conectado como <span className="text-fg-muted font-mono break-all">{email}</span>
    </p>
  );
}
