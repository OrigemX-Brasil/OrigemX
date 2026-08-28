import { escapar } from "../template";

/**
 * ============================================================================
 * O layout dos e-mails AO USUÁRIO — puro, sem rede e sem ambiente.
 * ============================================================================
 *
 * AO LADO do layout interno (`src/lib/notify/template.ts`), não no lugar dele.
 * Aquele monta aviso para a EQUIPE: uma lista de pares rótulo/valor, sem CTA,
 * com rodapé dizendo "aviso automático para a equipe". Este monta peça para o
 * CRIADOR: um título, um parágrafo, UMA ação, e o rodapé de descadastro que a
 * LGPD exige. São formatos diferentes; forçar os dois na mesma função tornaria
 * o caminho compartilhado de todo envio interno mais frágil, sem ganho.
 *
 * `escapar()` vem importado de lá — é a mesma necessidade (nome de cão e de
 * canil são texto do usuário indo parar em HTML) e duplicá-la seria criar duas
 * proteções para divergirem.
 *
 * CORES LITERAIS, e é a única forma: cliente de e-mail não enxerga CSS
 * variables, não carrega folha externa e o Outlook nem processa `<style>` de
 * forma confiável. Os valores saem de `src/styles/tokens.css`, convertidos de
 * oklch para hex — mudou lá, muda aqui.
 *
 * DARK-MODE-SAFE pela raiz: o layout já é escuro e declara `color-scheme`,
 * então nenhum cliente precisa inverter nada. Inversão automática é justamente
 * o que quebra e-mail escuro mal declarado.
 *
 * TABELA, não flex nem grid: é o que todo cliente renderiza igual, incluindo o
 * Outlook, que ainda usa o motor do Word.
 */

/** Espelham `--color-*` de tokens.css, convertidos de oklch. */
const COR = {
  fundo: "#0B0F1A",
  superficie: "#151A28",
  borda: "#2A3142",
  texto: "#F7F8FA",
  textoFraco: "#A8B0C0",
  azul: "#0066FF",
  violeta: "#7B3DFF",
  /** `--color-selo`. SÓ para o e-mail do selo Fundador — ver o bloco do
   *  dourado em tokens.css: usado em qualquer outro lugar, o selo deixa de
   *  significar algo. */
  selo: "#FFB84E",
  seloFundo: "#3A2401",
} as const;

const FONTE = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

export type Cta = { rotulo: string; url: string };

export type Peca = {
  /** Linha pequena acima do título. Ex.: "Bem-vindo". */
  chapeu?: string;
  titulo: string;
  /** Um parágrafo. Se precisar de dois, é sinal de que a peça tem duas
   *  mensagens — e a regra do produto é uma ação por e-mail. */
  paragrafo: string;
  cta: Cta;
  /** Bloco opcional abaixo do CTA: link em texto, QR, número do selo. */
  extra?: string;
  /** Versão em texto puro do `extra`, quando houver. */
  extraTexto?: string;
  /** Pinta o destaque de dourado. Só o e-mail do selo usa. */
  destaque?: "selo";
  /** URL absoluta de descadastro. Ausente só nos e-mails de auth, que não
   *  passam por aqui. */
  descadastroUrl: string;
};

/** O bloco de número do selo, em dourado. Usado só pela peça do Fundador. */
export function blocoSelo(numero: number): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
      <tr>
        <td align="center" style="background:${COR.seloFundo};border:1px solid ${COR.selo};border-radius:12px;padding:20px;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${COR.selo};">
            Criador Fundador
          </p>
          <p style="margin:0;font-size:40px;font-weight:700;line-height:1;color:${COR.selo};">
            nº ${numero}
          </p>
        </td>
      </tr>
    </table>`;
}

/** Endereço público em destaque, para copiar. Usado pelas peças com link. */
export function blocoLink(url: string): string {
  return `
    <p style="margin:0 0 6px;font-size:12px;color:${COR.textoFraco};">Seu endereço público</p>
    <p style="margin:0 0 20px;font-size:14px;word-break:break-all;">
      <a href="${escapar(url)}" style="color:${COR.azul};text-decoration:none;">${escapar(url)}</a>
    </p>`;
}

export function montarPeca(peca: Peca): { html: string; texto: string } {
  const corDestaque = peca.destaque === "selo" ? COR.selo : COR.azul;
  const corTextoBotao = peca.destaque === "selo" ? "#1A1206" : "#FFFFFF";

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- O layout já é escuro; declarar isto impede o cliente de "ajudar" invertendo. -->
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapar(peca.titulo)}</title>
</head>
<body style="margin:0;padding:24px;background:${COR.fundo};font-family:${FONTE};">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;">
    <tr>
      <td style="padding-bottom:20px;">
        <span style="font-size:18px;font-weight:600;color:${COR.texto};letter-spacing:-0.3px;">Origem</span><span style="font-size:18px;font-weight:700;color:${COR.violeta};letter-spacing:-0.3px;">X</span>
      </td>
    </tr>
    <tr>
      <td style="background:${COR.superficie};border:1px solid ${COR.borda};border-radius:12px;padding:24px;">
        ${
          peca.chapeu
            ? `<p style="margin:0 0 6px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${COR.textoFraco};">${escapar(peca.chapeu)}</p>`
            : ""
        }
        <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:${COR.texto};line-height:1.35;">
          ${escapar(peca.titulo)}
        </h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${COR.textoFraco};">
          ${escapar(peca.paragrafo)}
        </p>

        ${peca.extra ?? ""}

        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:${corDestaque};border-radius:8px;">
              <a href="${escapar(peca.cta.url)}"
                 style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:${corTextoBotao};text-decoration:none;">
                ${escapar(peca.cta.rotulo)}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding-top:16px;color:${COR.textoFraco};font-size:12px;line-height:1.6;">
        Você recebe este e-mail porque tem uma conta no OrigemX.<br>
        <a href="${escapar(peca.descadastroUrl)}" style="color:${COR.textoFraco};text-decoration:underline;">
          Não quero mais receber estes e-mails
        </a>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const texto = [
    "OrigemX",
    "",
    peca.titulo,
    "",
    peca.paragrafo,
    ...(peca.extraTexto ? ["", peca.extraTexto] : []),
    "",
    `${peca.cta.rotulo}: ${peca.cta.url}`,
    "",
    "—",
    "Você recebe este e-mail porque tem uma conta no OrigemX.",
    `Para não receber mais: ${peca.descadastroUrl}`,
  ].join("\n");

  return { html, texto };
}
