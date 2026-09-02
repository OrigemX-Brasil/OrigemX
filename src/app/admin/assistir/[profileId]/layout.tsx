import { notFound } from "next/navigation";

import { assistingProfileId } from "@/lib/assist";

/**
 * Casca das telas do criador servidas sob `/admin`.
 *
 * Renderiza DENTRO de `/admin/layout.tsx`, então herda a navegação
 * administrativa e a faixa de "você está editando em nome de X". O que falta
 * é a coluna de leitura que `(app)/layout.tsx` dá às mesmas páginas — sem ela
 * os formulários esticariam na largura toda do painel administrativo.
 *
 * O PORTÃO REAL NÃO ESTÁ AQUI. Quem decide o que este admin enxerga e escreve
 * é a RLS, por `private.assisting_profile()`. A checagem abaixo é conveniência:
 * sem sessão aberta, estas rotas não têm o que mostrar, e um `notFound()` é
 * mais honesto que um formulário vazio que não salva.
 *
 * O `profileId` da URL não é confrontado com o alvo da sessão de propósito:
 * quem manda é a sessão, e divergir os dois só produziria um 404 confuso se o
 * admin trocasse de alvo com uma aba velha aberta. A faixa mostra o nome certo.
 */
export default async function AssistirLayout({ children }: { children: React.ReactNode }) {
  const assistindo = await assistingProfileId();
  if (!assistindo) notFound();

  return <div className="mx-auto w-full max-w-3xl xl:max-w-5xl">{children}</div>;
}
