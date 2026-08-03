/**
 * ============================================================================
 * Limites, caminhos e resolução de URL. Tudo puro e testável.
 * ============================================================================
 *
 * Armazenamento é o primeiro limite de plano a estourar, então tamanho aqui é
 * requisito, não detalhe: os números abaixo são o contrato entre a compressão
 * no client, a validação no servidor e os CHECKs do banco. Mudar um deles sem
 * mudar os outros dois quebra o upload em algum ponto do caminho.
 */

/** Rascunho: só o dono lê, por URL assinada. */
export const BUCKET_PRIVATE = "kennel-media";

/**
 * Publicado: servido pelo CDN, URL estável, sem expiração.
 *
 * O objeto é MOVIDO entre os dois — nunca copiado. Armazenamento é o primeiro
 * limite de plano a estourar.
 */
export const BUCKET_PUBLIC = "kennel-media-public";

/**
 * Formatos aceitos na SELEÇÃO do arquivo.
 *
 * HEIC fica de fora de propósito, apesar de ser o padrão do iPhone: nenhum
 * navegador decodifica HEIC em canvas, então a compressão falharia. O iOS já
 * converte para JPEG ao enviar por `<input type="file">`, então na prática o
 * usuário não esbarra nisso.
 *
 * SVG também fica de fora, e por segurança: SVG é documento executável, e um
 * arquivo servido do nosso domínio poderia carregar script.
 */
export const ACCEPTED_INPUT_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/**
 * Formatos aceitos no ARMAZENAMENTO — o que sai da compressão.
 *
 * Menor que a lista de entrada de propósito: comprimimos tudo para WebP, que
 * economiza ~30% sobre JPEG na mesma qualidade percebida. Os outros continuam
 * na lista porque um navegador antigo pode não gerar WebP no canvas, e nesse
 * caso o fallback é JPEG.
 */
export const ACCEPTED_STORED_MIMES = ["image/webp", "image/jpeg"] as const;

export type StoredMime = (typeof ACCEPTED_STORED_MIMES)[number];

/** Arquivo escolhido pelo usuário, ANTES de comprimir. Barra a foto de 40 MB. */
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** Depois de comprimir. É o que efetivamente ocupa plano. */
export const MAX_STORED_BYTES = 600 * 1024;
export const MAX_THUMB_BYTES = 80 * 1024;

/** Lado maior. 1600 cobre tela retina sem guardar original de câmera. */
export const MAX_IMAGE_DIMENSION = 1600;
export const THUMB_DIMENSION = 320;

/** Teto por usuário. Existe para o limite estourar com aviso, não com erro. */
export const MAX_USER_BYTES = 200 * 1024 * 1024;

/** Teto de itens na galeria de um cão. */
export const MAX_GALLERY_ITEMS = 12;

export type MediaRole = "kennel_logo" | "dog_gallery";

// -----------------------------------------------------------------------------
// Validação
// -----------------------------------------------------------------------------

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateInputFile(file: { type: string; size: number }): ValidationResult {
  if (!(ACCEPTED_INPUT_MIMES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "Formato não aceito. Envie JPEG, PNG, WebP ou AVIF." };
  }
  if (file.size <= 0) return { ok: false, reason: "Arquivo vazio." };
  if (file.size > MAX_INPUT_BYTES) {
    return {
      ok: false,
      reason: `Arquivo acima de ${formatBytes(MAX_INPUT_BYTES)}. Reduza antes de enviar.`,
    };
  }
  return { ok: true };
}

/**
 * Validação do que vai ser GRAVADO. Roda no servidor contra o que o Storage
 * reporta, não contra o que o client afirma — o client é a parte não confiável
 * desta transação.
 */
export function validateStoredFile(file: { mime: string; size: number }): ValidationResult {
  if (!(ACCEPTED_STORED_MIMES as readonly string[]).includes(file.mime)) {
    return { ok: false, reason: "Formato armazenado inválido." };
  }
  if (file.size <= 0) return { ok: false, reason: "Arquivo vazio." };
  if (file.size > MAX_STORED_BYTES) {
    return {
      ok: false,
      reason: `Imagem acima de ${formatBytes(MAX_STORED_BYTES)} após compressão.`,
    };
  }
  return { ok: true };
}

