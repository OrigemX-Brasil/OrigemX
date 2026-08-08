import type { AlertRule } from "./engine";

/**
 * ============================================================================
 * CATÁLOGO DE REGRAS DE ALERTA — o arquivo que o cliente ajusta.
 * ============================================================================
 *
 * Anexo I.8. Alertas baseados em REGRAS, in-app, sem IA.
 *
 * Para mudar o comportamento dos avisos, MEXA SÓ AQUI:
 *   - trocar texto  → edite `title` / `detail`;
 *   - mudar prioridade → reordene o array (a ordem da tela é a ordem daqui);
 *   - desligar um aviso → comente a regra;
 *   - afrouxar um limite → mexa em `LIMITES`, abaixo;
 *   - criar um aviso → some um objeto ao array.
 *
 * Nada disso encosta em `engine.ts`, que não conhece nenhuma regra, nem nos
 * componentes, que só desenham o que o motor devolveu.
 *
 * O QUE ESTE ARQUIVO NÃO RESOLVE SOZINHO: uma regra que dependa de um fato novo
 * precisa desse fato em `queries.ts`. Os tipos abaixo são o contrato — inventar
 * um campo que ninguém alimenta vira erro de compilação, não aviso mudo.
 *
 * DOIS LIMITES QUE NÃO SE NEGOCIAM AQUI:
 *
 * 1. ALERTA NÃO BLOQUEIA. Nenhum fluxo de gravação consulta este catálogo.
 *    Regra que precise IMPEDIR algo é validação, e o lugar dela é o banco.
 * 2. IN-APP APENAS. Não existe campo de canal, e não deve existir: e-mail,
 *    push, WhatsApp e SMS são FORA DE ESCOPO por contrato (ver CLAUDE.md).
 */

/** Números que o cliente costuma querer mexer, todos num lugar só. */
export const LIMITES = {
  /**
   * Quantos critérios do selo Criador Fundador ainda podem faltar para o aviso
   * valer a pena.
   *
   * Acima disso o canil está longe demais e o aviso vira ruído — quem tem cinco
   * pendências precisa dos avisos básicos, não de uma corrida por selo.
   */
  seloCriteriosFaltandoMax: 2,

  /** Abaixo deste percentual, o cadastro do canil é tratado como incipiente. */
  canilCompletudeMinima: 100,
} as const;

/**
 * Lista em português corrente: "Cidade", "Cidade e Estado", "Cidade, Estado e
 * Logo". Enumerar com vírgula até o fim ("Cidade, Estado, Logo") lê como saída
 * de máquina, e o aviso é para uma pessoa.
 */
