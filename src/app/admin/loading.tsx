/**
 * Loading da Visão geral — forma própria (duas grades de cartões + três
 * painéis), diferente de `ListSkeleton` porque a página real também é.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="bg-surface-hover h-3 w-16 animate-pulse rounded" />
        <div className="bg-surface-hover h-7 w-40 animate-pulse rounded" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border-border bg-surface rounded-card flex flex-col gap-2 border p-5">
            <div className="bg-surface-hover h-4 w-16 animate-pulse rounded" />
            <div className="bg-surface-hover h-8 w-12 animate-pulse rounded" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="border-border bg-surface rounded-card flex flex-col gap-2 border p-5">
            <div className="bg-surface-hover h-4 w-24 animate-pulse rounded" />
            <div className="bg-surface-hover h-8 w-20 animate-pulse rounded" />
          </div>
        ))}
      </div>

      <div className="border-border bg-surface rounded-card flex flex-col gap-3 border p-5">
        <div className="bg-surface-hover h-5 w-40 animate-pulse rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-surface-hover h-4 w-full animate-pulse rounded" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="border-border bg-surface rounded-card flex flex-col gap-3 border p-5">
            <div className="bg-surface-hover h-5 w-32 animate-pulse rounded" />
            {Array.from({ length: 4 }).map((__, j) => (
              <div key={j} className="bg-surface-hover h-4 w-full animate-pulse rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
