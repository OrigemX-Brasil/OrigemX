/**
 * Mesma caixa de vazio que `/painel/canis` e `/painel/caes` já usam —
 * extraída aqui porque se repete idêntica em cinco seções do admin.
 */
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-border bg-surface rounded-card flex flex-col items-start gap-3 border p-6">
      <p className="text-fg text-sm font-medium">{title}</p>
      {description ? <p className="text-fg-muted text-sm">{description}</p> : null}
    </div>
  );
}