export function listar(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

/** Campo pendente, identificado pela coluna — o rótulo pode mudar, ela não. */
export type CampoPendente = { name: string; label: string };

const rotulos = (campos: readonly CampoPendente[]) => listar(campos.map((c) => c.label));

// ============================================================================
// CONTA — o usuário, antes de ter qualquer coisa cadastrada.
// ============================================================================

export type AccountFacts = {
  /**
   * Booleano, e não contagem, de propósito: o criador tem no máximo UM canil
   * vivo (`kennels_owner_uk`). Uma contagem convida a regras `> 1` que não podem
   * mais acontecer, e permitiria escrever teste com entrada impossível.
   */
  hasKennel: boolean;
  dogCount: number;
};

export const ACCOUNT_RULES: readonly AlertRule<AccountFacts>[] = [
  {
    id: "conta-sem-canil",
    severity: "atencao",
    title: "Você ainda não cadastrou seu canil",
    detail:
      "O canil é o que dá endereço público ao seu trabalho. Sem ele, seus cães não aparecem no perfil de lugar nenhum e o QR Code não tem para onde apontar.",
    actionLabel: "Cadastrar canil",
    when: (f) => !f.hasKennel,
  },
];

// ============================================================================
// CANIL — uma avaliação por canil do usuário.
// ============================================================================

export type KennelFacts = {
  /** 0 a 100, calculado por `calculateCompleteness`. */
  completenessPercent: number;
  missingRequired: readonly CampoPendente[];
  missingRecommended: readonly CampoPendente[];
  hasLogo: boolean;
  isPublished: boolean;
  /**
   * Se o canil tem ao menos um cão. Booleano e não contagem de propósito: é o
   * que as regras precisam, e é o que dá para apurar com custo limitado sem um
   * COUNT por canil.
   */
  hasDogs: boolean;
  hasFounderBadge: boolean;
  /** Critérios do selo ainda não atendidos, por `founderEligibility`. */
  founderMissing: readonly string[];
};

/**
 * O logo tem regra própria, logo abaixo — então sai da lista genérica de
 * pendências, senão o criador lê duas vezes que falta a mesma coisa.
 *
 * O filtro vive AQUI, e não em `queries.ts`, de propósito: quem sabe que existe
 * uma regra dedicada ao logo é o catálogo. Os fatos não deveriam conhecer as
 * regras que se servem deles.
 */
const recomendadosForaLogo = (f: KennelFacts) =>
  f.missingRecommended.filter((campo) => campo.name !== "logo_url");

export const KENNEL_RULES: readonly AlertRule<KennelFacts>[] = [
  {
    id: "canil-sem-campo-obrigatorio",
    severity: "atencao",
    title: "Campo obrigatório em branco",
    detail: (f) =>
      `Falta preencher: ${rotulos(f.missingRequired)}. Sem isso o perfil público não se sustenta.`,
    actionLabel: "Completar cadastro",
    when: (f) => f.missingRequired.length > 0,
  },
  {
    id: "canil-sem-cao",
    severity: "atencao",
    title: "Canil sem nenhum cão",
    detail: "Um canil sem cães não tem o que mostrar a quem escaneia o QR Code no estande.",
    actionLabel: "Cadastrar cão",
    when: (f) => !f.hasDogs,
  },
  {
    id: "canil-completo-nao-publicado",
    severity: "atencao",
    title: "Canil pronto, mas fora do ar",
    detail:
      "O cadastro está completo e o perfil continua despublicado — quem abrir o endereço não encontra nada.",
    actionLabel: "Publicar canil",
    when: (f) => f.completenessPercent >= LIMITES.canilCompletudeMinima && !f.isPublished,
  },
  {
    id: "canil-sem-logo",
    severity: "info",
    title: "Canil sem logo",
    detail:
      "O logo é a primeira coisa que aparece no perfil e na prévia compartilhada em rede social.",
    actionLabel: "Enviar logo",
    when: (f) => !f.hasLogo,
  },
  {
    id: "canil-cadastro-incompleto",
    severity: "info",
    title: "Cadastro do canil incompleto",
    detail: (f) =>
      `${f.completenessPercent}% preenchido. Falta: ${rotulos(recomendadosForaLogo(f))}.`,
    actionLabel: "Completar cadastro",
    when: (f) => f.missingRequired.length === 0 && recomendadosForaLogo(f).length > 0,
  },
  {
    id: "canil-perto-do-selo",
    severity: "info",
    title: "Perto do selo Criador Fundador",
    detail: (f) =>
      `Falta: ${listar(f.founderMissing)}. O selo é atribuído automaticamente assim que o canil atende a todos os critérios, enquanto houver número disponível.`,
    actionLabel: "Ver critérios",
    when: (f) =>
      !f.hasFounderBadge &&
      f.founderMissing.length > 0 &&
      f.founderMissing.length <= LIMITES.seloCriteriosFaltandoMax,
  },
];

// ============================================================================
// CÃO — uma avaliação por cão do usuário.
//
// ANCESTRAL FANTASMA NÃO ENTRA AQUI. Ele é um registro mínimo, de propósito, só
// para compor pedigree de outro cão — cobrar foto e raça dele seria cobrar algo
// que não deveria existir. A exclusão acontece ao montar os sujeitos, em
// `queries.ts`, e não como condição repetida em cada regra: assim o cliente
// pode criar uma regra nova sem precisar lembrar dessa ressalva.
// ============================================================================

export type DogFacts = {
  hasPhoto: boolean;
  hasSire: boolean;
  hasDam: boolean;
  hasKennel: boolean;
  hasBreed: boolean;
  isPublished: boolean;
  /** Se o dono tem algum canil. Sem canil, cobrar vínculo não faz sentido. */
  userHasKennel: boolean;
};

export const DOG_RULES: readonly AlertRule<DogFacts>[] = [
  {
    id: "cao-sem-foto",
    severity: "info",
    title: "Cão sem foto",
    detail:
      "A foto é o primeiro item que quem escaneia o QR Code procura. Sem ela o registro parece rascunho.",
    actionLabel: "Enviar foto",
    when: (f) => !f.hasPhoto,
  },
  {
    id: "cao-sem-pedigree",
    severity: "info",
    title: "Cão sem pai e sem mãe",
    detail:
      "Sem ao menos um progenitor vinculado, a página não monta pedigree — que é o motivo de a maioria das pessoas abrir o registro.",
    actionLabel: "Vincular pai e mãe",
    when: (f) => !f.hasSire && !f.hasDam,
  },
  {
    id: "cao-sem-canil",
    severity: "info",
    title: "Cão fora de qualquer canil",
    detail: "Este cão não aparece na página de nenhum canil seu.",
    actionLabel: "Vincular a um canil",
    when: (f) => !f.hasKennel && f.userHasKennel,
  },
  {
    id: "cao-sem-raca",
    severity: "info",
    title: "Cão sem raça informada",
    detail: "A raça aparece no perfil público e é usada para localizar o registro.",
    actionLabel: "Completar cadastro",
    when: (f) => !f.hasBreed,
  },
];
