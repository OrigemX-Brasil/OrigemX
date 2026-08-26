import { slugify } from "@/modules/kennels/validation";

/**
 * ============================================================================
 * Endereço do canil derivado do nome — a parte pura.
 * ============================================================================
 *
 * O primeiro acesso pede o NOME do canil e nada mais. O endereço público sai
 * daqui, sem o criador ter de entender que existe um campo `slug`.
 *
 * ISTO GRAVA UMA DECISÃO PERMANENTE, e é por isso que a lógica mora num arquivo
 * próprio e testado: `kennels_slug_key` é índice único GLOBAL e NÃO parcial por
 * `deleted_at` — excluir o canil libera a vaga de posse, mas o endereço fica
 * queimado para sempre (ver o comentário da migration `canil_unico_por_dono` e
 * a invariante no CLAUDE.md). Um slug gerado errado não é um bug que se conserta
 * com UPDATE: o valor antigo continua ocupado.
 *
 * Por isso a tela MOSTRA o endereço que vai sair ("Seu endereço será…") antes de
 * gravar. Derivar em silêncio seria queimar um identificador global sem a pessoa
 * ver.
 *
 * Função pura: recebe nome, devolve candidatos em ordem de preferência. Não
 * fala com banco — quem escolhe o primeiro livre é a action, que é também quem
 * lida com a corrida (ver `actions.ts`).
 */

/** Espelha `kennels_slug_length`. Fora desta faixa o banco recusa. */
const MIN = 3;
const MAX = 60;

/**
 * Prefixo de resgate para nome curto demais.
 *
 * "Ki" vira `ki`, com dois caracteres, e o CHECK recusaria. Prefixar é melhor
 * que preencher com número (`ki-1` não diz nada) e melhor que recusar o nome —
 * canil chamado "Ki" é nome legítimo, e o criador não deveria ter de renomear o
 * canil dele para caber numa regra de URL.
 */
const PREFIXO = "canil";

/** Quando o nome não sobrevive à normalização (só símbolos, só emoji). */
const BASE_GENERICA = "canil";

/** Quantas variantes numeradas oferecer depois da base. */
const VARIANTES = 12;

/**
 * Corta no teto SEM deixar hífen solto na ponta.
 *
 * `slice` cru produziria `canil-do-vale-` num nome que estoure exatamente no
 * hífen, e `kennels_slug_format` recusa hífen final.
 */
function cortar(valor: string, limite: number): string {
  return valor.slice(0, limite).replace(/-+$/g, "");
}

/** A base, já dentro das regras do banco — sem numeração ainda. */
export function baseDeSlug(nome: string): string {
  const bruto = slugify(nome);

  if (bruto.length === 0) return BASE_GENERICA;
  if (bruto.length < MIN) return `${PREFIXO}-${bruto}`;

  return cortar(bruto, MAX);
}

/**
 * Candidatos em ordem de preferência: a base, depois `-2`, `-3`…
 *
 * A numeração começa em 2 porque o primeiro é a base sem sufixo — `canil-aurora`
 * e `canil-aurora-2` leem como "o primeiro" e "o segundo", que é o que de fato
 * são. Um `-1` sugeriria que existe um zero.
 *
 * O sufixo entra DENTRO do teto de 60, nunca por cima: a base é encurtada o
 * suficiente para o número caber. Sem isso, um nome de 60 caracteres produziria
 * candidatos de 62 que o banco recusaria um a um.
 */
export function candidatosDeSlug(nome: string): string[] {
  const base = baseDeSlug(nome);
  const candidatos = [base];

  for (let n = 2; n <= VARIANTES + 1; n += 1) {
    const sufixo = `-${n}`;
    candidatos.push(`${cortar(base, MAX - sufixo.length)}${sufixo}`);
  }

  return candidatos;
}
