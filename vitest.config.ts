import { defineConfig } from 'vitest/config';

// Store-level tests import gameStore/multiplayer directly (no DOM) — node env.
// This standalone config keeps the React/Tailwind plugins out of the test pipeline.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
