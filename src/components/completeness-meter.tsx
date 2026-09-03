/**
 * Indicador de completude cadastral.
 *
 * A barra é reforço visual, nunca o único canal: o percentual aparece em texto
 * e o que falta vem listado por nome. Quem não distingue a cor da barra
 * continua sabendo exatamente o que fazer.
 *
 * COMPARTILHADO entre canil, cão e ninhada, e por isso mora em `src/components/`
 * e não dentro de um módulo: nasceu em `modules/kennels/components/`, e deixá-lo
 * lá faria os outros módulos importarem do de canil só para desenhar uma barra.
 *
 * As listas são TIPO ESTRUTURAL (`{ label: string }`), não `KennelField[]`:
 * é tudo que este componente lê de cada campo, e é o que permite receber
 * `KennelField`, `DogScoredField` ou `LitterScoredField` sem conhecer nenhum.
 *
 * ============================================================================
 * O TOM MUDOU no aditivo de fluxo de 03/09/2026, e a mudança é o requisito.
 * ============================================================================
 *
 * Antes: barra VERMELHA e "Falta o essencial:" enquanto o mínimo não fechasse.
 * O aditivo é explícito — a porcentagem "deve servir apenas como incentivo para
 * adicionar mais informações. Não pode transmitir a sensação de que o cadastro
 * ainda está pendente".
 *
 * Então: nada de vermelho, nada de "falta". Enquanto o mínimo não fecha, o que
 * aparece é o caminho para concluir; quando fecha, a barra fica verde MESMO EM
 * 60% — porque "cadastro concluído" e "perfil completo" são coisas diferentes,
 * e é justamente essa diferença que o aditivo pede para comunicar.
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

  // O VERDE SEGUE O MÍNIMO, não os 100%. Um perfil com o cadastro concluído e
  // 60% preenchido está no ar e funcionando — pintá-lo de "incompleto" seria
  // exatamente a sensação de pendência que o aditivo veio remover.
  const concluido = missingRequired.length === 0;

  return (
    <section className="border-border bg-surface rounded-card flex flex-col gap-4 border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-fg text-sm font-medium">
          {concluido ? "Cadastro concluído" : "Complete seu cadastro"}
        </h2>
        <span className="text-fg font-mono text-sm tabular-nums">
          {percent}% <span className="text-fg-faint">preenchido</span>
        </span>
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
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
            concluido ? "bg-success" : "bg-accent"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {!concluido ? (
        <p className="text-fg-muted text-sm">
          Para concluir e colocar o perfil no ar: {missingRequired.map((f) => f.label).join(", ")}.
        </p>
      ) : null}

      {concluido && missingRecommended.length > 0 ? (
        <p className="text-fg-muted text-sm">
          <span className="text-fg font-medium">Seu perfil já está no ar.</span> Quer deixá-lo mais
          completo? Adicione: {missingRecommended.map((f) => f.label).join(", ")}.
        </p>
      ) : null}

      {concluido && missingRecommended.length === 0 ? (
        <p className="text-fg-muted text-sm">Perfil completo — não falta nada.</p>
      ) : null}
    </section>
  );
}
