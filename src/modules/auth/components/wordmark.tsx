/**
 * Assinatura tipográfica do OrigemX.
 *
 * O X carrega o gradiente azul→violeta, como no logo do manual. Fica isolado
 * aqui para o gradiente existir num lugar só — se a marca mudar, muda aqui.
 *
 * O gradiente é ornamento sobre uma letra que também aparece no texto ao lado,
 * então não há perda de informação para quem não enxerga cor.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-display font-semibold tracking-tight">Origem</span>
      <span className="font-display text-brand-gradient font-bold tracking-tight">X</span>
    </span>
  );
}
