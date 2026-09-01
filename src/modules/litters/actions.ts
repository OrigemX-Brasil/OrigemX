"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/queries";
import { parentPublishState, type MediaActionState } from "@/modules/media/actions";
import {
  BUCKET_PRIVATE,
  BUCKET_PUBLIC,
  pathBelongsTo,
  targetBucketFor,
  validateQuota,
  validateStoredFile,
} from "@/modules/media/constraints";
import { getUsedBytes, litterPhotoPositions, statStorageObject } from "@/modules/media/queries";
import { litterMediaRows, litterPuppyMediaRows, reconcileMediaBucket } from "@/modules/media/sync";
import type { PublishState } from "@/modules/media/publish";

import {
  isLitterStatus,
  MAX_LITTER_PHOTOS,
  MAX_PUPPIES_PER_LITTER,
  MAX_PUPPY_PRICE_BRL,
} from "./constraints";
import { LITTER_FIELDS } from "./fields";
import { countLitterPuppies, getManageableLitterById } from "./queries";
import {
  normalizeLitterInput,
  validateLitter,
  type FieldErrors,
  type LitterInput,
} from "./validation";

export type LitterFormState = {
  errors?: FieldErrors;
  formError?: string;
  /** Erro do seletor de progenitor, no formato que `DogForm` já usa. */
  parentError?: { sire_id?: string; dam_id?: string };
  values?: LitterInput;
  ok?: boolean;
};

/** Mesmo papel de `DogFormAction` — ver o comentário lá. */
export type LitterFormAction = (
  state: LitterFormState,
  formData: FormData,
) => Promise<LitterFormState>;

/**
 * Lê SÓ os campos que o formulário mandou.
 *
 * `formData.get()` devolve `null` para campo ausente, e `normalizeLitterInput`
 * distingue ausente (não mexe) de vazio (apaga) — por isso a chave só entra no
 * objeto quando veio mesmo. Um `?? ""` aqui apagaria em silêncio toda data que
 * o formulário não renderizou.
 */
function readInput(formData: FormData): LitterInput {
  const input: LitterInput = {};
  for (const field of LITTER_FIELDS) {
    const raw = formData.get(field.name);
    if (typeof raw === "string") input[field.name] = raw;
  }
  return input;
}

function readParent(formData: FormData, slot: "sire" | "dam"): string | null {
  const value = formData.get(slot === "sire" ? "sire_id" : "dam_id");
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Traduz os erros que os triggers da ninhada levantam.
 *
 * `check_violation` (23514) chega com a mensagem do `raise exception` no corpo,
 * então a distinção é por conteúdo — mesma abordagem de `translateDogError`.
 */
function translateLitterError(error: { code?: string; message?: string } | null): LitterFormState {
  const message = error?.message ?? "";

  if (message.includes("precisa referenciar um cão macho")) {
    return { parentError: { sire_id: "Este cão está cadastrado como fêmea." } };
  }
  if (message.includes("precisa referenciar uma cadela")) {
    return { parentError: { dam_id: "Esta cadela está cadastrada como macho." } };
  }
  if (message.includes("ciclo genealógico")) {
    return {
      formError:
        "Esta combinação criaria um ciclo: um dos progenitores já descende do outro lado da árvore.",
    };
  }
  if (message.includes("kennel_litters_born_after_mated")) {
    return { errors: { born_on: "O nascimento não pode ser anterior à cobrição." } };
  }
  if (message.includes("kennel_litters_sire_dam_distinct")) {
    return { formError: "O pai e a mãe não podem ser o mesmo cão." };
  }

  return { formError: "Não foi possível salvar a ninhada." };
}

/**
 * Revalida a página pública do canil a partir do id — `updateLitter` e
 * `softDeleteLitter` só recebem `kennel_id`, não o slug. Sem isto, editar ou
 * excluir uma ninhada JÁ PUBLICADA deixava `/c/[slug]` com a versão antiga
 * por até 300s (o ISR da rota) — a mesma classe de bug que `registerMedia`/
 * `deleteMedia` já tratam do lado da foto, só que faltando aqui do lado do
 * texto e da exclusão.
 */
async function revalidateKennelPublicPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kennelId: string,
) {
  const { data: kennel } = await supabase
    .from("kennels")
    .select("slug")
    .eq("id", kennelId)
    .maybeSingle();
  if (kennel?.slug) revalidatePath(`/c/${kennel.slug}`);
}

