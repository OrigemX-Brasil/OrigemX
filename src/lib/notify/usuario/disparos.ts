import { siteUrl } from "@/modules/public/metadata";

import { enviarEmailAoUsuario, urlDeDescadastro } from "./guarda";
import { pecaBoasVindas, pecaCanilPublicado, pecaPrimeiroCao, pecaSeloFundador } from "./pecas";

/**
 * ============================================================================
 * Os disparos — o que cada ponto do produto chama.
 * ============================================================================
 *
 * Camada fina de propósito: monta a URL absoluta, pede a peça e entrega à
 * guarda. Toda a decisão (opt-out, teto, não repetir) mora em `guarda.ts`, e
 * todo o texto em `pecas.ts` — aqui não há regra nenhuma para divergir.
 *
 * NENHUMA DESTAS FUNÇÕES LEVANTA. Elas devolvem `void` e a guarda já engole
 * qualquer falha; o `try/catch` extra aqui cobre o que acontece ANTES dela
 * (montar URL, buscar o token de descadastro). Cadastrar um cão não pode
 * falhar porque o e-mail caiu.
 *
 * CHAMAR SEMPRE DENTRO DE `after()` do `next/server`, como `notificarEvento`:
 * a resposta vai para o usuário primeiro, e o Next mantém a execução viva
 * depois dela. Um `void` solto seria congelado junto com a função serverless.
 *
 * `siteUrl()` é a fonte canônica de host — a mesma que o QR e o canonical
 * usam. Nada aqui concatena `NEXT_PUBLIC_SITE_URL` à mão.
 */

/** URL absoluta a partir do host canônico. */
function abs(caminho: string): string {
  return new URL(caminho, siteUrl()).toString();
}

/** O rodapé de descadastro. `null` quando não há token — conta apagada. */
async function descadastro(profileId: string): Promise<string | null> {
  return urlDeDescadastro(profileId, siteUrl().toString());
}

/** 1 — depois de CONFIRMAR a conta. */
export async function dispararBoasVindas(
  profileId: string,
  primeiroNome: string | null,
): Promise<void> {
  try {
    const url = await descadastro(profileId);
    if (!url) return;

    await enviarEmailAoUsuario(
      profileId,
      pecaBoasVindas({
        primeiroNome,
        cadastrarCaoUrl: abs("/painel/comecar"),
        descadastroUrl: url,
      }),
    );
  } catch (erro) {
    console.error("[email:boas-vindas]", erro instanceof Error ? erro.message : erro);
  }
}

/** 2 — quando o PRIMEIRO cão é cadastrado. Quem chama confere que é o primeiro. */
export async function dispararPrimeiroCao(
  profileId: string,
  dog: { id: string; name: string; public_id: string },
): Promise<void> {
  try {
    const url = await descadastro(profileId);
    if (!url) return;

    await enviarEmailAoUsuario(
      profileId,
      pecaPrimeiroCao({
        nomeDoCao: dog.name,
        publicUrl: abs(`/d/${dog.public_id}`),
        qrUrl: abs(`/painel/caes/${dog.id}`),
        descadastroUrl: url,
      }),
    );
  } catch (erro) {
    console.error("[email:primeiro-cao]", erro instanceof Error ? erro.message : erro);
  }
}

/** 4 — quando o canil RECEBE o número do selo. */
export async function dispararSeloFundador(
  profileId: string,
  kennel: { name: string; slug: string; founder_number: number },
): Promise<void> {
  try {
    const url = await descadastro(profileId);
    if (!url) return;

    await enviarEmailAoUsuario(
      profileId,
      pecaSeloFundador({
        nomeDoCanil: kennel.name,
        numero: kennel.founder_number,
        publicUrl: abs(`/c/${kennel.slug}`),
        descadastroUrl: url,
      }),
    );
  } catch (erro) {
    console.error("[email:selo-fundador]", erro instanceof Error ? erro.message : erro);
  }
}

/** 5 — quando o canil é publicado. A guarda impede o reenvio em republicações. */
export async function dispararCanilPublicado(
  profileId: string,
  kennel: { id: string; name: string; slug: string },
): Promise<void> {
  try {
    const url = await descadastro(profileId);
    if (!url) return;

    await enviarEmailAoUsuario(
      profileId,
      pecaCanilPublicado({
        nomeDoCanil: kennel.name,
        publicUrl: abs(`/c/${kennel.slug}`),
        qrUrl: abs(`/painel/canis/${kennel.id}`),
        descadastroUrl: url,
      }),
    );
  } catch (erro) {
    console.error("[email:canil-publicado]", erro instanceof Error ? erro.message : erro);
  }
}
