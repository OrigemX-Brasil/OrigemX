/**
 * Ícones da busca, num módulo próprio.
 *
 * A separação é de BUNDLE, não de estética: o gatilho da lupa fica no
 * cabeçalho de toda página pública (inclusive as que abrem por QR impresso) e
 * precisa renderizar sem arrastar o painel — que carrega a framer-motion. Se
 * os ícones morassem no painel, importar um puxaria a outra.
 *
 * SVG inline, como todo ícone do projeto: não há biblioteca de ícones aqui, e
 * não vai haver por causa de dois glifos. Traço herda `currentColor`.
 */

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