export function validateQuota(usedBytes: number, incomingBytes: number): ValidationResult {
  if (usedBytes + incomingBytes > MAX_USER_BYTES) {
    return {
      ok: false,
      reason: `Você já usa ${formatBytes(usedBytes)} de ${formatBytes(MAX_USER_BYTES)}. Remova imagens antes de enviar novas.`,
    };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Redimensionamento — a matemática, sem canvas
// -----------------------------------------------------------------------------

export type Size = { width: number; height: number };

/**
 * Encaixa a imagem no lado maior, preservando proporção. NUNCA amplia: subir
 * uma imagem de 200px para 1600 só gera bytes e borrão.
 */
export function computeTargetSize(source: Size, maxDimension: number): Size {
  const { width, height } = source;
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };

  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width: Math.round(width), height: Math.round(height) };

  const ratio = maxDimension / longest;
  return {
    // Arredonda para cima no mínimo 1: uma imagem 4000x3 não pode virar altura 0.
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

// -----------------------------------------------------------------------------
// Caminhos no Storage
// -----------------------------------------------------------------------------

/**
 * `{owner_uid}/{escopo}/{entity_id}/{arquivo}`
 *
 * O primeiro segmento tem de ser o uid: é exatamente o que a policy de
 * `storage.objects` compara com `auth.uid()`. Mudar esta função sem mudar a
 * policy faz todo upload passar a ser negado.
 */
export function buildStoragePath(params: {
  ownerId: string;
  role: MediaRole;
  entityId: string;
  fileId: string;
  extension: string;
}): string {
  const scope = params.role === "kennel_logo" ? "canis" : "caes";
  return `${params.ownerId}/${scope}/${params.entityId}/${params.fileId}.${params.extension}`;
}

export function buildThumbPath(storagePath: string): string {
  const dot = storagePath.lastIndexOf(".");
  if (dot === -1) return `${storagePath}_thumb`;
  return `${storagePath.slice(0, dot)}_thumb${storagePath.slice(dot)}`;
}

/** O caminho pertence mesmo a este usuário? Barra `../` e prefixo alheio. */
export function pathBelongsTo(storagePath: string, ownerId: string): boolean {
  if (storagePath.includes("..") || storagePath.startsWith("/")) return false;
  const [first] = storagePath.split("/");
  return first === ownerId;
}

export function extensionForMime(mime: string): string {
  return mime === "image/webp" ? "webp" : "jpg";
}

// -----------------------------------------------------------------------------
// Resolução de URL — o ponto único que mantém a decisão de bucket aberta
// -----------------------------------------------------------------------------

export type MediaLocation = { bucket_id: string; storage_path: string };

/**
 * TODA URL de imagem sai daqui. Nenhum componente monta caminho na mão.
 *
 * É o que deixa a decisão sobre mídia pública em aberto: hoje o bucket é
 * privado e a entrega usa URL assinada. Quando escolhermos entre bucket
 * público separado ou rota de proxy com cache, muda esta função e a coluna
 * `media.bucket_id` — nenhuma tela é tocada.
 *
 * Enquanto isso, o caminho relativo já é estável e serve de chave de cache.
 */
export function mediaObjectKey(media: MediaLocation): string {
  return `${media.bucket_id}/${media.storage_path}`;
}

/** Buckets cujo conteúdo é servido direto pelo CDN, sem assinar. */
const PUBLIC_BUCKETS = new Set<string>([BUCKET_PUBLIC]);

export function isPubliclyServable(media: MediaLocation): boolean {
  return PUBLIC_BUCKETS.has(media.bucket_id);
}

/**
 * Onde o arquivo DEVE estar, dado o estado de publicação da entidade dona.
 *
 * É a única definição desse mapeamento. A reconciliação compara o resultado
 * disto com `media.bucket_id` e move o que estiver fora do lugar.
 */
export function targetBucketFor(isPublished: boolean): string {
  return isPublished ? BUCKET_PUBLIC : BUCKET_PRIVATE;
}

// -----------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
