/** Loading do formulário de cadastro de canil em nome do dono. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="bg-surface-hover h-4 w-24 animate-pulse rounded" />
        <div className="bg-surface-hover h-7 w-48 animate-pulse rounded" />
      </div>

      <div className="border-border bg-surface rounded-card h-32 animate-pulse border" />

      <div className="flex flex-col gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="bg-surface-hover h-3 w-20 animate-pulse rounded" />
            <div className="bg-surface-hover rounded-control h-11 w-full animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
