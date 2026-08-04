import { assuntoDe, detalhesDe, type EventoInterno } from "./eventos";

/**
 * ============================================================================
 * O corpo do e-mail — puro, sem rede e sem depender de ambiente.
 * ============================================================================
 *
 * CORES LITERAIS AQUI, e é a única forma. Cliente de e-mail não enxerga as CSS
 * variables da aplicação, não carrega folha externa e, no caso do Outlook, nem
 * suporta `<style>` no cabeçalho de forma confiável — tudo precisa ser atributo
 * ou estilo inline. Os valores são os mesmos de `src/styles/tokens.css`,
 * convertidos de oklch para hexadecimal: mudou lá, muda aqui.
 *
 * Layout em TABELA, que é o que todo cliente de e-mail renderiza igual. Flex e
 * grid quebram no Outlook, que ainda usa o motor do Word.
 *
 * Sempre acompanhado de versão em TEXTO. Alguns clientes bloqueiam HTML por
 * padrão, e um e-mail interno que chega em branco não avisa nada.
 */

/** Espelham `--color-*` de tokens.css. */
const COR = {
  fundo: "#0B0F1A",
  superficie: "#151A28",
  borda: "#2A3142",
  texto: "#F7F8FA",
  textoFraco: "#A8B0C0",
  azul: "#0066FF",
  violeta: "#7B3DFF",
} as const;

/**
 * Escapa o que vai para o HTML.
 *
 * O nome vem do usuário. Sem isto, alguém se cadastrando como
 * `<img src=x onerror=...>` entregaria HTML arbitrário na caixa de entrada da
 * equipe — e cliente de e-mail é justamente onde ninguém espera código.
 */
export function escapar(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatarInstante(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(quando);
}

export type CorpoEmail = { assunto: string; html: string; texto: string };

export function montarEmail(evento: EventoInterno, quando: Date = new Date()): CorpoEmail {
  const assunto = assuntoDe(evento);
  const detalhes = detalhesDe(evento);
  const instante = formatarInstante(quando);

  const linhas = detalhes
    .map(
      ([rotulo, valor]) => `
        <tr>
          <td style="padding:8px 0;color:${COR.textoFraco};font-size:13px;vertical-align:top;white-space:nowrap;">
            ${escapar(rotulo)}
          </td>
          <td style="padding:8px 0 8px 20px;color:${COR.texto};font-size:14px;vertical-align:top;">
            ${escapar(valor)}
          </td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:${COR.fundo};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;">
    <tr>
      <td style="padding-bottom:20px;">
        <span style="font-size:18px;font-weight:600;color:${COR.texto};letter-spacing:-0.3px;">Origem</span><span style="font-size:18px;font-weight:700;color:${COR.violeta};letter-spacing:-0.3px;">X</span>
      </td>
    </tr>
    <tr>
      <td style="background:${COR.superficie};border:1px solid ${COR.borda};border-radius:12px;padding:24px;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${COR.textoFraco};">
          Notificação interna
        </p>
        <h1 style="margin:0 0 20px;font-size:17px;font-weight:600;color:${COR.texto};line-height:1.4;">
          ${escapar(assunto.replace(/^OrigemX · /, ""))}
        </h1>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${linhas}</table>
      </td>
    </tr>
    <tr>
      <td style="padding-top:16px;color:${COR.textoFraco};font-size:12px;line-height:1.6;">
        ${escapar(instante)} · aviso automático para a equipe.<br>
        Contém apenas nome e evento — nenhum dado de contato do usuário.
      </td>
    </tr>
  </table>
</body>
</html>`;

  const texto = [
    `OrigemX — notificação interna`,
    ``,
    assunto.replace(/^OrigemX · /, ""),
    ``,
    ...detalhes.map(([rotulo, valor]) => `${rotulo}: ${valor}`),
    ``,
    `${instante} · aviso automático para a equipe.`,
    `Contém apenas nome e evento — nenhum dado de contato do usuário.`,
  ].join("\n");

  return { assunto, html, texto };
}
