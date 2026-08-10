"use client";

import { AnimatePresence, domAnimation, LazyMotion, m, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { PublicKennel } from "@/modules/public/queries";
import { overlayVariants, panelVariants, resultVariants } from "@/modules/search/motion";

import { CloseIcon, SearchIcon } from "./search-icons";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
/** Teto de segurança do fechamento — ver `requestClose`. */
const EXIT_FAILSAFE_MS = 400;
/** `sm` do Tailwind v4. Decide o formato do painel — ver `panelVariants`. */
const WIDE_MQ = "(min-width: 40rem)";

type Status = "loading" | "success" | "empty" | "error";

/**
 * ============================================================================
 * Painel da busca de canis — o `<dialog>` animado.
 * ============================================================================
 *
 * CARREGADO SOB DEMANDA. Este módulo é o único que importa a framer-motion, e
 * `kennel-search.tsx` só o traz por `next/dynamic` quando o usuário abre a
 * busca. É o que mantém o cabeçalho de `/c/[slug]` e `/d/[public_id]` — as
 * páginas que abrem por QR impresso em 4G de feira — sem pagar nada por uma
 * animação que talvez ninguém veja.
 *
 * `LazyMotion` + `domAnimation` + `m` no lugar de `motion`: ~6KB em vez de
 * ~34KB. O `strict` faz um `motion.div` acidental estourar em desenvolvimento,
 * que é o que impede alguém de reintroduzir o pacote inteiro sem perceber.
 *
 * ----------------------------------------------------------------------------
 * POR QUE ESTE DIÁLOGO FECHA DIFERENTE DO `photo-lightbox.tsx`
 * ----------------------------------------------------------------------------
 * `dialog.close()` faz o navegador aplicar `display: none` NA HORA. Chamado
 * direto, a animação de saída simplesmente nunca acontece — o elemento some
 * antes do primeiro quadro. Por isso o fechamento aqui tem duas etapas:
 *
 *   requestClose()  → `visible = false`, o dialog CONTINUA aberto
 *                     (foco preso e Escape seguem valendo durante a saída)
 *                   → a framer-motion anima
 *   onExitComplete  → aí sim `dialog.close()`, que devolve o foco ao gatilho
 *
 * E `onCancel` + `preventDefault()` é o que intercepta o Escape: sem isso o
 * navegador fecha instantaneamente e a saída não roda. Se alguém "consertar" a
 * inconsistência com o lightbox apagando essa interceptação, a animação de
 * saída morre junto.
 */
export function KennelSearchPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion() ?? false;

  /** Intenção (do pai) vs. o que está pintado. Só `visible` guia a animação. */
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("empty");
  const [results, setResults] = useState<PublicKennel[]>([]);
  /** Escalona só a PRIMEIRA lista de cada abertura — ver `motion.ts`. */
  const [stagger, setStagger] = useState(true);

  // O sheet do mobile e o dropdown do desktop animam diferente (o de baixo de
  // `sm` não pode usar `scale`). Inicial por `useState` preguiçoso, o que só é
  // seguro porque este componente é `ssr: false` — no servidor não há `window`.
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_MQ).matches);

  // Estado "ocioso" é derivado, não guardado: guardá-lo exigiria um `setState`
  // síncrono no corpo do efeito de busca (proibido — cascata de renders).
  const isIdle = query.trim().length < MIN_QUERY_LENGTH;

  const staggeredRef = useRef(false);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Assinatura de um sistema externo — girar o celular com o painel montado
  // trocaria o formato sem isto. `setState` aqui é no CALLBACK da inscrição,
  // não no corpo do efeito, que é justamente o uso legítimo.
  useEffect(() => {
    const mq = window.matchMedia(WIDE_MQ);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /** Reconcilia o estado do React com um fato do DOM. NUNCA chama close(). */
  const hardClose = useCallback(() => {
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    failsafeRef.current = null;
    setVisible(false);
    onOpenChange(false);
  }, [onOpenChange]);

  /** Fim da animação de saída: agora sim o diálogo pode sumir. */
  const finishClose = useCallback(() => {
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    failsafeRef.current = null;
    dialogRef.current?.close();
  }, []);

  const requestClose = useCallback(() => {
    setVisible(false);
    // Rede de segurança: se `onExitComplete` não disparar — aba em segundo
    // plano pausando o rAF, variant que não anima nada — o diálogo ficaria
    // `showModal()`'d e a PÁGINA INTEIRA travaria atrás de um modal invisível.
    // É o modo de falha de maior alcance aqui, então não é opcional.
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    failsafeRef.current = setTimeout(() => dialogRef.current?.close(), EXIT_FAILSAFE_MS);
  }, []);

  // `useLayoutEffect`: `showModal()` precisa acontecer no mesmo quadro em que
  // os filhos montam com `initial="hidden"`, senão o painel pisca já visível.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      staggeredRef.current = false;
      dialog.showModal();
      setVisible(true);
    }
  }, [open]);

  useEffect(() => () => {
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus("loading");
      fetch(`/api/search/kennels?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("busca falhou");
          return res.json() as Promise<{ items: PublicKennel[] }>;
        })
        .then(({ items }) => {
          setResults(items);
          setStatus(items.length === 0 ? "empty" : "success");
          // Decidido AQUI, num callback, e não durante o render: mutar ref
          // enquanto renderiza quebra sob StrictMode/render duplo.
          setStagger(!staggeredRef.current);
          if (items.length > 0) staggeredRef.current = true;
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setStatus("error");
        });
    }, DEBOUNCE_MS);

    // Resposta mais lenta não pode sobrescrever um resultado mais novo: o
    // timer anterior nunca dispara, e a requisição em voo é abortada.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const goToResults = () => {
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH) return;
    // Não espera a animação: seriam ~160ms mortos em toda busca. O painel sai
    // enquanto o Next já navega.
    requestClose();
    router.push(`/busca?q=${encodeURIComponent(term)}`);
  };

  return (
    <LazyMotion features={domAnimation} strict>
      {/*
        Do tamanho da viewport, como o `photo-lightbox.tsx` e pelo mesmo
        motivo: clicar fora precisa fechar, e o truque padrão é
        `e.target === e.currentTarget` — só verdadeiro quando o clique cai no
        PRÓPRIO dialog. Se ele tivesse o tamanho do painel, "fora" nunca seria
        alcançado.

        `hidden … open:flex` continua: a classe de folha-de-estilo de autor
        vence o `display:none` que o navegador dá a `dialog` fechado (origem
        author > UA na cascata). Sem isso o painel fica visível sempre.

        `backdrop:bg-transparent` porque a penumbra é pintada por um `<m.div>`
        nosso — o `::backdrop` nativo não teria como desvanecer junto.
      */}
      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          requestClose();
        }}
        onClose={hardClose}
        onClick={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
        aria-label="Buscar canil"
        className="fixed inset-0 m-0 hidden h-dvh max-h-none w-dvw max-w-none items-start justify-center border-0 bg-transparent p-0 backdrop:bg-transparent open:flex sm:justify-end sm:pt-16 sm:pr-8"
      >
        <AnimatePresence onExitComplete={finishClose}>
          {visible ? (
            <m.div
              key="overlay"
              aria-hidden="true"
              variants={overlayVariants(reduced)}
              initial="hidden"
              animate="visible"
              exit="exit"
              // `pointer-events-none` é estrutural: deixa o clique no fundo
              // atravessar até o `<dialog>`, senão `e.target === e.currentTarget`
              // nunca seria verdade e clicar fora não fecharia.
              className="bg-overlay backdrop-blur-overlay pointer-events-none absolute inset-0"
            />
          ) : null}

          {visible ? (
            <m.div
              key="panel"
              variants={panelVariants(reduced, !wide)}
              initial="hidden"
              animate="visible"
              exit="exit"
              // O `backdrop-filter` MORA no mesmo elemento que a motion anima.
              // Se ficasse num filho de um elemento com `opacity` animada, o
              // vidro amostraria uma "backdrop root" vazia e ficaria preto
              // chapado durante toda a transição, estalando pra desfocado no
              // fim. Por isso overlay e painel são IRMÃOS, nunca aninhados.
              className="bg-surface supports-[backdrop-filter]:bg-glass backdrop-blur-panel border-border-glass shadow-panel inset-shadow-glass rounded-b-panel sm:rounded-panel relative flex max-h-[85dvh] w-full origin-top flex-col overflow-hidden border backdrop-saturate-150 sm:max-h-[28rem] sm:w-96 sm:origin-top-right"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  goToResults();
                }}
                // O foco vai na LINHA, não no input: assim o anel envolve a
                // lupa e o botão de fechar junto, em vez de cortar no meio do
                // campo. `--shadow-input-focus` já É o indicador de foco (anel
                // sólido de 2px, 3.96:1) — o `outline-transparent` existe só
                // para o modo de alto contraste, onde a sombra é descartada e
                // o outline vira cor de sistema.
                className="border-border-glass focus-within:shadow-input-focus ease-panel flex items-center gap-2 border-b p-3 transition-shadow duration-200 focus-within:outline-2 focus-within:outline-transparent motion-reduce:transition-none"
              >
                <SearchIcon className="text-fg-faint shrink-0" />
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar canil pelo nome..."
                  className="text-fg placeholder:text-fg-faint w-full bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Fechar busca"
                  className="text-fg-faint hover:text-fg focus-visible:outline-ring rounded-control ease-panel flex size-7 shrink-0 items-center justify-center transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <CloseIcon />
                </button>
              </form>

              {/*
                `min-h` + resultados anteriores esmaecidos durante `loading`.
                Antes a mensagem "Buscando..." SUBSTITUÍA a lista e a altura do
                painel pulava a cada tecla — parado dava pra tolerar; com o
                vidro e a animação, parece quebrado.
              */}
              <div className="min-h-[4.5rem] flex-1 overflow-y-auto p-2">
                {isIdle ? (
                  <p className="text-fg-faint px-3 py-4 text-sm">Digite ao menos 2 letras.</p>
                ) : null}

                {!isIdle && status === "error" ? (
                  <p className="text-fg-faint px-3 py-4 text-sm">
                    Não foi possível buscar agora. Tente de novo.
                  </p>
                ) : null}

                {!isIdle && status === "empty" ? (
                  <p className="text-fg-faint px-3 py-4 text-sm">Nenhum canil encontrado.</p>
                ) : null}

                {!isIdle && results.length > 0 && (status === "success" || status === "loading") ? (
                  <ul
                    className={`ease-panel flex flex-col gap-1 transition-opacity duration-200 motion-reduce:transition-none ${
                      status === "loading" ? "opacity-60" : "opacity-100"
                    }`}
                  >
                    {results.map((kennel, i) => (
                      <m.li
                        key={kennel.id}
                        variants={resultVariants(reduced, i, stagger)}
                        initial="hidden"
                        animate="visible"
                      >
                        <Link
                          href={`/c/${kennel.slug}`}
                          prefetch={false}
                          onClick={requestClose}
                          className="hover:bg-surface-hover focus-visible:outline-ring rounded-control ease-panel flex flex-col gap-0.5 px-3 py-2 transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2"
                        >
                          <span className="text-fg text-sm font-medium">{kennel.name}</span>
                          {kennel.city || kennel.state ? (
                            <span className="text-fg-faint text-xs">
                              {[kennel.city, kennel.state].filter(Boolean).join(", ")}
                            </span>
                          ) : null}
                        </Link>
                      </m.li>
                    ))}
                  </ul>
                ) : null}

                {!isIdle ? (
                  <Link
                    href={`/busca?q=${encodeURIComponent(query.trim())}`}
                    prefetch={false}
                    onClick={requestClose}
                    className="text-link hover:text-link-hover border-border-glass focus-visible:outline-ring ease-panel mt-1 block border-t px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2"
                  >
                    Ver todos os resultados →
                  </Link>
                ) : null}
              </div>
            </m.div>
          ) : null}
        </AnimatePresence>
      </dialog>
    </LazyMotion>
  );
}
