import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'plugin-cli',
    watch: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
