import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { dispararCanilPublicado } from "@/lib/notify/usuario/disparos";
import { createClient } from "@/lib/supabase/server";
import { assistingProfileId } from "@/lib/assist";
import { calculateDogCompleteness } from "@/modules/dogs/completeness";
import { calculateCompleteness } from "@/modules/kennels/completeness";
import { calculateLitterCompleteness } from "@/modules/litters/completeness";

import { BUCKET_PUBLIC } from "./constraints";
import { getDogGallery, getKennelLogo, getLitterGallery } from "./queries";
import { publishedLitterPublicIds, revalidateDogPaths, revalidateKennelPaths } from "./publish-targets";
import { dogMediaRows, kennelMediaRows, litterMediaRows, reconcileMediaBucket } from "./sync";

/**
 * ============================================================================
 * Publicar sozinho ao fechar o cadastro mínimo.
 * ============================================================================
 *
 * Aditivo de fluxo de 03/09/2026: "assim que o usuário preencher os campos
 * obrigatórios, o sistema deve considerar o cadastro concluído, e o perfil já
 * deve estar liberado para visualização".
 *
 * NÃO PODE SER TRIGGER DE BANCO. Publicar move arquivo entre os buckets
 * (`reconcileMediaBucket`), que é HTTP com a API do Storage — Postgres não fala
 * isso. Fica na aplicação, chamado depois das escritas que podem FECHAR o
 * mínimo.
 *
 * NUNCA QUEBRA O FLUXO. Quem chama envolve em `after()` + try/catch, mesma
 * regra do e-mail: cadastrar um cão não pode falhar porque a publicação
 * automática falhou.
 */

export type AlvoAutoPublicacao = "kennel" | "dog" | "litter";

/**
 * O jeito CERTO de chamar isto de dentro de uma Server Action.
 *
 * `after()` porque várias das ações terminam em `redirect()`, que lança por
 * dentro e fecha a resposta — um `void` solto morreria com a função serverless
 * antes de a publicação sair. É o mesmo motivo pelo qual os e-mails já usam
 * `after()`.
 *
 * O try/catch mora AQUI, e não em cada chamada: são seis pontos, e basta um
 * esquecer para que salvar um cão passe a falhar porque a migração de bucket
 * caiu. Publicar sozinho é conveniência; gravar o registro é o produto.
 */
export function agendarAutoPublicacao(alvo: AlvoAutoPublicacao, id: string): void {
  after(async () => {
    try {
      await publicarSeConcluiu(alvo, id);
    } catch (erro) {
      console.error(`[auto-publish] ${alvo} ${id}:`, erro instanceof Error ? erro.message : erro);
    }
  });
}

export type EstadoParaDecidir = {
  /** Quantos itens do cadastro mínimo ainda faltam. */
  faltamObrigatorios: number;
  /** `published_at` — o ESTADO atual. */
  publishedAt: string | null;
  /** `auto_published_at` — o FATO passado. Nunca é limpo. */
  autoPublishedAt: string | null;
  /** Há cadastro assistido aberto? */
  assistindo: boolean;
};

/**
 * A REGRA, pura e testável sem banco — mesmo desenho de
 * `notify/usuario/decisao.ts`.
 *
 * Quatro guardas, e cada uma existe por um motivo que já custou caro em algum
 * lugar deste projeto:
 *
 * 1. FALTA ALGO — é a regra em si. Sem o mínimo, não há "cadastro concluído".
 *
 * 2. JÁ ESTÁ PUBLICADO — nada a fazer. Republicar reescreveria `published_at` e
 *    faria o perfil parecer novo numa ordenação por data.
 *
 * 3. JÁ FOI PUBLICADO SOZINHO UMA VEZ — e esta é a que protege o criador.
 *    Ele concluiu, o perfil foi ao ar, e ele decidiu TIRAR do ar. Depois editou
 *    a cidade. Sem esta guarda, "mínimo completo e `published_at` nulo" é
 *    indistinguível de "nunca foi publicado", e a automação o arrastaria de
 *    volta — desfazendo uma decisão explícita dele, sem aviso.
 *
 * 4. CADASTRO ASSISTIDO ABERTO — um admin preenchendo o último campo publicaria
 *    o perfil do criador SEM passar pelo caminho auditado
 *    (`admin_set_kennel_published`). Seria exatamente a publicação silenciosa
 *    por admin que duas migrations foram escritas para eliminar. Com sessão
 *    aberta, a tela oferece Publicar ao admin — e aquele caminho audita.
 */
export function devePublicarSozinho(estado: EstadoParaDecidir): boolean {
  if (estado.faltamObrigatorios > 0) return false;
  if (estado.publishedAt !== null) return false;
  if (estado.autoPublishedAt !== null) return false;
  if (estado.assistindo) return false;
  return true;
}

/**
 * Lê o registro, mede a completude e devolve o estado para a decisão.
 *
 * A foto e o logo vêm de `media`, nunca de coluna — é a mesma pergunta que as
 * telas de painel já fazem, e uma segunda fonte de verdade para "tem imagem?"
 * divergiria na primeira exclusão de mídia.
 */
async function medir(
  alvo: AlvoAutoPublicacao,
  id: string,
): Promise<
  | (EstadoParaDecidir & { slug?: string; publicId?: string; ownerId?: string; nome?: string })
  | null
