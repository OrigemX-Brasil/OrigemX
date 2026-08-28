import { blocoLink, blocoSelo, montarPeca } from "./layout";
import type { EmailKind } from "./decisao";

/**
 * ============================================================================
 * As quatro peças. Puras: recebem dados, devolvem assunto + html + texto.
 * ============================================================================
 *
 * UMA AÇÃO POR E-MAIL, sempre. Nenhuma peça lista funcionalidades nem oferece
 * dois caminhos — o e-mail existe para produzir UM passo do funil, e um segundo
 * botão só divide a atenção. É por isso que `Peca` aceita um `cta`, não uma
 * lista deles.
 *
 * NENHUM DADO SENSÍVEL. As peças recebem nome de cão, nome de canil, número do
 * selo e URL pública — tudo que já é público na página do animal. Não entra
 * e-mail de terceiro, telefone, microchip nem identificador interno.
 *
 * As URLs chegam prontas de quem chama (`disparos.ts`), montadas com
 * `siteUrl()` — a mesma fonte canônica do QR e do canonical. Nada aqui
 * concatena host à mão.
 */

export type PecaPronta = { kind: EmailKind; assunto: string; html: string; texto: string };

/**
 * 1 — BOAS-VINDAS, depois de CONFIRMAR a conta (não no cadastro).
 *
 * Confirmar é o primeiro momento em que a conta existe de verdade e a pessoa
 * está com a atenção no produto. Mandar no cadastro competiria com o próprio
 * e-mail de confirmação, que é o que ela precisa abrir naquele instante.
 */
export function pecaBoasVindas(params: {
  primeiroNome: string | null;
  cadastrarCaoUrl: string;
  descadastroUrl: string;
}): PecaPronta {
  const { html, texto } = montarPeca({
    chapeu: "Bem-vindo",
    titulo: params.primeiroNome
      ? `${params.primeiroNome}, sua conta está pronta`
      : "Sua conta está pronta",
    paragrafo:
      "Cada cão seu ganha uma página própria, com pedigree de cinco gerações e QR Code para " +
      "imprimir e levar à feira. Comece pelo primeiro.",
    cta: { rotulo: "Cadastrar meu primeiro cão", url: params.cadastrarCaoUrl },
    descadastroUrl: params.descadastroUrl,
  });

  return { kind: "boas-vindas", assunto: "Sua conta no OrigemX está pronta", html, texto };
}

/**
 * 2 — PRIMEIRO CÃO CADASTRADO. Só o primeiro.
 *
 * O objetivo é fazer o criador VER o que acabou de ganhar e mandar para
 * alguém — por isso o link público em destaque e o CTA de compartilhar, não de
 * "editar cadastro".
 */
export function pecaPrimeiroCao(params: {
  nomeDoCao: string;
  publicUrl: string;
  qrUrl: string;
  descadastroUrl: string;
}): PecaPronta {
  const { html, texto } = montarPeca({
    chapeu: "Primeiro cão",
    titulo: `${params.nomeDoCao} já tem página própria`,
    paragrafo:
      "Em vez de responder as mesmas perguntas a cada interessado, envie o link: pedigree, " +
      "fotos e saúde já estão lá. O QR Code aponta para o mesmo endereço e serve para imprimir.",
    cta: { rotulo: "Ver e compartilhar", url: params.publicUrl },
    extra: blocoLink(params.publicUrl),
    extraTexto: `Endereço público: ${params.publicUrl}\nQR Code: ${params.qrUrl}`,
    descadastroUrl: params.descadastroUrl,
  });

  return {
    kind: "primeiro-cao",
    assunto: `${params.nomeDoCao} já tem página própria no OrigemX`,
    html,
    texto,
  };
}

/**
 * 4 — SELO CRIADOR FUNDADOR. É conquista, e o tom acompanha.
 *
 * Único e-mail que usa `--color-selo`. O número em destaque é o ponto da peça:
 * ele é permanente e intransferível, e é o que a pessoa vai querer mostrar.
 */
export function pecaSeloFundador(params: {
  nomeDoCanil: string;
  numero: number;
  publicUrl: string;
  descadastroUrl: string;
}): PecaPronta {
  const { html, texto } = montarPeca({
    chapeu: "Conquista",
    titulo: `${params.nomeDoCanil} é Criador Fundador`,
    paragrafo:
      "O selo vai para os primeiros canis que completam o cadastro. Ele é permanente e " +
      "intransferível, e aparece no seu perfil público para quem visitar.",
    cta: { rotulo: "Ver meu perfil", url: params.publicUrl },
    extra: blocoSelo(params.numero) + blocoLink(params.publicUrl),
    extraTexto: `Criador Fundador nº ${params.numero}\nEndereço público: ${params.publicUrl}`,
    destaque: "selo",
    descadastroUrl: params.descadastroUrl,
  });

  return {
    kind: "selo-fundador",
    assunto: `Você é Criador Fundador nº ${params.numero}`,
    html,
    texto,
  };
}

/** 5 — CANIL PUBLICADO PELA PRIMEIRA VEZ. Confirma que está no ar. */
export function pecaCanilPublicado(params: {
  nomeDoCanil: string;
  publicUrl: string;
  qrUrl: string;
  descadastroUrl: string;
}): PecaPronta {
  const { html, texto } = montarPeca({
    chapeu: "No ar",
    titulo: `${params.nomeDoCanil} está publicado`,
    paragrafo:
      "Qualquer pessoa já consegue abrir o endereço abaixo e ver seus cães. O QR Code aponta " +
      "para o mesmo lugar e continua valendo mesmo se você editar o cadastro depois.",
    cta: { rotulo: "Ver meu canil", url: params.publicUrl },
    extra: blocoLink(params.publicUrl),
    extraTexto: `Endereço público: ${params.publicUrl}\nQR Code: ${params.qrUrl}`,
    descadastroUrl: params.descadastroUrl,
  });

  return {
    kind: "canil-publicado",
    assunto: `${params.nomeDoCanil} está no ar`,
    html,
    texto,
  };
}
