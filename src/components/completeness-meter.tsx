import { completenessLevel } from "@/modules/kennels/completeness";

/**
 * Indicador de completude cadastral.
 *
 * A barra é reforço visual, nunca o único canal: o percentual aparece em texto
 * e o que falta vem listado por nome. Quem não distingue a cor da barra
 * continua sabendo exatamente o que fazer.
 *
 * COMPARTILHADO entre canil e cão, e por isso mora em `src/components/` e não
 * dentro de um módulo: nasceu em `modules/kennels/components/`, e deixá-lo lá
 * faria o módulo de cão importar do de canil só para desenhar uma barra.
 *
 * As listas são TIPO ESTRUTURAL (`{ label: string }`), não `KennelField[]`:
 * é tudo que este componente lê de cada campo, e é o que permite receber tanto
 * `KennelField` quanto `DogScoredField` sem conhecer nenhum dos dois.
 */
export function CompletenessMeter({
  completeness,
  label,
}: {
  completeness: {
    percent: number;
    missingRequired: readonly { label: string }[];
    missingRecommended: readonly { label: string }[];
  };
  /** O que está sendo medido, para o rótulo acessível da barra. */
  label: string;
}) {
  const { percent, missingRequired, missingRecommended } = completeness;
  const level = completenessLevel(percent);

  const barColor =
    level === "completo" ? "bg-success" : missingRequired.length > 0 ? "bg-danger" : "bg-accent";

  return (
    <section className="border-border bg-surface rounded-card flex flex-col gap-4 border p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-fg text-sm font-medium">Completude do cadastro</h2>
        <span className="text-fg font-mono text-sm tabular-nums">{percent}%</span>
      </div>

      <div
        className="bg-surface-hover h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {missingRequired.length > 0 ? (
        <p className="text-fg-muted text-sm">
          <span className="text-danger font-medium">Falta o essencial:</span>{" "}
          {missingRequired.map((f) => f.label).join(", ")}.
        </p>
      ) : null}

      {missingRecommended.length > 0 ? (
        <p className="text-fg-muted text-sm">
          Para o perfil público render mais: {missingRecommended.map((f) => f.label).join(", ")}.
        </p>
      ) : null}

      {level === "completo" ? <p className="text-fg-muted text-sm">Cadastro completo.</p> : null}
    </section>
  );
}
