import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    // Journeys through several screens take a few seconds, and everything is slower when the whole suite runs at once
    // (or on a fresh machine). A generous limit stops those slow runs from failing; a test that really hangs still fails.
    testTimeout: 20000,
  },
})
