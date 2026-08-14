import Link from "next/link";

const VARIANT = {
  muted: "text-fg-muted hover:text-fg self-start text-sm transition-colors",
  link: "text-link hover:text-link-hover self-start text-sm underline underline-offset-4 transition-colors",
} as const;

/**
 * Link fixo para a página-pai na hierarquia — NUNCA `router.back()`. Uma
 * pessoa que chega por QR Code ou link direto não tem histórico de navegador
 * para voltar; o alvo previsível é o que já funciona em produção há várias
 * telas.
 *
 * Não é domínio, é infraestrutura de UI usada por `painel`, `admin`, `auth`
 * e páginas públicas — mesmo raciocínio que já tirou `lib/notify/` de dentro
 * de um módulo (ver `modules/README.md`).
 */
export function BackLink({
  href,
  label,
  variant = "muted",
  prefetch,
}: {
  href: string;
  label: string;
  variant?: "muted" | "link";
  prefetch?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} className={VARIANT[variant]}>
      ← {label}
    </Link>
  );
}
