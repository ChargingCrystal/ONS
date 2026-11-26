import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

// Frontend tests live in __tests__ folders next to the code they check.
// Backend tests stay in tests/.
const frontendTests = '{assets,components,i18n,layouts,pages}/**/__tests__'

export default defineConfig(async () => ({
  test: {
    projects: [
      {
        test: {
          name: 'backend',
          environment: 'node',
          include: ['{tests,server,shared}/**/*.{test,spec}.{js,mjs,ts}'],
        },
      },
      {
        // Frontend checks that need no Nuxt runtime: files on disk or a built server.
        test: {
          name: 'ui-node',
          environment: 'node',
          include: [`${frontendTests}/*.spec.ts`],
          exclude: [`${frontendTests}/*.nuxt.spec.ts`],
        },
      },
      // Component tests that run inside a Nuxt runtime with a simulated DOM.
      await defineVitestProject({
        test: {
          name: 'ui-nuxt',
          environment: 'nuxt',
          include: [`${frontendTests}/*.nuxt.spec.ts`],
        },
      }),
    ],
  },
}))
