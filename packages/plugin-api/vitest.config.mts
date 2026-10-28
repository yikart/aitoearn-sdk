import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'plugin-api',
    watch: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