/**
 * Revalida `/n/[public_id]`. Mesmo problema de `revalidateKennelPublicPath`:
 * as actions recebem o `id` interno, e a rota pública é indexada pelo
 * `public_id` — sem esta ida ao banco, editar a ninhada deixaria a página
 * pública com a versão antiga até o ISR expirar.
 */
async function revalidateLitterPublicPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  litterId: string,
) {
  const { data: litter } = await supabase
    .from("kennel_litters")
    .select("public_id")
    .eq("id", litterId)
    .maybeSingle();
  if (litter?.public_id) revalidatePath(`/n/${litter.public_id}`);
}

export async function createLitter(
  _prev: LitterFormState,
  formData: FormData,
): Promise<LitterFormState> {
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!kennelId) return { formError: "Canil não identificado." };

  const user = await requireUser(`/painel/canis/${kennelId}/ninhadas/novo`);
  const input = readInput(formData);

  const errors = validateLitter(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  // Consulta antes de gravar só para dar mensagem decente — quem garante a
  // posse é a RLS (`private.owns_kennel`), mesmo raciocínio de `isSlugTaken`
  // em kennels/actions.ts.
  const supabase = await createClient();
  const { data: kennel } = await supabase
    .from("kennels")
    .select("id")
    .eq("id", kennelId)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!kennel) return { formError: "Canil não encontrado." };

  const { data, error } = await supabase
    .from("kennel_litters")
    .insert({
      kennel_id: kennelId,
      ...normalizeLitterInput(input),
      sire_id: readParent(formData, "sire"),
      dam_id: readParent(formData, "dam"),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ...translateLitterError(error), values: input };
  }

  revalidatePath(`/painel/canis/${kennelId}`);
  // Sem foto ainda: `litter_id` só existe a partir daqui. Mesma restrição que
  // já vale para logo de canil e galeria de cão.
  redirect(`/painel/canis/${kennelId}/ninhadas/${data.id}`);
}

export async function updateLitter(
  _prev: LitterFormState,
  formData: FormData,
): Promise<LitterFormState> {
  const id = String(formData.get("id") ?? "");
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!id || !kennelId) return { formError: "Ninhada não identificada." };

  await requireUser(`/painel/canis/${kennelId}/ninhadas/${id}`);
  const input = readInput(formData);

  const errors = validateLitter(input);
  if (Object.keys(errors).length > 0) return { errors, values: input };

  const supabase = await createClient();
  const patch = normalizeLitterInput(input);
  const { data, error } = await supabase
    .from("kennel_litters")
    .update({
      ...patch,
      sire_id: readParent(formData, "sire"),
      dam_id: readParent(formData, "dam"),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) return { ...translateLitterError(error), values: input };

  // Zero linhas sem erro é a assinatura de RLS negando — mesmo raciocínio de
  // `updateKennel`.
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar esta ninhada.", values: input };
  }

  // A data de nascimento DESCE para os filhotes que ainda não têm uma.
  //
  // Não é o mesmo caso da cascata de progenitores: aquela é trigger, porque a
  // igualdade é INVARIANTE (o par do filhote não pode contradizer o da
  // ninhada). Esta é conveniência, e por isso vive na aplicação e é
  // conservadora — só preenche `born_on` nulo, nunca sobrescreve o que já
  // existe.
  //
  // Sem ela, quem cadastra os filhotes antes de registrar o nascimento fica com
  // um perfil público de cão sem data, e sem pista nenhuma de onde arrumar.
  if (patch.born_on) {
    await supabase
      .from("dogs")
      .update({ born_on: patch.born_on })
      .eq("litter_id", id)
      .is("deleted_at", null)
      .is("born_on", null);
  }

  revalidatePath(`/painel/canis/${kennelId}`);
  revalidatePath(`/painel/canis/${kennelId}/ninhadas/${id}`);
  await revalidateKennelPublicPath(supabase, kennelId);
  await revalidateLitterPublicPath(supabase, id);
  return { ok: true, values: input };
}

