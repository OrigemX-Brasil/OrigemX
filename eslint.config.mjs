import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Desliga regras de estilo que conflitam com o Prettier. Precisa vir por último.
  prettier,
  {
    /**
     * Suíte E2E do Playwright.
     *
     * As fixtures recebem um callback `use(valor)` — é a API do Playwright para
     * entregar o recurso ao teste e retomar depois. A regra `rules-of-hooks`
     * enxerga o nome `use` e conclui que é o hook do React sendo chamado fora de
     * componente. É falso positivo puro: não há React nenhum aqui.
     *
     * Desligada SÓ neste diretório, e só esta regra.
     */
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gerado por `npm run db:types` — não lintar.
    "src/lib/types/database.ts",
  ]),
]);

export default eslintConfig;
