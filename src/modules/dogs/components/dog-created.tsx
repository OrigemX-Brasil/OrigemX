"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { publishDog, type PublishState } from "@/modules/media/publish";

/**
 * ============================================================================
 * Tela de sucesso do cadastro de cão.
 * ============================================================================
 *
 * POR QUE ELA EXISTE: `createDog` mandava o criador direto para a página de
 * EDIÇÃO — o mesmo formulário que ele acabou de preencher, sem confirmação
 * nenhuma. Somado ao fato de o cão nascer em RASCUNHO (`createDog` não escreve
 * `published_at`), o resultado era cadastrar e não ver nada pronto: nem o que
 * foi criado, nem link para mostrar a alguém.
 *
 * O CÃO CONTINUA NASCENDO EM RASCUNHO, e é decisão de produto, não omissão.
 * Publicar automaticamente foi considerado e recusado por três motivos:
 *
 *   1. Publicar NÃO é um flag — `publishDog` move os arquivos para o bucket
 *      público antes de gravar `published_at`, e despublicar tem janela de CDN
 *      de até uma hora. Publicar por engano não se desfaz na hora.
 *   2. Só `name` e `sex` são obrigatórios, então o cão recém-criado não tem
 *      foto, raça nem progenitores. Publicar isso automaticamente produziria um
 *      perfil público VAZIO — o oposto de "pronto".
 *   3. O público são criadores que não esperam que salvar signifique publicar.
 *
 * O que esta tela remove não é o clique de publicar: é a NAVEGAÇÃO até ele. O
 * botão vivia enterrado no meio do formulário de edição; aqui é a ação
 * primária, no lugar óbvio.
 *
 * DUAS ETAPAS, e o motivo é técnico: `navigator.share` exige gesto do usuário,
 * e o gesto se perde na ida e volta da Server Action. Publicar e compartilhar
 * no mesmo clique seria bloqueado pelo navegador. Então publicar revela o
 * compartilhar, que é o clique seguinte — e que precisaria existir de qualquer
 * forma.
 */

type Props = {
  dogId: string;
  name: string;
  breed: string | null;
  sex: string;
  publicId: string;
  /** URL pública ABSOLUTA, vinda de `qrTargetUrl` — a mesma que o QR codifica. */
  publicUrl: string;
  coverUrl: string | null;
  isPublished: boolean;
};

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

