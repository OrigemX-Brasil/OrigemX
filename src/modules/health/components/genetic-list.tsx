import { isoToBr } from "@/modules/dogs/br-date";

import type { GeneticTest } from "../queries";

/**
 * Lista pública de exames genéticos de UM cão.
 *
 * Server component, sem interatividade. Usada nos dois lugares onde o laudo
 * aparece para visitante: a seção do próprio cão em `/d/[public_id]` e o bloco
 * por progenitor em `/n/[public_id]`. Uma implementação só, para as duas não
 * divergirem em formato — foi por isso que saiu de dentro do `GeneticBlock`.
 *
 * NÃO decide visibilidade. Quem decide é a RLS: `dog_genetic_tests_select`
 * encadeia um `exists` em `public.dogs`, que roda sob a policy de quem
 * consulta — e as páginas públicas sempre consultam com o client ANÔNIMO.
 * Exame de cão em rascunho simplesmente não chega até aqui.
 */
export function GeneticList({ tests }: { tests: readonly GeneticTest[] }) {
  if (tests.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {tests.map((test) => (
        <li key={test.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-fg-muted text-sm">{test.name}</span>
          <span className="text-data font-mono text-sm font-medium">{test.result}</span>
          {test.tested_on ? (
            <span className="text-fg-faint font-mono text-xs tabular-nums">
              {isoToBr(test.tested_on)}
            </span>
          ) : null}
          {test.lab ? <span className="text-fg-faint text-xs">{test.lab}</span> : null}
        </li>
      ))}
    </ul>
  );
}
