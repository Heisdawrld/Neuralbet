import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/lib/prediction-engine/v5/**/*.ts'],
      exclude: [
        'src/lib/prediction-engine/v5/**/*.test.ts',
        'src/lib/prediction-engine/v5/**/__tests__/**',
      ],
    },
    // Force deterministic ordering & no parallel for math tests
    fileParallelism: false,
    testTimeout: 10000,
  },
});
