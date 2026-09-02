/** Loading do envio de logo em nome do dono. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="bg-surface-hover h-4 w-24 animate-pulse rounded" />
        <div className="bg-surface-hover h-7 w-40 animate-pulse rounded" />
      </div>

      <div className="border-border bg-surface rounded-card h-32 animate-pulse border" />
      <div className="border-border bg-surface rounded-card h-16 animate-pulse border" />

      <div className="flex flex-col gap-2">
        <div className="bg-surface-hover h-3 w-20 animate-pulse rounded" />
        <div className="bg-surface-hover rounded-control h-16 w-full animate-pulse" />
      </div>
    </div>
  );
}
