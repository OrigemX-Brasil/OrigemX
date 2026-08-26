"use client";

import { useState } from "react";

/**
 * ============================================================================
 * Compartilhar uma URL, em cascata.
 * ============================================================================
 *
 * O compartilhamento nativo do celular quando existe, a área de transferência
 * quando não, e — sempre — a URL visível perto do botão para copiar à mão. Os
 * dois primeiros exigem contexto seguro (HTTPS), então nenhum deles pode ser o
 * único caminho: quem chama é responsável por exibir o endereço em texto.
 *
 * COMPARTILHADO entre a tela de sucesso do cadastro e o perfil do cão no
 * painel, e por isso mora em `src/components/` — mesma casa e mesmo motivo do
 * `CompletenessMeter`. Nasceu dentro de `dog-created.tsx`; quando o segundo
 * consumidor apareceu, copiar teria criado duas cascatas para divergirem no
 * primeiro ajuste.
 *
 * O CANCELAMENTO NÃO É ERRO. Fechar o menu do sistema rejeita a Promise de
 * `navigator.share` igual a uma falha real — por isso o `catch` segue para a
 * cópia em vez de mostrar mensagem de erro. Quem cancelou o menu e viu "Link
 * copiado" não perdeu nada; quem viu "não foi possível compartilhar" depois de
 * desistir por conta própria ficaria confuso.
 */
export function ShareButton({
  title,
  url,
  label = "Compartilhar link",
}: {
  /** Vai no menu nativo do sistema, como título do que está sendo enviado. */
  title: string;
  url: string;
  label?: string;
}) {
  const [aviso, setAviso] = useState<string | null>(null);

  async function compartilhar() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Cancelar o menu do sistema cai aqui, e cancelar não é erro: segue
        // para a cópia, que é útil de qualquer jeito.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setAviso("Link copiado.");
    } catch {
      setAviso("Não foi possível copiar. Selecione o endereço abaixo e copie.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={compartilhar}
        className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-control focus-visible:outline-ring inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        {label}
      </button>

      {/* Fora do botão: a região `aria-live` precisa já estar no DOM quando o
          texto chega, senão o leitor de tela não anuncia a mudança. */}
      <span role="status" aria-live="polite" className="text-fg-muted text-xs sm:ml-1">
        {aviso}
      </span>
    </>
  );
}
