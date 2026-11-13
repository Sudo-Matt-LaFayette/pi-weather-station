import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts, which sets the client as Vite's root.
export default defineConfig({
  root: '.',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
