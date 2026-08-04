/**
 * ============================================================================
 * Catálogo dos eventos que a equipe recebe por e-mail — puro.
 * ============================================================================
 *
 * NOTIFICAÇÃO INTERNA, não transacional. O e-mail que o USUÁRIO recebe
 * (confirmação de cadastro, recuperação de senha) sai do Supabase pelo SMTP do
 * Resend e não passa por aqui. Isto vai para a equipe, pela API do Resend, e o
 * destinatário é sempre o mesmo endereço.
 *
 * O TIPO É A GARANTIA DE MINIMIZAÇÃO. Cada evento declara exatamente os campos
 * que podem sair, e nada além disso atravessa: quem chamar com um objeto de
 * usuário inteiro não consegue vazar telefone ou documento, porque o tipo não
 * tem onde encaixá-los. A regra vira erro de compilação em vez de disciplina de
 * quem escreve a chamada.
 */

/** O que a equipe é avisada. Cão fica de fora: na feira seriam centenas. */
export type EventoInterno =
  | {
      tipo: "conta-criada";
      /** Como a pessoa se apresentou. Vazio é comum e legítimo. */
      nome: string | null;
      /** Por onde entrou. Ajuda a ler o efeito de campanha impressa. */
      origem: "email" | "google";
      /** uuid opaco, para achar o registro no painel. Não identifica fora daqui. */
      id: string;
    }
  | {
      tipo: "canil-criado";
      nome: string;
      /** Endereço público — já é público por definição. */
      slug: string;
      cidade: string | null;
      estado: string | null;
      id: string;
    }
  | {
      /**
       * O corta-circuito falou.
       *
       * Não é um evento do produto: é o aviso de que o volume passou do teto e
       * os individuais foram suspensos. Sem ele, a equipe interpretaria o
       * silêncio como "nada aconteceu" justamente na hora de maior movimento.
       */
      tipo: "volume-alto";
      evento: "conta-criada" | "canil-criado";
      quantidade: number;
      janelaMinutos: number;
    };

export type TipoEvento = EventoInterno["tipo"];

/** Assunto do e-mail. Curto, e diz o que aconteceu antes de abrir. */
export function assuntoDe(evento: EventoInterno): string {
  switch (evento.tipo) {
    case "conta-criada":
      return `OrigemX · nova conta${evento.nome ? `: ${evento.nome}` : ""}`;
    case "canil-criado":
      return `OrigemX · novo canil: ${evento.nome}`;
    case "volume-alto":
      return `OrigemX · volume alto (${evento.quantidade} em ${evento.janelaMinutos} min)`;
  }
}

/**
 * Os pares rótulo/valor que aparecem no corpo.
 *
 * Ponto único onde se decide o que sai. Um campo novo só chega ao e-mail se for
 * acrescentado aqui — e aí a decisão é visível na revisão, em vez de escondida
 * dentro de uma interpolação de template.
 */
export function detalhesDe(evento: EventoInterno): Array<[string, string]> {
  switch (evento.tipo) {
    case "conta-criada":
      return [
        ["Criador", evento.nome?.trim() || "(nome não informado)"],
        ["Entrou por", evento.origem === "google" ? "Google" : "e-mail e senha"],
        ["Identificador", evento.id],
      ];

    case "canil-criado": {
      const local = [evento.cidade, evento.estado].filter(Boolean).join(" · ");
      return [
        ["Canil", evento.nome],
        ["Endereço público", `/c/${evento.slug}`],
        ...(local ? ([["Local", local]] as Array<[string, string]>) : []),
        ["Identificador", evento.id],
      ];
    }

    case "volume-alto":
      return [
        ["Evento", evento.evento === "conta-criada" ? "novas contas" : "novos canis"],
        ["Quantidade", `${evento.quantidade} nos últimos ${evento.janelaMinutos} minutos`],
        [
          "O que fizemos",
          "Suspendemos os avisos individuais para não estourar a cota de envio. " +
            "Os cadastros continuam normais — só o e-mail parou.",
        ],
      ];
  }
}
