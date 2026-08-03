import Link from "next/link";

import { countBySeverity, type Alert, type AlertSeverity } from "../engine";
import { ALERT_TARGETS_VISIBLE, type AlertsResult } from "../queries";

/**
 * ============================================================================
 * Painel de alertas — informativo, e só.
 * ============================================================================
 *
 * Não tem botão de "resolver depois", não tem modal, não intercepta navegação e
 * não some do caminho de ninguém. É uma seção da página que diz o que está
 * pendente e leva até lá. Alerta que bloqueia vira obstáculo, e o criador
 * aprende a fechar sem ler.
 *
 * Também não tem "marcar como lido", e isso é decisão, não esquecimento: o
 * alerta descreve uma condição que continua verdadeira. Dispensar "seu canil
 * não tem logo" enquanto o canil não tem logo seria o painel mentindo para
 * agradar. O jeito de fazer o aviso sumir é resolver — e aí ele some sozinho,
 * porque é derivado do dado.
 */

/**
 * Sem token de aviso na paleta, e de propósito: o manual do cliente não traz
 * cor de alerta, e `--color-selo` (dourado) é reservado ao selo.
 *
 * Então `atencao` usa o AZUL de ação — comunica "faça isto" sem fingir que é
 * erro, que é o que o vermelho diria. `info` não ganha cor nenhuma: se tudo
 * grita, nada é ouvido.
 */
const SEVERITY_STYLE: Record<AlertSeverity, { box: string; chip: string; rotulo: string }> = {
  atencao: {
    box: "border-accent bg-accent-subtle",
    chip: "text-accent-text",
    rotulo: "Atenção",
  },
  info: {
    box: "border-border bg-surface",
    chip: "text-fg-faint",
    rotulo: "Sugestão",
  },
};

function resumo(total: Record<AlertSeverity, number>): string {
  const partes: string[] = [];
  if (total.atencao > 0) partes.push(`${total.atencao} de atenção`);
  if (total.info > 0) partes.push(`${total.info} sugest${total.info === 1 ? "ão" : "ões"}`);
  return partes.join(" · ");
}

export function AlertPanel({ result }: { result: AlertsResult }) {
  const { alerts, scan } = result;
  const total = countBySeverity(alerts);
  const truncado = scan.kennelsTruncated || scan.dogsTruncated;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="alertas-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="alertas-titulo" className="font-display text-lg font-semibold tracking-tight">
          Pendências
        </h2>
        {alerts.length > 0 ? <p className="text-fg-faint text-xs">{resumo(total)}</p> : null}
      </div>

      {alerts.length === 0 ? (
        // Estado vazio é resposta, não ausência de resposta. Sem isto o criador
        // não sabe se está tudo certo ou se a checagem não rodou.
        <p className="border-border bg-surface rounded-card text-fg-muted border px-5 py-4 text-sm">
          <span className="text-success">✓</span> Nada pendente nos seus canis e cães.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <AlertRow key={`${alert.ruleId}:${alert.targets[0]?.id}`} alert={alert} />
          ))}
        </ul>
      )}

      {truncado ? (
        <p className="text-fg-faint text-xs">
          Analisando os {scan.dogs} cães e {scan.kennels} canis mais recentes. Você tem mais
          registros do que isso — o que ficou de fora não foi verificado.
        </p>
      ) : null}
    </section>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const style = SEVERITY_STYLE[alert.severity];
  const visiveis = alert.targets.slice(0, ALERT_TARGETS_VISIBLE);
  const restantes = alert.targets.length - visiveis.length;

  return (
    <li className={`rounded-card border px-5 py-4 ${style.box}`}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`font-mono text-[0.65rem] tracking-wider uppercase ${style.chip}`}>
            {style.rotulo}
          </span>
          <h3 className="text-fg text-sm font-medium">{alert.title}</h3>
          {alert.targets.length > 1 ? (
            <span className="text-fg-faint font-mono text-xs">×{alert.targets.length}</span>
          ) : null}
        </div>

        <p className="text-fg-muted text-sm">{alert.detail}</p>

        {/* Os alvos SÃO a ação: cada um leva direto à tela que resolve. */}
        <ul className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {visiveis.map((target) => (
            <li key={target.id}>
              <Link
                href={target.href}
                className="text-link hover:text-link-hover rounded-control text-sm underline underline-offset-4 transition-colors"
                title={alert.actionLabel ? `${alert.actionLabel}: ${target.label}` : target.label}
              >
                {target.label}
              </Link>
            </li>
          ))}
          {restantes > 0 ? <li className="text-fg-faint text-sm">e mais {restantes}</li> : null}
        </ul>
      </div>
    </li>
  );
}
