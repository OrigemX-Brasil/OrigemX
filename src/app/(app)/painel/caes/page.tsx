import type { Metadata } from "next";
import Link from "next/link";

import { getAuthUser } from "@/modules/auth/queries";
import { isGhostAncestor } from "@/modules/dogs/ancestors";
import { listMyDogs } from "@/modules/dogs/queries";
import { listMyKennels } from "@/modules/kennels/queries";

export const metadata: Metadata = { title: "Cães" };

const SEX_LABEL: Record<string, string> = { male: "Macho", female: "Fêmea" };

export default async function CaesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; canil?: string; cursor?: string }>;
}) {
  const { q, canil, cursor } = await searchParams;
  const user = await getAuthUser();
  if (!user) return null;

  const [{ items, nextCursor }, kennels] = await Promise.all([
    listMyDogs(user.id, { search: q ?? null, kennelId: canil ?? null }, { cursor }),
    listMyKennels(user.id, { limit: 100 }),
  ]);

  const queryFor = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (canil) sp.set("canil", canil);
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const s = sp.toString();
    return s ? `/painel/caes?${s}` : "/painel/caes";
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-fg-faint font-mono text-xs tracking-[0.2em] uppercase">Cães</span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Seus cães</h1>
        </div>
        <Link
          href="/painel/caes/novo"
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          Novo cão
        </Link>
      </div>

      {/* Busca e filtro por GET: a lista fica linkável e o botão voltar
          funciona, coisa que um filtro em estado de client perderia. */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "12rem" }}>
          <span className="text-fg-muted text-xs">Buscar por nome</span>
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Rex"
            className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-fg-muted text-xs">Canil</span>
          <select
            name="canil"
            defaultValue={canil ?? ""}
            className="border-border-strong bg-bg text-fg rounded-control border px-3 py-2 text-sm outline-none"
          >
            <option value="">Todos</option>
            {kennels.items.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="border-border-strong text-fg hover:bg-surface-hover rounded-control border px-4 py-2 text-sm transition-colors"
        >
          Filtrar
        </button>

        {q || canil ? (
          <Link
            href="/painel/caes"
            className="text-fg-muted hover:text-fg py-2 text-sm transition-colors"
          >
            Limpar
          </Link>
        ) : null}
      </form>

      {items.length === 0 ? (
        <div className="border-border bg-surface rounded-card flex flex-col items-start gap-3 border p-6">
          <p className="text-fg text-sm font-medium">
            {q || canil
              ? "Nenhum cão encontrado com esses filtros."
              : "Você ainda não cadastrou cães."}
          </p>
          {!q && !canil ? (
            <Link
              href="/painel/caes/novo"
              className="text-link hover:text-link-hover text-sm underline underline-offset-4 transition-colors"
            >
              Cadastrar o primeiro
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((dog) => (
            <li key={dog.id}>
              <Link
                href={`/painel/caes/${dog.id}`}
                className="border-border bg-surface hover:bg-surface-hover rounded-card flex flex-col gap-2 border p-5 transition-colors sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-fg font-medium">{dog.name}</span>
                  <span className="text-fg-faint font-mono text-xs">
                    {[SEX_LABEL[dog.sex], dog.breed, dog.born_on?.slice(0, 4)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {/* Fantasma é registro de árvore, não animal do criador —
                      dizer isso na lista evita que ele tente gerenciá-lo. */}
                  {isGhostAncestor(dog) ? (
                    <span className="border-border text-fg-faint rounded-control border px-2 py-0.5 text-xs">
                      Ancestral
                    </span>
                  ) : dog.published_at ? (
                    <span className="text-fg-faint text-xs">Publicado</span>
                  ) : (
                    <span className="text-fg-faint text-xs">Rascunho</span>
                  )}
                  <span className="text-fg-faint font-mono text-xs">{dog.public_id}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <Link
          href={queryFor({ cursor: nextCursor })}
          className="text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors"
        >
          Carregar mais
        </Link>
      ) : null}
    </div>
  );
}
