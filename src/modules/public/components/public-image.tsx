/**
 * Imagem de página pública, com placeholder obrigatório.
 *
 * REGRA: a página NUNCA quebra por causa de imagem. Se não houver URL — porque
 * o Storage falhou, porque o objeto está no bucket errado, porque a linha ficou
 * dessincronizada — entra um bloco neutro com a inicial do nome. Nome, raça,
 * registro e pedigree valem mais que a foto.
 *
 * `<img>` PURO, e não `next/image`, nas páginas públicas.
 *
 * O componente do Next era usado com `unoptimized`, porque as imagens já sobem
 * comprimidas em WebP nos dois tamanhos que a tela usa (320 e 1600) — o
 * otimizador re-encodaria o que já está ótimo e ainda somaria um salto antes do
 * CDN. Com ele desligado, o que sobrava era o runtime do componente: peso sem
 * contrapartida numa página que abre por QR em 4G de feira.
 *
 * O que o `next/image` dava e continua garantido aqui, à mão: `width`/`height`
 * explícitos (sem eles o layout salta quando a foto chega), `loading="lazy"`
 * fora da primeira imagem, e `fetchPriority` na que é o LCP.
 *
 * O painel autenticado segue usando `next/image` — lá a rede não é o gargalo e
 * não vale manter duas implementações por gosto.
 */
export function PublicImage({
  src,
  alt,
  fallbackText,
  width,
  height,
  priority = false,
  className,
  sizes,
}: {
  src: string | null | undefined;
  alt: string;
  fallbackText: string;
  width: number;
  height: number;
  /** Só na imagem principal — ela é o LCP. O resto entra com lazy. */
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  if (!src) {
    return (
      <div
        style={{ width, height }}
        aria-hidden="true"
        className={`bg-surface-hover text-fg-faint flex shrink-0 items-center justify-center font-display text-2xl ${className ?? ""}`}
      >
        {fallbackText.trim().charAt(0).toUpperCase() || "·"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      // Dimensão explícita em toda imagem: sem isso o layout salta quando a
      // foto carrega, e em 4G lento o salto acontece com o usuário já lendo.
      width={width}
      height={height}
      sizes={sizes}
      // A principal é o LCP: carrega cedo e com prioridade. O resto espera
      // entrar na viewport.
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding={priority ? "sync" : "async"}
      className={className}
    />
  );
}
