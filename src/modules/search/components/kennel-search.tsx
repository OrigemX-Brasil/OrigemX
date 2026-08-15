"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { SearchIcon } from "./search-icons";

/**
 * ============================================================================
 * Lupa do cabeçalho — o GATILHO, e só ele.
 * ============================================================================
 *
 * Este arquivo está no bundle de toda página que tem cabeçalho, incluindo
 * `/c/[slug]` e `/d/[public_id]` — as que abrem por QR Code impresso, em 4G
 * disputado de feira. Por isso ele é deliberadamente magro: um `<button>`, um
 * SVG e nada mais.
 *
 * TODO O PESO MORA NO PAINEL (`kennel-search-panel.tsx`), que carrega a
 * framer-motion e só é baixado quando alguém realmente abre a busca. Quem
 * escaneou um QR para ver o pedigree de um cão não paga por uma animação que
 * talvez nunca veja.
 *
 * A micro-interação da lupa é CSS puro pelo mesmo motivo: ela precisa
 * funcionar ANTES de qualquer JavaScript de animação existir na página.
 *
 * ⚠️ NÃO importar nada de `framer-motion` nem de `./motion` aqui. Qualquer um
 * dos dois anula o code-splitting inteiro e joga a lib no carregamento das
 * páginas de QR. O `next build` é a checagem: o peso dessas rotas não pode
 * subir.
 */

const KennelSearchPanel = dynamic(
  () => import("./kennel-search-panel").then((m) => m.KennelSearchPanel),
  { ssr: false },
);

/**
 * Aquece o chunk antes do clique. Precisa ser uma segunda expressão `import()`
 * com o MESMO especificador: o bundler resolve as duas para o mesmo arquivo e
 * o registro de módulos deduplica em tempo de execução — o transform do
 * `next/dynamic` exige o `import()` literal lá dentro, então não dá para
 * reaproveitar a mesma referência.
 */
const warmPanel = () => {
  void import("./kennel-search-panel");
};

export function KennelSearch() {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const openSearch = () => {
    setLoaded(true);
    setOpen(true);
    // Se o chunk ainda não chegou, `dynamic` renderiza nada — sem isto o toque
    // pareceria simplesmente ignorado. `cursor-progress` + `aria-busy` é o
    // mínimo honesto; um spinner exigiria um keyframe no bundle estático.
    setPending(true);
    void import("./kennel-search-panel").then(() => setPending(false));
  };

  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        // Três gatilhos de aquecimento porque cada um cobre um jeito de
        // chegar: mouse parado em cima, tab do teclado, e `touchstart` — que
        // no celular dispara ~80-150ms antes do `click` e é a única janela que
        // um visitante de QR tem.
        onPointerEnter={warmPanel}
        onFocus={warmPanel}
        onTouchStart={warmPanel}
        aria-label="Buscar canil ou cão"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={pending}
        className={`group text-fg-muted hover:text-fg focus-visible:outline-ring rounded-control ease-panel flex size-9 items-center justify-center transition-[color,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100 ${
          pending ? "cursor-progress opacity-60" : ""
        }`}
      >
        <SearchIcon className="ease-panel transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transform-none motion-reduce:transition-none" />
      </button>

      {/*
        Monta na primeira abertura e NUNCA desmonta. É o que torna a animação
        de saída possível: se o painel sumisse quando `open` vira false, o
        React arrancaria o DOM antes do primeiro quadro da saída. Fechado, um
        `<dialog>` é `display:none` — custo praticamente zero.
      */}
      {loaded ? <KennelSearchPanel open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
