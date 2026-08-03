/**
 * Pixel de medição da página de captura.
 *
 * Um `<img>` de 1×1 e nada mais. Sem JavaScript, sem cookie, sem biblioteca:
 * funciona com script desligado e não adia nem um milissegundo da pintura da
 * página.
 *
 * NÃO PODE SER `loading="lazy"`: um pixel adiado só dispara quando entra na
 * viewport, e este fica no fim do documento — em visita curta, que é a regra de
 * quem escaneia QR, o acesso simplesmente não seria contado.
 *
 * Também não pode ser `display: none`. Parte dos navegadores pula o download de
 * imagem escondida assim; largura e altura de um pixel com opacidade zero é
 * invisível na prática e continua sendo carregado.
 */
export function MeasurePixel() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/api/e"
      alt=""
      width={1}
      height={1}
      decoding="async"
      aria-hidden="true"
      className="pointer-events-none absolute h-px w-px opacity-0"
    />
  );
}
