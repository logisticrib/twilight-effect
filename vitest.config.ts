import { defineConfig } from 'vitest/config';

// Store-level tests import gameStore/multiplayer directly (no DOM) — node env by
// default. Component tests (.tsx) opt into jsdom per-file via a
// `@vitest-environment jsdom` docblock. This standalone config keeps the
// React/Tailwind plugins out of the test pipeline.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
  },
});
