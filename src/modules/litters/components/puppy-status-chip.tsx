import { litterStatusLabel } from "../constraints";

/**
 * Selo de status do filhote.
 *
 * As três cores saem dos tokens semânticos que já existem — `--color-selo`
 * (dourado) está FORA de propósito: ele é reservado a conquista ("Criador
 * Fundador"), e o token está documentado como tal em `tokens.css`. Um filhote
 * disponível não é uma conquista.
 *
 * Cor NUNCA sozinha: o rótulo em texto carrega a informação inteira, então
 * quem não distingue as cores lê a mesma coisa (WCAG 1.4.1).
 */
/**
 * Verde disponível, laranja reservado — e VENDIDO NEUTRO, de propósito.
 *
 * Vendido é o estado terminal e não-acionável: ele tem de RECUAR, para o olho
 * de quem está comprando ir ao que ainda dá para comprar. Uma quarta cor
 * saturada competiria com as duas que importam. É escolha, não falta de cor.
 *
 * O laranja é `--color-warning`, que NÃO é o dourado do selo — ver o bloco de
 * ESTADOS em `tokens.css` para por que os dois precisam ficar distantes.
 */
const STYLES: Record<string, string> = {
  available: "border-success/40 bg-success-subtle text-success",
  reserved: "border-warning/40 bg-warning-subtle text-warning",
  sold: "border-border-strong bg-surface-raised text-fg-faint",
};

export function PuppyStatusChip({ status }: { status: string | null }) {
  const label = litterStatusLabel(status);
  if (!label) return null;

  return (
    <span
      className={`rounded-control inline-flex items-center border px-2 py-0.5 text-xs font-medium ${
        STYLES[status ?? ""] ?? STYLES.sold
      }`}
    >
      {label}
    </span>
  );
}

/** Sexo como selo, com o símbolo que a imagem de referência usa. */
export function SexChip({ sex }: { sex: string }) {
  const female = sex === "female";
  return (
    <span className="border-border-strong bg-surface-raised text-fg-muted rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-xs font-medium">
      <span aria-hidden="true">{female ? "♀" : "♂"}</span>
      {female ? "Fêmea" : "Macho"}
    </span>
  );
}

/**
 * Preço em reais.
 *
 * `Intl.NumberFormat` com locale fixo `pt-BR`: sem isso o servidor formata com
 * o locale DELE (que na Vercel é en-US) e o número chega ao HTML como "4,500.00"
 * — e o cliente não corrige, porque a página é renderizada no servidor.
 */
export function Price({ value }: { value: number | null }) {
  if (value === null) return null;

  return (
    <span className="text-fg font-mono text-sm font-medium tabular-nums">
      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)}
    </span>
  );
}