/**
 * Exclusão LÓGICA. `kennel_litters` não concede DELETE a `authenticated` —
 * mesma invariante do resto do projeto.
 */
export async function softDeleteLitter(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const kennelId = String(formData.get("kennel_id") ?? "");
  if (!id || !kennelId) return;

  await requireUser(`/painel/canis/${kennelId}/ninhadas/${id}`);

  const supabase = await createClient();
  await supabase
    .from("kennel_litters")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  revalidatePath(`/painel/canis/${kennelId}`);
  await revalidateKennelPublicPath(supabase, kennelId);
  redirect(`/painel/canis/${kennelId}`);
}

/** O join do PostgREST vem como objeto ou array conforme a cardinalidade. */
function kennelOf<T extends { owner_id: string }>(k: T | T[] | null | undefined): T | null {
  if (!k) return null;
  return Array.isArray(k) ? (k[0] ?? null) : k;
}

function revalidateLitter(
  slug: string,
  kennelId: string,
  litterId: string,
  publicId?: string | null,
) {
  revalidatePath(`/c/${slug}`);
  revalidatePath("/painel/canis");
  revalidatePath(`/painel/canis/${kennelId}`);
  revalidatePath(`/painel/canis/${kennelId}/ninhadas/${litterId}`);
  if (publicId) revalidatePath(`/n/${publicId}`);
}

/**
 * Publicar e despublicar — mesma ordem de segurança de `publishDog`/
 * `publishKennel` (mover primeiro ao publicar, despublicar primeiro ao
 * tirar do ar), com UMA diferença: a REGRA DUPLA. Ninhada só é pública se
 * ELA e o CANIL dela estiverem publicados (`kennel_litters_select`). Por
 * isso `publishLitter` só move fotos para o bucket público quando o canil
 * JÁ está publicado — senão o arquivo ficaria exposto sem nenhuma página RLS
 * deixando alguém enxergar a linha. Se o canil ainda não está publicado, a
 * ninhada é marcada como publicada mesmo assim (é a intenção do dono) e a
 * resposta avisa que falta o outro lado da regra.
 *
 * ---------------------------------------------------------------------------
 * A CASCATA PARA OS FILHOTES
 * ---------------------------------------------------------------------------
 * O filhote é uma linha em `dogs`, então ele tem `published_at` PRÓPRIO e
 * `dogs_select` não sabe nada de ninhada. Sem cascata, publicar a ninhada
 * mostraria a página e nenhum filhote dentro dela — e obrigar o criador a
 * publicar oito cães um a um seria a pior tela do produto.
 *
 * A cascata foi escolhida em vez de um `OR EXISTS` em `dogs_select` por dois
 * motivos: `dogs_select` é a policy mais quente do sistema, e o move de bucket
 * das fotos dos filhotes teria de acontecer aqui de qualquer forma.
 */
