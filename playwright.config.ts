import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * ============================================================================
 * Configuração da suíte E2E.
 * ============================================================================
 *
 *     npm run test:e2e            # roda tudo
 *     npm run test:e2e -- --ui    # modo interativo
 *
 * A suíte fala com o projeto Supabase de DESENVOLVIMENTO e cria os próprios
 * dados: usuários, canis e cães nascem e morrem dentro de cada teste. Roda
 * contra banco vazio ou cheio com o mesmo resultado.
 */

// O Playwright não lê `.env.local` sozinho, e os testes precisam da chave
// secreta para criar e destruir fixtures. O Next carrega o dele por conta.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/**
 * Porta própria, longe da 3000 do `npm run dev`.
 *
 * Sem isso, rodar a suíte com o servidor de desenvolvimento aberto faria os
 * testes baterem numa build diferente da que estão medindo — ou pior, passarem
 * contra código velho.
 */
const PORT = 3399;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./reports/e2e-artifacts",

  /**
   * Serial, e é decisão.
   *
   * Os testes compartilham um banco remoto e o servidor de Auth do Supabase tem
   * limite de frequência. Em paralelo, a suíte falharia de forma intermitente
   * por rate limit — o pior tipo de teste, o que mente às vezes.
   */
  workers: 1,
  fullyParallel: false,

  // Zero: teste que só passa na segunda tentativa está escondendo corrida.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // O produto é mobile-first e o visitante real chega por QR, no celular.
    // Testar em desktop primeiro esconderia justamente o que quebra.
    viewport: { width: 390, height: 844 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },

  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],

  /**
   * Build de PRODUÇÃO, não `next dev`.
   *
   * Metade do que a suíte verifica só existe na build: ISR, cache das páginas
   * públicas e o comportamento de prefetch dos `<Link>`. Em desenvolvimento o
   * Next desliga prefetch e não cacheia nada, então o teste passaria sem provar
   * o que interessa.
   */
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
