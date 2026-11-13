import { defineConfig } from 'vitest/config';

// Unit tests only: integration tests (*.int.test.ts) get their own config in step 2.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**'],
  },
});