export async function publishLitter(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Ninhada não identificada." };

  const user = await requireUser("/painel");
  const supabase = await createClient();

  const { data: litter } = await supabase
    .from("kennel_litters")
    .select("id, kennel_id, public_id, kennels!inner(owner_id, slug, published_at)")
    .eq("id", id)
    .eq("kennels.owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  const kennel = kennelOf(litter?.kennels);
  if (!litter || !kennel) return { error: "Ninhada não encontrada." };

  if (kennel.published_at) {
    // A galeria da ninhada E a foto de cada filhote: as duas ficam expostas na
    // mesma página, e as duas vivem em buckets diferentes até este momento.
    const [litterRows, puppyRows] = await Promise.all([
      litterMediaRows(supabase, id),
      litterPuppyMediaRows(supabase, id),
    ]);
    const sync = await reconcileMediaBucket(supabase, [...litterRows, ...puppyRows], BUCKET_PUBLIC);
    if (sync.failed.length > 0) {
      return {
        error:
          "Não foi possível preparar as fotos para o acesso público. A ninhada NÃO foi publicada — tente de novo.",
      };
    }
  }

  const publishedAt = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("kennel_litters")
    .update({ published_at: publishedAt })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível publicar a ninhada." };
  }

  // Os filhotes, na sequência. Só os que ainda não estavam publicados — o
  // criador pode ter publicado um deles individualmente pela página do cão, e
  // sobrescrever a data apagaria quando aquilo aconteceu.
  const { data: puppiesPublicados } = await supabase
    .from("dogs")
    .update({ published_at: publishedAt })
    .eq("litter_id", id)
    .is("deleted_at", null)
    .is("published_at", null)
    .select("public_id");

  revalidateLitter(kennel.slug, litter.kennel_id, id, litter.public_id);
  // Mesma lacuna que `publishKennel` tinha para `/n/[public_id]`: sem isto,
  // `/d/[public_id]` de cada filhote fica preso na versão cacheada de antes
  // da publicação (inclusive "não encontrada", se alguém já tiver aberto o
  // link) até os 300s do ISR vencerem sozinhos.
  for (const puppy of puppiesPublicados ?? []) revalidatePath(`/d/${puppy.public_id}`);

  if (!kennel.published_at) {
    return {
      ok: true,
      warning:
        "A ninhada foi marcada como publicada, mas só aparece no perfil quando o canil TAMBÉM estiver publicado.",
    };
  }
  return { ok: true };
}

export async function unpublishLitter(formData: FormData): Promise<PublishState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Ninhada não identificada." };

  const user = await requireUser("/painel");
  const supabase = await createClient();

  const { data: litter } = await supabase
    .from("kennel_litters")
    .select("id, kennel_id, public_id, kennels!inner(owner_id, slug)")
    .eq("id", id)
    .eq("kennels.owner_id", user.id)
    .maybeSingle();
  const kennel = kennelOf(litter?.kennels);
  if (!litter || !kennel) return { error: "Ninhada não encontrada." };

  // 1. Tira do ar primeiro — a ninhada E os filhotes dela.
  //
  // A simetria com `publishLitter` é obrigatória: o filhote foi publicado PELA
  // cascata, não individualmente, então despublicar a ninhada e deixar oito
  // páginas `/d/[public_id]` no ar seria vazamento silencioso — o criador
  // clicou em "despublicar" e continuaria com os cães visíveis.
  const { data: updated, error } = await supabase
    .from("kennel_litters")
    .update({ published_at: null })
    .eq("id", id)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: "Não foi possível despublicar a ninhada." };
  }

  const { data: puppiesDespublicados } = await supabase
    .from("dogs")
    .update({ published_at: null })
    .eq("litter_id", id)
    .is("deleted_at", null)
    .select("public_id");

  // 2. Purga o cache antes de mexer em arquivo — a ninhada e cada filhote.
  revalidateLitter(kennel.slug, litter.kennel_id, id, litter.public_id);
  for (const puppy of puppiesDespublicados ?? []) revalidatePath(`/d/${puppy.public_id}`);

  // 3. Devolve os arquivos ao privado — os dois conjuntos.
  const [litterRows, puppyRows] = await Promise.all([
    litterMediaRows(supabase, id),
    litterPuppyMediaRows(supabase, id),
  ]);
  const sync = await reconcileMediaBucket(supabase, [...litterRows, ...puppyRows], BUCKET_PRIVATE);

  if (sync.failed.length > 0) {
    return {
      ok: true,
      warning:
        "A ninhada saiu do ar, mas não foi possível remover as fotos do endereço público. " +
        "Quem tiver o link antigo da imagem ainda consegue abri-la. Rode a reconciliação ou tente despublicar de novo.",
    };
  }

  return { ok: true };
}

