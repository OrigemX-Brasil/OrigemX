/**
 * Formatação de exibição do painel administrativo — pura, sem banco.
 */

/** Mesmo formato de `src/lib/notify/template.ts::formatarInstante`. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

/**
 * Tradução da ação do `audit_log`, mesmo espírito do mapa `SEX_LABEL` que já
 * existe em `/painel/caes`. Lista FECHADA, casada com o CHECK
 * `audit_log_action_valid` do banco — ação nova entra nos dois lugares
 * juntos, e o fallback abaixo evita quebrar a tela se algum dia divergir.
 */
export const ACTION_LABEL: Record<string, string> = {
  "profile.suspend": "Suspendeu usuário",
  "profile.unsuspend": "Reativou usuário",
  "kennel.hide": "Ocultou canil",
  "kennel.unhide": "Reativou canil",
  "dog.hide": "Ocultou cão",
  "dog.unhide": "Reativou cão",
  "kennel.founder_number.set": "Corrigiu número do selo",
  "dog.create_for_user": "Cadastrou cão para o usuário",
  "litter.create_for_user": "Cadastrou ninhada para o usuário",
  "kennel.create_for_user": "Cadastrou canil para o usuário",
  "media.create_for_user": "Enviou imagem para o usuário",
  "dog.publish": "Publicou cão",
  "dog.unpublish": "Tirou cão do ar",
  "kennel.publish": "Publicou canil",
  "kennel.unpublish": "Tirou canil do ar",
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

/**
 * "de → para" quando o `details` tiver as duas chaves — as ações que MUDAM um
 * valor gravam exatamente `{de, para}` (ver `private.audit()` nas migrations),
 * então generalizar aqui é seguro em vez de um formatador por ação.
 *
 * As ações de CRIAÇÃO (`*.create_for_user`) não cabem nesse formato: não havia
 * "antes". Elas caem no segundo ramo.
 */
export function detailsSummary(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;

  if ("de" in d && "para" in d) {
    const format = (v: unknown) => (v === null || v === undefined ? "—" : String(v));
    return `${format(d.de)} → ${format(d.para)}`;
  }

  return createdSummary(d);
}

/** O que cada `role` de mídia é, em português, no histórico. */
const MEDIA_ROLE_LABEL: Record<string, string> = {
  kennel_logo: "logo do canil",
  dog_gallery: "foto do cão",
};

/**
 * Resumo das ações de CRIAÇÃO (`*.create_for_user`).
 *
 * O selo Fundador é o item que justifica esta função existir: cadastrar o
 * primeiro cão de um canil elegível, ou enviar o LOGO que fecha a
 * elegibilidade, QUEIMA um número do pool de forma irreversível, como efeito
 * colateral de um trigger. As RPCs registram isso no `details` justamente para
 * a decisão não ficar invisível no histórico — se não aparecesse aqui,
 * continuaria invisível na tela.
 *
 * `kennel.create_for_user` mostra nome e ENDEREÇO, e o endereço não é enfeite:
 * `kennels_slug_key` é único global e não parcial por `deleted_at`, então
 * aquele endereço ficou queimado para sempre no momento daquela linha.
 *
 * `litter.create_for_user` grava só ids (canil, dono, progenitores), que não
 * dizem nada como texto: devolve null e a célula fica vazia, que já é o
 * comportamento para details desconhecido.
 */
function createdSummary(d: Record<string, unknown>): string | null {
  if (!("nome" in d) && !("founder_number_atribuido" in d) && !("role" in d)) return null;

  const partes: string[] = [];

  if (typeof d.nome === "string" && d.nome.length > 0) partes.push(d.nome);
  if (typeof d.role === "string" && MEDIA_ROLE_LABEL[d.role]) partes.push(MEDIA_ROLE_LABEL[d.role]);
  if (typeof d.slug === "string" && d.slug.length > 0) partes.push(`/c/${d.slug}`);
  if (d.litter_id) partes.push("filhote de ninhada");
  if (d.published_at) partes.push("nasceu publicado com a ninhada");
  if (typeof d.founder_number_atribuido === "number") {
    partes.push(`selo Fundador nº ${d.founder_number_atribuido}`);
  }

  return partes.length > 0 ? partes.join(" · ") : null;
}

/**
 * O motivo do bloqueio/desbloqueio, na tela, é OPCIONAL — nada trava o admin
 * que não quiser escrever nada. O banco pensa diferente: `audit_log_reason_len`
 * exige pelo menos 3 caracteres, e `private.audit()` levanta erro se vier
 * curto — é o que garante que toda linha do histórico tem um motivo, mesmo
 * que genérico. Esta função reconcilia os dois lados: o campo vazio vira um
 * motivo padrão ANTES de chegar na RPC, então o banco nunca recebe vazio e a
 * tela nunca trava por causa disso.
 */
export const DEFAULT_SUSPEND_REASON = "Suspenso pelo admin, sem motivo detalhado.";
export const DEFAULT_UNSUSPEND_REASON = "Reativado pelo admin, sem motivo detalhado.";

export function resolveSuspendReason(raw: string, suspend: boolean): string {
  const trimmed = raw.trim();
  if (trimmed.length > 0) return trimmed;
  return suspend ? DEFAULT_SUSPEND_REASON : DEFAULT_UNSUSPEND_REASON;
}

/** Mesma reconciliação de `resolveSuspendReason`, para ocultar/reativar canil e cão. */
export const DEFAULT_HIDE_REASON = "Ocultado pelo admin, sem motivo detalhado.";
export const DEFAULT_UNHIDE_REASON = "Reativado pelo admin, sem motivo detalhado.";

export function resolveHideReason(raw: string, hide: boolean): string {
  const trimmed = raw.trim();
  if (trimmed.length > 0) return trimmed;
  return hide ? DEFAULT_HIDE_REASON : DEFAULT_UNHIDE_REASON;
}

/**
 * Início/fim do dia em America/Sao_Paulo, como ISO com offset explícito —
 * Postgres entende `-03:00` direto, sem precisar converter para UTC aqui.
 * Offset fixo porque o Brasil não usa mais horário de verão desde 2019; não
 * é o caso geral de fuso horário, é este fuso específico.
 */
export function startOfDaySaoPaulo(dateOnly: string): string {
  return `${dateOnly}T00:00:00-03:00`;
}

export function endOfDaySaoPaulo(dateOnly: string): string {
  return `${dateOnly}T23:59:59.999-03:00`;
}

/**
 * Rótulo e destino da entidade de uma linha do `audit_log` — mesma lista
 * fechada de `entity_type` que o CHECK `audit_log_entity_valid` já garante.
 */
export const ENTITY_LABEL: Record<string, string> = {
  profile: "Usuário",
  kennel: "Canil",
  dog: "Cão",
  litter: "Ninhada",
  media: "Imagem",
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? entityType;
}

/**
 * `litter` e `media` ficam DE FORA de propósito: não existe `/admin/ninhadas`
 * nem tela para uma imagem isolada, e inventar um link quebrado é pior que não
 * linkar. `entityHref` devolve null e a célula vira texto puro — o mesmo que já
 * acontecia com tipo desconhecido. Para a imagem, quem tem tela é o DONO dela
 * (canil ou cão), e o id dele está no `details`.
 */
const ENTITY_BASE_PATH: Record<string, string> = {
  profile: "/admin/usuarios",
  kennel: "/admin/canis",
  dog: "/admin/caes",
};

export function entityHref(entityType: string, entityId: string): string | null {
  const base = ENTITY_BASE_PATH[entityType];
  return base ? `${base}/${entityId}` : null;
}
