import { formatFounderDigits, formatFounderNumber, type FounderEligibility } from "../founder";

/**
 * Selo "Criador Fundador".
 *
 * ESTE é o uso reservado do token `--color-selo` (dourado). O bloco de aviso em
 * `src/styles/tokens.css` diz por quê: se o dourado aparecer em botão, link ou
 * aviso, o selo deixa de significar algo — a raridade é o que o faz valer.
 *
 * A cor não carrega informação sozinha: o texto "Criador Fundador nº 007" diz
 * tudo, e quem não distingue a cor lê a mesma coisa.
 */
export function FounderBadge({
  number,
  size = "md",
}: {
  number: number | null | undefined;
  size?: "sm" | "md";
}) {
  const label = formatFounderNumber(number);
  if (!label) return null;

  const digits = formatFounderDigits(number);

  if (size === "sm") {
    return (
      <span
        title={label}
        className="border-selo text-selo rounded-control inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-xs"
      >
        <FounderMark />
        {digits}
      </span>
    );
  }

  return (
    <span className="border-selo bg-selo-subtle text-selo rounded-control inline-flex items-center gap-2 border px-3 py-1.5 text-sm font-medium">
      <FounderMark />
      {label}
    </span>
  );
}

/**
 * Marca do selo: um losango, desenhado com traço.
 *
 * Herda `currentColor`, então acompanha o token sem repetir a cor — e continua
 * correta se o dourado do manual mudar.
 */
function FounderMark() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
      <path d="M6 1 L11 6 L6 11 L1 6 Z" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

/**
 * O que falta para o canil ser elegível.
 *
 * Sem isto, o criador com cadastro quase completo não teria como saber por que
 * não recebeu selo — e concluiria que a plataforma está quebrada.
 */
export function FounderChecklist({ eligibility }: { eligibility: FounderEligibility }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-fg-muted text-sm">
        O selo Criador Fundador vai para os 100 primeiros canis que completarem o cadastro. Falta:
      </p>
      <ul className="flex flex-col gap-1.5">
        {eligibility.requirements.map((req) => (
          <li key={req.key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`inline-block size-1.5 rounded-full ${req.met ? "bg-success" : "bg-border-strong"}`}
            />
            <span className={req.met ? "text-fg-faint line-through" : "text-fg"}>{req.label}</span>
          </li>
        ))}
      </ul>
      <p className="text-fg-faint text-xs">
        Cadastro incompleto não consome número — o selo só é atribuído quando tudo está preenchido.
      </p>
    </div>
  );
}
