import Image from "next/image";

/**
 * Imagem de página pública, com placeholder obrigatório.
 *
 * REGRA: a página NUNCA quebra por causa de imagem. Se não houver URL — porque
 * o Storage falhou, porque o objeto está no bucket errado, porque a linha ficou
 * dessincronizada — entra um bloco neutro com a inicial do nome. Nome, raça,
 * registro e pedigree valem mais que a foto.
 *
 * `unoptimized`: as imagens já sobem comprimidas em WebP, em dois tamanhos
 * (320 e 1600). O otimizador do Next re-encodaria o que já está ótimo e
 * somaria um salto antes do CDN.
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
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      // Dimensão explícita em toda imagem: sem isso o layout salta quando a
      // foto carrega, e em 4G lento o salto acontece com o usuário já lendo.
      priority={priority}
      loading={priority ? undefined : "lazy"}
      unoptimized
      className={className}
    />
  );
}
