/**
 * Loading state das seções de listagem — não existe precedente nenhum no
 * projeto (zero `loading.tsx`, zero `Suspense`, zero skeleton em toda a
 * árvore), então não dá para copiar um padrão existente. O que dá é usar só
 * o que já existe: tokens (`bg-surface-hover`, `border-border`) e o
 * `animate-pulse` que o Tailwind já traz de fábrica — nenhuma lib nova.
 *
 * A forma imita a página real (eyebrow + título + filtro + linhas) para não
 * pular de tamanho quando o dado chega — mesmo motivo que fez o painel de
 * busca manter a altura durante o carregamento (`kennel-search-panel.tsx`).
 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="bg-surface-hover h-3 w-16 animate-pulse rounded" />
        <div className="bg-surface-hover h-7 w-48 animate-pulse rounded" />
      </div>

      <div className="bg-surface-hover rounded-control h-10 w-full max-w-xs animate-pulse" />

      <div className="border-border bg-surface rounded-card divide-border divide-y border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="bg-surface-hover h-4 w-1/3 animate-pulse rounded" />
            <div className="bg-surface-hover h-4 w-1/5 animate-pulse rounded" />
            <div className="bg-surface-hover ml-auto h-4 w-16 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