> {
  const supabase = await createClient();
  const assistindo = (await assistingProfileId()) !== null;

  if (alvo === "kennel") {
    const { data } = await supabase
      .from("kennels")
      .select("*, owner:profiles!kennels_owner_id_fkey(full_name)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return null;

    const logo = await getKennelLogo(id);
    const dono = data.owner as { full_name: string | null } | { full_name: string | null }[] | null;
    const nomeDono = (Array.isArray(dono) ? dono[0]?.full_name : dono?.full_name) ?? null;

    const c = calculateCompleteness({
      ...data,
      logo_url: logo?.storage_path ?? null,
      owner_name: nomeDono,
    });
    return {
      faltamObrigatorios: c.missingRequired.length,
      publishedAt: data.published_at,
      autoPublishedAt: data.auto_published_at,
      assistindo,
      slug: data.slug,
      ownerId: data.owner_id,
      // Vai no CORPO do e-mail de canil publicado. Sem ele a mensagem sairia
      // com o nome em branco.
      nome: data.name,
    };
  }

  if (alvo === "dog") {
    const { data } = await supabase
      .from("dogs")
      .select("*, kennels(slug)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return null;

    const gallery = await getDogGallery(id);
    const c = calculateDogCompleteness({
      ...data,
      photo: gallery[0] ?? null,
      kennel_id: data.kennel_id ?? data.owner_id,
    });
    return {
      faltamObrigatorios: c.missingRequired.length,
      publishedAt: data.published_at,
      autoPublishedAt: data.auto_published_at,
      assistindo,
      publicId: data.public_id,
      slug: kennelSlugOf(data),
    };
  }

  const { data } = await supabase
    .from("kennel_litters")
    .select("*, kennels(slug, published_at)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;

  const fotos = await getLitterGallery(id);
  const c = calculateLitterCompleteness({
    ...data,
    photo: fotos[0] ?? null,
    born_on: data.born_on ?? data.mated_on,
  });
  return {
    faltamObrigatorios: c.missingRequired.length,
    publishedAt: data.published_at,
    autoPublishedAt: data.auto_published_at,
    assistindo,
    publicId: data.public_id,
    slug: kennelSlugOf(data),
  };
}

/** O join do PostgREST vem como objeto ou array conforme a cardinalidade. */
function kennelSlugOf(row: { kennels?: unknown }): string | undefined {
  const k = row.kennels as { slug: string } | { slug: string }[] | null | undefined;
  if (!k) return undefined;
  return (Array.isArray(k) ? k[0]?.slug : k.slug) ?? undefined;
}

/**
 * Publica o registro se — e só se — o cadastro mínimo acabou de fechar.
 *
 * A ORDEM É A MESMA de `publish.ts`, e pelo mesmo motivo: mover os arquivos
 * PRIMEIRO. Entidade pública com mídia privada quebra a imagem de forma
 * PERMANENTE, porque a página cacheada não pode usar URL assinada. Se o move
 * falhar, não publica — e não é erro: o criador tenta de novo no próximo save,
 * ou publica pelo botão.
 *
 * O UPDATE carrega as duas guardas de novo (`published_at` e
 * `auto_published_at` nulos) como condição da consulta. Entre medir e gravar
 * cabe outra requisição do mesmo criador — duas abas, dois saves — e sem isso
 * as duas publicariam.
 */
export async function publicarSeConcluiu(alvo: AlvoAutoPublicacao, id: string): Promise<void> {
  const estado = await medir(alvo, id);
  if (!estado || !devePublicarSozinho(estado)) return;

  const supabase = await createClient();
  const agora = new Date().toISOString();

  const linhas =
    alvo === "kennel"
      ? await kennelMediaRows(supabase, id)
      : alvo === "dog"
        ? await dogMediaRows(supabase, id)
        : await litterMediaRows(supabase, id);

  const sync = await reconcileMediaBucket(supabase, linhas, BUCKET_PUBLIC);
  if (sync.failed.length > 0) {
    console.error(
      `[auto-publish] ${alvo} ${id}: mídia não migrou, publicação adiada:`,
      sync.failed.map((f) => f.reason).join("; "),
    );
    return;
  }

  const tabela = alvo === "kennel" ? "kennels" : alvo === "dog" ? "dogs" : "kennel_litters";
  const { data: atualizado } = await supabase
    .from(tabela)
    .update({ published_at: agora, auto_published_at: agora })
    .eq("id", id)
    .is("published_at", null)
    .is("auto_published_at", null)
    .select("id");

  // Zero linhas = outra requisição chegou primeiro. Não é erro, e não há o que
  // revalidar: quem publicou já revalidou.
  if (!atualizado || atualizado.length === 0) return;

  if (alvo === "kennel") {
    if (estado.slug) revalidateKennelPaths(estado.slug, id);
    // A REGRA DUPLA: ninhada já publicada só fica visível a partir de agora.
    for (const publicId of await publishedLitterPublicIds(supabase, id)) {
      revalidatePath(`/n/${publicId}`);
    }
    // O e-mail continua sendo ação DO USUÁRIO: foi ele quem preencheu o último
    // campo. A guarda 4 já garantiu que não é um admin agindo por ele.
    if (estado.ownerId) {
      await dispararCanilPublicado(estado.ownerId, {
        id,
        name: estado.nome ?? "",
        slug: estado.slug ?? "",
      });
    }
    return;
  }

  if (alvo === "dog") {
    if (estado.publicId) revalidateDogPaths(estado.publicId, id, estado.slug ?? null);
    return;
  }

  if (estado.publicId) revalidatePath(`/n/${estado.publicId}`);
  if (estado.slug) revalidatePath(`/c/${estado.slug}`);
}
