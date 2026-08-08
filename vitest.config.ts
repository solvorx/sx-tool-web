import { defineConfig } from 'vitest/config'

/**
 * jsdom trae `localStorage`/`sessionStorage`, pero no `navigator.locks` ni
 * `BroadcastChannel` — se poleyfillan en `src/test/setup.ts` con una
 * implementación mínima, suficiente para probar la serialización.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    env: {
      SX_TEST_ISSUER: 'http://localhost:9000',
      SX_TEST_CLIENT_ID: 'sx-console-web',
      SX_TEST_REDIRECT_URI: 'http://localhost:3002/callback',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/test/**', '**/*.test.ts'],
      // Piso real medido (`pnpm test:cov`), redondeado hacia abajo al múltiplo
      // de 5 -no un número inventado para que pase de entrada-. Subirlo está
      // bien cuando la cobertura real suba; bajarlo requiere una razón, no un
      // test roto.
      thresholds: {
        statements: 95,
        branches: 85,
        functions: 90,
        lines: 95,
      },
    },
  },
})
