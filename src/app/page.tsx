/**
 * Placeholder do bootstrap. Existe para provar que o pipeline de tokens
 * resolve — nenhuma cor literal abaixo, só `bg-surface`, `text-fg-muted`, etc.
 * Será substituído pela home real.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-8 px-5 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">OrigemX</h1>
        <p className="text-fg-muted max-w-prose">
          Perfis de canis, pedigree de cinco gerações e identidade canina estável.
        </p>
      </div>

      <div className="border-border bg-surface rounded-card border p-5">
        <p className="text-fg-faint font-mono text-xs tracking-widest uppercase">Bootstrap</p>
        <p className="text-fg-muted mt-2 text-sm">
          Projeto inicializado. Schema versionado em{" "}
          <code className="text-fg font-mono">supabase/migrations/</code>, ainda não aplicado.
        </p>
      </div>
    </main>
  );
}
