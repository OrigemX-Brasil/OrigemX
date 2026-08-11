import { AdminNav } from "@/modules/admin/components/admin-nav";
import { requireAdmin } from "@/modules/auth/queries";

/**
 * Casca da área administrativa.
 *
 * `requireAdmin()` é o portão inteiro: sessão, role e não-suspensão, relidos
 * do banco a cada request. Nada abaixo deste layout renderiza sem passar por
 * ele, e o redirect acontece ANTES de qualquer filho montar — não existe
 * caminho onde markup ou dado de admin chega a quem não pode.
 *
 * `AdminNav` é o ÚNICO client island do shell (precisa de `usePathname()`
 * para o item ativo e de estado para a gaveta mobile) — este layout continua
 * Server Component, e toda página de seção também.
 *
 * SEM `max-w-3xl`: ao lado de uma sidebar, coluna central estreita não faz
 * sentido para lista/tabela densa — diferente de `(app)/layout.tsx`, que é
 * área de leitura de uma coisa só por vez.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-col sm:flex-row">
      <AdminNav />
      <main className="min-w-0 flex-1 overflow-x-hidden px-5 py-8 lg:px-8">{children}</main>
    </div>
  );
}
