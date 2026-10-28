import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'capability',
    watch: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