/**
 * ============================================================================
 * FILHOTES — cada um é uma linha em `dogs`.
 * ============================================================================
 *
 * Nada aqui cria "entidade filhote": estas actions só preenchem `dogs` com o
 * que a ninhada já sabe. Depois de criado, o filhote é editado pela MESMA
 * página de cão que todo o resto do produto usa (`/painel/caes/[id]`) — nome,
 * foto, registro CBKC e saúde não ganharam tela nova.
 */

export type PuppyFormState = {
  formError?: string;
  ok?: boolean;
};

/**
 * Cadastra um filhote na ninhada.
 *
 * `dogs.name` é NOT NULL e no ninho o filhote ainda não tem nome, então nasce
 * como "Filhote N" — o criador renomeia quando batizar. Contar as linhas VIVAS
 * para o N significa que excluir o Filhote 2 e cadastrar outro produz um
 * segundo "Filhote 2"; é rótulo provisório, não identidade (essa é o
 * `public_id`), e um contador monotônico só geraria "Filhote 9" numa ninhada de
 * três.
 *
 * `sire_id`/`dam_id` vêm da NINHADA, nunca do formulário — o trigger
 * `dogs_check_litter_parents` recusaria qualquer outra coisa, e é essa recusa
 * que mantém as duas tabelas coerentes.
 */