export function DogCreated({
  dogId,
  name,
  breed,
  sex,
  publicId,
  publicUrl,
  coverUrl,
  isPublished,
}: Props) {
  const [state, formAction] = useActionState<PublishState, FormData>(
    async (_prev, formData) => publishDog(formData),
    {},
  );

  // DERIVADO, não estado sincronizado por efeito. `isPublished` é o que o
  // servidor sabia ao renderizar; `state.ok` é a resposta da ação nesta mesma
  // tela. A soma dos dois é a verdade agora, e calcular vale mais barato do que
  // um `useState` que um `useEffect` teria de manter em dia.
  //
  // Não há `router.refresh()` aqui de propósito: `publishDog` já revalida
  // `/painel/caes/[id]` e `/d/[public_id]`, que são os destinos dos links desta
  // página, e recarregar esta rota só para reler um booleano que já está certo
  // seria uma ida ao servidor sem consequência visível.
  const publicado = isPublished || state.ok === true;

  return (
    <div className="flex flex-col gap-8">
      <Cabecalho name={name} sex={sex} publicado={publicado} />

      <section className="border-border bg-surface rounded-card flex flex-col gap-5 border p-5">
        <Previa name={name} breed={breed} sex={sex} coverUrl={coverUrl} publicado={publicado} />

        {state.error ? (
          <p
            role="alert"
            className="border-danger-subtle bg-danger-subtle text-fg rounded-control border px-3 py-2.5 text-sm"
          >
            {state.error}
          </p>
        ) : null}

        <Acoes
          dogId={dogId}
          name={name}
          publicId={publicId}
          publicUrl={publicUrl}
          publicado={publicado}
          formAction={formAction}
        />
      </section>

      {!coverUrl ? (
        <p className="border-border bg-surface rounded-card text-fg-muted border px-5 py-4 text-sm">
          Este cão ainda não tem foto. A foto é a primeira coisa que quem abre o link procura — vale
          adicionar uma antes de divulgar.{" "}
          <Link
            href={`/painel/caes/${dogId}`}
            className="text-link hover:text-link-hover underline underline-offset-4 transition-colors"
          >
            Adicionar agora
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function Cabecalho({ name, sex, publicado }: { name: string; sex: string; publicado: boolean }) {
  // CONCORDÂNCIA DE GÊNERO com o cão, não com a palavra "cão": metade dos
  // registros é fêmea, e "Aurora foi cadastrado" é o tipo de erro que faz o
  // produto parecer estrangeiro para quem lê. O particípio concorda com o
  // NOME, que é o sujeito da frase.
  const cadastrado = sex === "female" ? "cadastrada" : "cadastrado";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-success flex items-center gap-2 font-mono text-xs tracking-[0.2em] uppercase">
        <svg
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Cadastrado
      </span>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {publicado ? `${name} está no ar` : `${name} foi ${cadastrado}`}
      </h1>
      <p className="text-fg-muted text-sm">
        {publicado
          ? "O perfil está público. Compartilhe o link ou leve o QR Code para o material impresso."
          : "O cadastro está salvo como rascunho — ninguém além de você consegue abri-lo ainda."}
      </p>
    </div>
  );
}

function Previa({
  name,
  breed,
  sex,
  coverUrl,
  publicado,
}: {
  name: string;
  breed: string | null;
  sex: string;
  coverUrl: string | null;
  publicado: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      {/* `next/image` com `unoptimized`, como o resto do painel: a foto já sobe
          comprimida em WebP nos dois tamanhos que as telas usam. */}
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={name}
          width={96}
          height={96}
          unoptimized
          className="border-border rounded-card size-20 shrink-0 border object-cover sm:size-24"
        />
      ) : (
        <div
          aria-hidden="true"
          className="bg-surface-hover text-fg-faint font-display border-border rounded-card flex size-20 shrink-0 items-center justify-center border text-2xl sm:size-24"
        >
          {name.trim().charAt(0).toUpperCase() || "."}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-fg font-medium">{name}</span>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="border-border-strong bg-surface-raised text-fg-muted rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-xs font-medium">
            <span aria-hidden="true">{sex === "female" ? "♀" : "♂"}</span>
            {SEX_LABEL[sex] ?? "—"}
          </span>
          {breed ? (
            <span className="border-border-strong bg-surface-raised text-fg-muted rounded-control border px-2 py-0.5 text-xs">
              {breed}
            </span>
          ) : (
            <span className="text-fg-faint text-xs">Raça não informada</span>
          )}
        </div>

        <EstadoChip publicado={publicado} />
      </div>
    </div>
  );
}

/**
 * O estado dito por TEXTO, não só por cor — e `role="status"` para a mudança
 * depois de publicar ser anunciada a quem usa leitor de tela.
 */
function EstadoChip({ publicado }: { publicado: boolean }) {
  return (
    <span
      role="status"
      className={
        publicado
          ? "border-success/40 bg-success-subtle text-success rounded-control inline-flex w-fit items-center gap-1.5 border px-2.5 py-1 text-xs font-medium"
          : "border-border-strong bg-surface-raised text-fg-muted rounded-control inline-flex w-fit items-center gap-1.5 border px-2.5 py-1 text-xs font-medium"
      }
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${publicado ? "bg-success" : "bg-fg-faint"}`}
      />
      {publicado ? "Publicado — qualquer pessoa pode abrir" : "Rascunho — só você vê"}
    </span>
  );
}

function Acoes({
  dogId,
  name,
  publicId,
  publicUrl,
  publicado,
  formAction,
}: {
  dogId: string;
  name: string;
  publicId: string;
  publicUrl: string;
  publicado: boolean;
  formAction: (formData: FormData) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {publicado ? (
          <ShareButton name={name} publicUrl={publicUrl} />
        ) : (
          <form action={formAction} className="contents">
            <input type="hidden" name="id" value={dogId} />
            <PublicarSubmit />
          </form>
        )}

        {publicado ? (
          <Link
            href={`/d/${publicId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border-strong text-fg hover:bg-surface-hover rounded-control focus-visible:outline-ring border px-4 py-2.5 text-center text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Ver perfil
          </Link>
        ) : (
          // NÃO é link nem botão desabilitado: é texto. Um `<a aria-disabled>`
          // continua sendo alvo de clique em alguns navegadores, e o destino
          // aqui daria 404 enquanto o cão for rascunho.
          <span className="border-border text-fg-faint rounded-control cursor-not-allowed border px-4 py-2.5 text-center text-sm font-medium">
            Ver perfil
          </span>
        )}
      </div>

      {!publicado ? (
        <p className="text-fg-faint text-xs">
          Ver perfil e compartilhar ficam disponíveis depois de publicar. Publicar move as fotos
          para um endereço permanente — é o que faz o QR Code impresso continuar funcionando.
        </p>
      ) : null}

      <LinkPublico publicUrl={publicUrl} publicado={publicado} />

      <Link
        href={`/painel/caes/${dogId}`}
        className="text-link hover:text-link-hover w-fit text-sm underline underline-offset-4 transition-colors"
      >
        Adicionar foto e mais informações
      </Link>
    </div>
  );
}

function PublicarSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Publicando…" : "Publicar e compartilhar"}
    </button>
  );
}

/**
 * Compartilhar em cascata: o compartilhamento nativo do celular quando existe,
 * a área de transferência quando não, e — sempre — a URL visível logo abaixo
 * para copiar à mão. Os dois primeiros exigem contexto seguro (HTTPS), então
 * nenhum deles pode ser o único caminho.
 */
function ShareButton({ name, publicUrl }: { name: string; publicUrl: string }) {
  const [aviso, setAviso] = useState<string | null>(null);

  async function compartilhar() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: name, url: publicUrl });
        return;
      } catch {
        // Cancelar o menu do sistema cai aqui, e cancelar não é erro: segue
        // para a cópia, que é útil de qualquer jeito.
      }
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      setAviso("Link copiado.");
    } catch {
      setAviso("Não foi possível copiar. Selecione o endereço abaixo e copie.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={compartilhar}
        className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        Compartilhar link
      </button>

      {/* Fora do botão: a região `aria-live` precisa já estar no DOM quando o
          texto chega, senão o leitor de tela não anuncia a mudança. */}
      <span role="status" aria-live="polite" className="text-fg-muted text-xs sm:ml-1">
        {aviso}
      </span>
    </>
  );
}

function LinkPublico({ publicUrl, publicado }: { publicUrl: string; publicado: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-fg-faint text-xs">
        {publicado ? "Endereço público" : "Endereço público (depois de publicar)"}
      </span>
      <input
        type="text"
        readOnly
        value={publicUrl}
        aria-label="Endereço público do cão"
        onFocus={(e) => e.currentTarget.select()}
        className="border-border-strong bg-bg text-fg-muted rounded-control focus-visible:border-accent w-full border px-3 py-2 font-mono text-xs outline-none transition-colors"
      />
    </div>
  );
}
