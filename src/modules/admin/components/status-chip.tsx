/**
 * Selo de status para as listagens administrativas — reusado em
 * Usuários/Canis/Cães. Tom por severidade, dentro do vocabulário de cor que
 * já existe (nenhuma cor nova): excluído é o mais forte (`danger`, mesma cor
 * de erro de formulário), oculto é notável mas reversível (`secondary`),
 * publicado é o estado bom (`success`), rascunho/fantasma são neutros.
 */
const TONE_CLASS = {
  neutral: "text-fg-faint border-border border",
  danger: "text-danger bg-danger-subtle",
  secondary: "text-secondary-text bg-secondary-subtle",
  success: "text-success bg-success-subtle",
} as const;

export function StatusChip({
  tone,
  children,
}: {
  tone: keyof typeof TONE_CLASS;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-control px-2 py-0.5 font-mono text-[0.65rem] tracking-wider uppercase ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
