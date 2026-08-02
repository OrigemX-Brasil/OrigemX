import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Só testa lógica pura: cálculo, validação, saneamento de rota.
 *
 * Componente e Server Action ficam de fora de propósito — o que precisa ser
 * provado neles é comportamento contra o banco real, e isso já é coberto por
 * `npm run test:rls`, que fala com a API de verdade. Mock de RLS provaria que o
 * mock funciona.
 */
export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
