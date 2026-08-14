"use client";

import { useState } from "react";

import { PublicImage } from "@/modules/public/components/public-image";

import { formatSeconds, streamIframeUrl } from "../constraints";

/**
 * ============================================================================
 * Player do vídeo do cão. Nada carrega antes do clique.
 * ============================================================================
 *
 * A página do cão abre por QR, em 4G de feira — é a mesma razão que fez
 * `PublicImage` abandonar `next/image` por peso de runtime. Um player embutido
 * de saída custaria, para TODO visitante, o script do player, o manifesto HLS e
 * o primeiro segmento de vídeo. Quem não assiste não pode pagar por isso.
 *
 * Então o que renderiza é um `<button>` com o poster. O `<iframe>` só entra no
 * DOM no `onClick`. Antes disso o custo da seção é UMA IMAGEM.
 *
 * SEM AUTOPLAY, nem no `allow` do iframe nem como parâmetro na URL (ver
 * `streamIframeUrl`). O visitante clica de novo, dentro do player, para tocar —
 * e isso é deliberado, não um clique esquecido: o iOS bloqueia reprodução
 * automática com som de qualquer forma, então `autoplay=true` daria
 * comportamento diferente por aparelho. Um controle que se comporta igual em
 * todo lugar vale mais que um clique economizado em metade deles.
 *
 * Usado nas DUAS telas: no perfil público e na prévia do painel. É o mesmo
 * player, então é o mesmo componente.
 */
export function DogVideo({
  providerUid,
  playbackOrigin,
  thumbnailUrl,
  durationSeconds,
  dogName,
}: {
  providerUid: string;
  playbackOrigin: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  dogName: string;
}) {
  const [tocando, setTocando] = useState(false);

  // Caixa 16:9 fixa nos dois estados. A proporção real do vídeo não é conhecida
  // antes de carregar, e o player do Cloudflare encaixa o vídeo dentro da caixa
  // do mesmo jeito que o `object-contain` do poster — então a moldura não muda
  // entre o cartaz e o filme, e não há salto de layout com vídeo em pé
  // (celular) nem deitado.
  const moldura = "border-border bg-surface-hover rounded-card relative aspect-video overflow-hidden border";

  if (tocando) {
    return (
      <div className={moldura}>
        <iframe
          src={streamIframeUrl({ playbackOrigin, providerUid, posterUrl: thumbnailUrl })}
          title={`Vídeo de ${dogName}`}
          loading="lazy"
          // `autoplay` NÃO entra nesta lista, ao contrário do embed padrão do
          // Cloudflare. É a permissão que deixaria o player tocar sozinho.
          allow="accelerometer; gyroscope; encrypted-media; picture-in-picture;"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTocando(true)}
      aria-label={`Reproduzir vídeo de ${dogName}`}
      className={`${moldura} focus-visible:outline-ring group w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      <PublicImage
        src={thumbnailUrl}
        alt=""
        fallbackText={dogName}
        // Só a proporção da CAIXA — o poster real entra com `object-contain`,
        // então vídeo em pé aparece inteiro, com barras, em vez de recortado.
        width={16}
        height={9}
        sizes="(max-width: 640px) 100vw, 640px"
        className="h-full w-full object-contain"
      />

      {/* Glifo sobre a imagem. `bg-bg/70` sobre foto arbitrária é a mesma
          receita dos controles do lightbox e do botão de legenda — contraste
          sem inventar linguagem nova. */}
      <span
        aria-hidden="true"
        className="bg-bg/70 group-hover:bg-bg/90 absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="text-fg ml-1 size-7">
          <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
        </svg>
      </span>

      {durationSeconds ? (
        <span
          aria-hidden="true"
          className="bg-bg/70 text-fg rounded-control absolute right-2 bottom-2 px-2 py-0.5 font-mono text-[11px] tabular-nums"
        >
          {formatSeconds(durationSeconds)}
        </span>
      ) : null}
    </button>
  );
}
