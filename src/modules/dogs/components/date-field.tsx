"use client";

import { useRef, useState } from "react";

import { isoToBr, maskBrDateDigits, parseBrDate } from "../br-date";

/**
 * ============================================================================
 * Data digitável, com o seletor nativo como atalho — não como único caminho.
 * ============================================================================
 *
 * O seletor sozinho (`<input type="date">` puro, como era antes) força
 * navegação mês a mês em muitos Android — lento para digitar o nascimento de
 * um cão de alguns anos atrás. A digitação com teclado numérico é o caminho
 * rápido; o botão de calendário continua existindo para quem prefere apontar.
 *
 * TRÊS elementos no DOM, e só UM tem `name` — é o que evita FormData receber
 * dois valores para a mesma chave:
 *
 *   1. texto visível, SEM name — o que a pessoa digita, em dd/mm/aaaa;
 *   2. `<input type="date">` oculto, SEM name — só abre o seletor do SO;
 *   3. `<input type="hidden">`, COM `name={name}` — o que o form envia,
 *      sempre em yyyy-mm-dd. Sincronizado pelos dois caminhos acima.
 *
 * A VALIDAÇÃO DE NEGÓCIO (data futura, anterior a 1900) não mora aqui — ela
 * continua em `validateBirthDate` (`../validation.ts`), rodando sobre o valor
 * ISO deste campo oculto exatamente como rodava sobre o `<input type="date">`
 * antigo. O que este componente valida é só FORMA: "isso é uma data que
 * existe no calendário", não "isso é uma data aceitável para o negócio".
 */
export function DateField({
  id,
  name,
  defaultValue,
  ariaDescribedBy,
  onFormatError,
  onValueChange,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  ariaDescribedBy?: string;
  /**
   * O erro de FORMATO ("isso não é uma data que existe") sobe para quem
   * chama em vez de este componente desenhar o próprio parágrafo — é
   * `Control`, em `dog-form.tsx`, quem já possui o único slot de erro do
   * campo (o mesmo que mostra "data no futuro" vindo de `validateBirthDate`),
   * e as duas mensagens não podem aparecer em lugares diferentes na tela.
   */
  onFormatError?: (message: string | null) => void;
  /**
   * O valor ISO, sempre que ele muda. Existe para quem precisa DERIVAR algo
   * da data enquanto a pessoa digita — hoje só a previsão de parto, calculada
   * a partir da cobrição em `LitterForm`.
   *
   * Não dá para observar o `<input type="hidden">` de fora: o React o
   * atualiza programaticamente, e atribuição de `value` não dispara evento de
   * `change`. Ou o valor sobe por callback, ou não sobe.
   */
  onValueChange?: (iso: string) => void;
}) {
  const [text, setText] = useState(() => isoToBr(defaultValue));
  const [iso, setIso] = useState(defaultValue ?? "");

  const pickerRef = useRef<HTMLInputElement>(null);

  /** Um caminho só para gravar o ISO, para nenhum deles esquecer o callback. */
  function commitIso(value: string) {
    setIso(value);
    onValueChange?.(value);
  }

  function commitTyped(value: string) {
    setText(value);

    if (value.length === 0) {
      commitIso("");
      onFormatError?.(null);
      return;
    }

    if (value.length < 10) {
      // Ainda digitando — sem veredito até ter os 10 caracteres (dd/mm/aaaa).
      // Marcar erro a cada tecla puniria a pessoa no meio da digitação.
      onFormatError?.(null);
      return;
    }

    const parsed = parseBrDate(value);
    if (parsed) {
      commitIso(parsed);
      onFormatError?.(null);
    } else {
      // Não grava lixo no campo oculto: uma data impossível vira "não
      // informado" para o resto do formulário, não uma string quebrada.
      commitIso("");
      onFormatError?.("Data inválida — confira dia e mês.");
    }
  }

  function openPicker() {
    const el = pickerRef.current;
    if (!el) return;
    // `showPicker` é o caminho moderno; nem todo navegador tem — `click()`
    // ainda abre o seletor nativo do <input type="date"> como alternativa.
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // Alguns navegadores recusam fora de gesto do usuário — mas este
        // handler SÓ roda dentro de um clique, então cai aqui só se o
        // navegador não suportar de fato, e o fallback abaixo cobre isso.
      }
    }
    el.click();
  }

  return (
    <div className="relative flex gap-2">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={text}
        onChange={(e) => commitTyped(maskBrDateDigits(e.target.value))}
        aria-describedby={ariaDescribedBy}
        className="border-border-strong bg-bg text-fg placeholder:text-fg-faint focus-visible:border-accent rounded-control w-full border px-3 py-2.5 text-base outline-none transition-colors"
      />

      <button
        type="button"
        onClick={openPicker}
        aria-label="Escolher no calendário"
        className="border-border-strong text-fg-muted hover:text-fg hover:bg-surface-hover rounded-control focus-visible:border-accent flex shrink-0 items-center justify-center border px-3 outline-none transition-colors"
      >
        <CalendarIcon />
      </button>

      {/* Não tem `name`: existe só para o botão acima abrir o seletor do
          sistema operacional. tabIndex -1 tira do fluxo de Tab — quem usa
          teclado já tem o campo de texto e o botão, não precisa de um
          terceiro parada invisível. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={iso}
        onChange={(e) => {
          const value = e.target.value;
          commitIso(value);
          setText(isoToBr(value));
          onFormatError?.(null);
        }}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />

      <input type="hidden" name={name} value={iso} />
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
