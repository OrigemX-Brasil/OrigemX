import type { PublicFaq } from "@/modules/public/queries";

/**
 * Accordion nativo — `<details>/<summary>`, sem JS, sem lib nova. Primeira
 * vez que o projeto usa o elemento: os únicos `aria-expanded` existentes
 * abrem DIÁLOGO (busca, menu mobile), não conteúdo inline. `<details>` foi
 * cogitado e descartado uma vez em `pedigree-tree.tsx`, mas por aninhar
 * dentro de um `<Link>` — não se aplica aqui.
 */
export function FaqAccordion({ faqs }: { faqs: PublicFaq[] }) {
  return (
    <div className="flex flex-col gap-2">
      {faqs.map((faq) => (
        <details
          key={faq.id}
          className="border-border bg-surface group rounded-card border px-4 py-3"
        >
          <summary className="text-fg focus-visible:outline-ring flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium marker:content-none focus-visible:outline-2">
            {faq.question}
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="text-fg-faint size-4 shrink-0 transition-transform group-open:rotate-180"
            >
              <path
                d="M5 7.5l5 5 5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <p className="text-fg-muted mt-2 text-sm whitespace-pre-line">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