export async function addPuppy(_prev: PuppyFormState, formData: FormData): Promise<PuppyFormState> {
  const litterId = String(formData.get("litter_id") ?? "");
  const sex = String(formData.get("sex") ?? "");
  if (!litterId) return { formError: "Ninhada não identificada." };
  if (sex !== "male" && sex !== "female") {
    return { formError: "Escolha o sexo do filhote." };
  }

  const user = await requireUser("/painel");

  const litter = await getManageableLitterById(litterId, user.id);
  if (!litter) return { formError: "Ninhada não encontrada." };

  // O par precisa existir antes do filhote: sem ele o cão nasceria órfão de
  // pedigree, que é justamente o que esta feature veio resolver.
  if (!litter.sire_id && !litter.dam_id) {
    return {
      formError: "Escolha ao menos um progenitor da ninhada antes de cadastrar filhotes.",
    };
  }

  const existing = await countLitterPuppies(litterId);
  if (existing >= MAX_PUPPIES_PER_LITTER) {
    return { formError: `Uma ninhada aceita no máximo ${MAX_PUPPIES_PER_LITTER} filhotes.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("dogs").insert({
    name: `Filhote ${existing + 1}`,
    sex,
    kennel_id: litter.kennel_id,
    litter_id: litterId,
    litter_status: "available",
    sire_id: litter.sire_id,
    dam_id: litter.dam_id,
    born_on: litter.born_on,
    owner_id: user.id,
    created_by: user.id,
    // Ninhada já publicada recebe filhote já publicado — senão ele ficaria
    // invisível na página até alguém republicar, sem nenhum aviso.
    published_at: litter.published_at ? new Date().toISOString() : null,
  });

  if (error) {
    console.error(
      `[litters:addPuppy] insert falhou para litter=${litterId}:`,
      error.code,
      error.message,
    );
    return { formError: "Não foi possível cadastrar o filhote." };
  }

  revalidatePath(`/painel/canis/${litter.kennel_id}/ninhadas/${litterId}`);
  revalidatePath(`/painel/canis/${litter.kennel_id}`);
  revalidatePath(`/n/${litter.public_id}`);
  return { ok: true };
}

/**
 * Status e preço do filhote — os dois campos que só existem DENTRO da ninhada.
 *
 * Ficam nesta action, e não em `updateDog`, porque o CHECK
 * `dogs_litter_status_requires_litter` os amarra a `litter_id`: mandá-los junto
 * do formulário geral de cão faria todo cão comum falhar.
 */
export async function updatePuppy(
  _prev: PuppyFormState,
  formData: FormData,
): Promise<PuppyFormState> {
  const dogId = String(formData.get("dog_id") ?? "");
  const litterId = String(formData.get("litter_id") ?? "");
  const status = String(formData.get("litter_status") ?? "");
  const rawPrice = String(formData.get("price_brl") ?? "").trim();
  // Checkbox: ausente no FormData = desmarcado. Sem ambiguidade porque o
  // `<form>` sempre submete inteiro, nunca um PATCH parcial.
  const acceptsOffer = formData.get("accepts_offer") === "on";

  if (!dogId || !litterId) return { formError: "Filhote não identificado." };
  if (!isLitterStatus(status)) return { formError: "Status inválido." };

  const user = await requireUser("/painel");

  const litter = await getManageableLitterById(litterId, user.id);
  if (!litter) return { formError: "Ninhada não encontrada." };

  // Vírgula é como se digita preço em português; o banco quer ponto.
  let price: number | null = null;
  if (rawPrice.length > 0) {
    price = Number(rawPrice.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) {
      return { formError: "O preço precisa ser um número maior que zero." };
    }
    if (price > MAX_PUPPY_PRICE_BRL) {
      return { formError: "Confira o preço — o valor informado está fora da faixa esperada." };
    }
    // `numeric(10,2)`: mais casas seriam arredondadas pelo banco em silêncio.
    price = Math.round(price * 100) / 100;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dogs")
    .update({ litter_status: status, price_brl: price, accepts_offer: acceptsOffer })
    .eq("id", dogId)
    .eq("litter_id", litterId)
    .is("deleted_at", null)
    .select("id, public_id");

  if (error) return { formError: "Não foi possível salvar o filhote." };
  if (!data || data.length === 0) {
    return { formError: "Você não tem permissão para editar este filhote." };
  }

  revalidatePath(`/painel/canis/${litter.kennel_id}/ninhadas/${litterId}`);
  revalidatePath(`/painel/caes/${dogId}`);
  revalidatePath(`/d/${data[0].public_id}`);
  revalidatePath(`/n/${litter.public_id}`);
  return { ok: true };
}

/**
 * Registra a metadata de uma foto de ninhada já enviada ao Storage pelo
 * client — mesmo papel de `registerMedia` (media/actions.ts), mas NÃO é uma
 * ramificação nova lá dentro, por um motivo estrutural: `registerMedia`
 * nunca calcula `position` (toda foto de galeria de cão nasce em 0, o
 * default da coluna); só `setDogGalleryCover` escreve posição, ao trocar a
 * capa. O teto de 4 fotos da ninhada é o índice único parcial
 * `media_litter_position_uk` em `(litter_id, position)`, e ele só barra
 * corretamente se quem grava calcular o MENOR SLOT LIVRE (1-4) ANTES do
 * INSERT — sem isso, toda foto tentaria a posição 0, que nem é válida para
 * `litter_gallery` (o CHECK exige 1-4), e o insert falharia sempre, não só
 * na 5ª foto.
 */
export async function registerLitterPhoto(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const user = await requireUser("/painel");

  const litterId = String(formData.get("entity_id") ?? "");
  const storagePath = String(formData.get("storage_path") ?? "");
  const thumbPath = String(formData.get("thumb_path") ?? "") || null;
  const width = Number(formData.get("width") ?? 0) || null;
  const height = Number(formData.get("height") ?? 0) || null;

  if (!litterId || !storagePath) return { error: "Envio incompleto." };

  const supabase = await createClient();
  const cleanup = async () => {
    const paths = [storagePath, thumbPath].filter((p): p is string => Boolean(p));
    await supabase.storage.from(BUCKET_PRIVATE).remove(paths);
  };

  // Mesma checagem de `registerMedia`: a policy do Storage já barra upload
  // fora do prefixo do próprio usuário; isto impede a METADATA apontar para
  // o arquivo de outra pessoa.
  if (!pathBelongsTo(storagePath, user.id) || (thumbPath && !pathBelongsTo(thumbPath, user.id))) {
    return { error: "Caminho de arquivo inválido." };
  }

  const litter = await getManageableLitterById(litterId, user.id);
  if (!litter) {
    await cleanup();
    return { error: "Ninhada não encontrada." };
  }

  const full = await statStorageObject(BUCKET_PRIVATE, storagePath);
  if (!full) {
    return { error: "Arquivo não encontrado no armazenamento. Tente enviar de novo." };
  }

  const check = validateStoredFile({ mime: full.mime, size: full.size });
  if (!check.ok) {
    await cleanup();
    return { error: check.reason };
  }

  const thumb = thumbPath ? await statStorageObject(BUCKET_PRIVATE, thumbPath) : null;

  const used = await getUsedBytes(user.id);
  const quota = validateQuota(used, full.size + (thumb?.size ?? 0));
  if (!quota.ok) {
    await cleanup();
    return { error: quota.reason };
  }

  // O SLOT — ver o comentário do arquivo. Laço curto com retentativa: se dois
  // uploads da mesma ninhada colidirem no mesmo slot (a fila do
  // `GalleryUploader` roda até 3 fotos ao mesmo tempo), o índice único
  // recusa o segundo com 23505, e a retentativa refaz a conta com o retrato
  // atualizado das posições — não é bug, é concorrência normal, e o mesmo
  // raciocínio de tolerância que `moveOne` (media/sync.ts) já usa.
  let mediaId: string | null = null;
  let attempts = 0;
  while (!mediaId && attempts < MAX_LITTER_PHOTOS) {
    attempts += 1;

    const usedPositions = await litterPhotoPositions(litterId);
    const slot = [1, 2, 3, 4].find((p) => !usedPositions.includes(p));
    if (!slot) {
      await cleanup();
      return { error: `A ninhada já tem o máximo de ${MAX_LITTER_PHOTOS} fotos.` };
    }

    const { data, error } = await supabase
      .from("media")
      .insert({
        bucket_id: BUCKET_PRIVATE,
        storage_path: storagePath,
        thumb_path: thumbPath,
        litter_id: litterId,
        role: "litter_gallery",
        position: slot,
        mime: full.mime,
        size_bytes: full.size,
        thumb_bytes: thumb?.size ?? null,
        width,
        height,
        owner_id: user.id,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (data) {
      mediaId = data.id;
      break;
    }

    if (error?.code !== "23505") {
      await cleanup();
      console.error(
        `[litters:registerLitterPhoto] insert falhou para litter=${litterId}:`,
        error?.code,
        error?.message,
      );
      return { error: "Não foi possível registrar a foto." };
    }
    // 23505 em media_litter_position_uk: outra foto ocupou este slot entre a
    // leitura e a gravação — tenta de novo.
  }

  if (!mediaId) {
    await cleanup();
    return { error: "Não foi possível registrar a foto — tente de novo." };
  }

  // Ver `parentPublishState` (media/actions.ts): move para o público SÓ se a
  // dupla ninhada+canil já estiver publicada — senão a foto ficaria presa no
  // privado até a próxima publicação, o mesmo bug que `registerMedia` já
  // trata do lado de canil/cão.
  const parent = await parentPublishState(supabase, "litter_gallery", litterId);
  if (targetBucketFor(parent.isPublished) === BUCKET_PUBLIC) {
    const outcome = await reconcileMediaBucket(
      supabase,
      [
        {
          id: mediaId,
          bucket_id: BUCKET_PRIVATE,
          storage_path: storagePath,
          thumb_path: thumbPath,
        },
      ],
      BUCKET_PUBLIC,
    );
    if (outcome.failed.length > 0) {
      console.error(
        `[litters:registerLitterPhoto] falha ao mover ${mediaId} para o bucket público:`,
        outcome.failed.map((f) => f.reason).join("; "),
      );
    } else if (parent.publicPath) {
      revalidatePath(parent.publicPath);
    }
  }

  revalidatePath(`/painel/canis/${litter.kennel_id}/ninhadas/${litterId}`);
  revalidatePath(`/painel/canis/${litter.kennel_id}`);

  return { mediaId };
}
