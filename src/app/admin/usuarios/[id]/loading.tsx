/** Loading do detalhe de usuário — forma própria, cabeçalho + linhas + duas contagens. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <div className="bg-surface-hover h-4 w-20 animate-pulse rounded" />

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="bg-surface-hover h-3 w-16 animate-pulse rounded" />
          <div className="bg-surface-hover h-7 w-48 animate-pulse rounded" />
        </div>
        <div className="bg-surface-hover rounded-control h-10 w-28 animate-pulse" />
      </div>

      <div className="border-border bg-surface rounded-card flex flex-col gap-4 border p-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-surface-hover h-4 w-full animate-pulse rounded" />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="border-border bg-surface rounded-card flex flex-col gap-2 border p-5">
            <div className="bg-surface-hover h-4 w-16 animate-pulse rounded" />
            <div className="bg-surface-hover h-8 w-12 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
