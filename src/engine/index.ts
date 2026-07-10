// ─── Engine barrel ──────────────────────────────────────────────────────────────
// The headless game engine: pure functions over GameState, no React, no Zustand,
// no store/screens imports (enforced by src/__tests__/engine_deps.test.ts).
// gameStore re-exports this barrel so external import sites don't churn while the
// extraction (tasks/refactor_extraction_plan.md) is in progress.
export * from './geometry';
export * from './state';
export * from './stats';
export * from './entities';
export * from './interpreter';
export * from './combat';
export * from './lifecycle';
export * from './rng';
