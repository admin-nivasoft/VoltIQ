import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same origin as the API in every environment: no CORS (D-08). Nginx does this in Compose.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // The switcher is included in test runs; the bundle test checks that production builds drop it.
    env: { VITE_MOCK_AUTH: 'true' },
  },
});
