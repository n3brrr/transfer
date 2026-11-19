import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true, // los tests están aplazados: sin ellos, `pnpm test` no debe fallar
  },
})
