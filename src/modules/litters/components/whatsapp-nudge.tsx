import Link from "next/link";

/**
 * Só aparece quando falta — nada de indicador permanente "WhatsApp: ok" pra
 * quem já preencheu. Mesmo critério de silêncio do resto do painel: alertar
 * só a condição que precisa de ação.
 *
 * O campo mora no CANIL (`/painel/canis/[id]`), não na ninhada — reaproveitado
 * por todas as ninhadas do mesmo dono. Sem este aviso, quem está na tela de
 * ninhada não tem como adivinhar que o contato se configura em outro lugar.
 */
export function WhatsappNudge({
  kennelId,
  whatsapp,
}: {
  kennelId: string;
  whatsapp: string | null;
}) {
  if (whatsapp) return null;

  return (
    <p className="border-accent bg-accent-subtle text-fg rounded-card border px-4 py-3 text-sm">
      Seu canil ainda não tem WhatsApp cadastrado. Sem ele, a ninhada não mostra o botão de
      contato pro comprador.{" "}
      <Link
        href={`/painel/canis/${kennelId}`}
        className="text-link hover:text-link-hover underline underline-offset-4"
      >
        Adicionar WhatsApp
      </Link>
    </p>
  );
}
