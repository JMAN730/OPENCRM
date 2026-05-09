import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Only collect tests from source. Excludes Tauri build artifacts and
    // git worktree copies that vitest would otherwise pick up as duplicates.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.next/**',
      'src-tauri/**',
      '.claude/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'src/features/**/server/**',
        'src/server/scraper/**',
        'src/lib/auth.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        'src/server/scraper/scraper.py',
        // runner.ts spawns a Python subprocess and is glue around child_process —
        // best verified by integration tests, not unit coverage.
        'src/server/scraper/runner.ts',
      ],
      thresholds: {
        // Coverage floor for the modules where regressions cause real damage.
        // Tighten over time as we add tests.
        'src/features/**/server/**': {
          lines: 60,
          functions: 60,
          branches: 50,
          statements: 60,
        },
        'src/server/scraper/**': {
          lines: 60,
          functions: 60,
          branches: 50,
          statements: 60,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
