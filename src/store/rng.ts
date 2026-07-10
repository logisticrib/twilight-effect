// Relocated to the engine (extraction plan, slice 5) — this shim keeps every
// existing `store/rng` import site (recordMiddleware, replay, tests, modals)
// working unchanged. New code should import from src/engine directly.
export * from '../engine/rng';
