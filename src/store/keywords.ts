// Relocated to the engine (extraction plan, slice 2) — this shim keeps every
// existing `store/keywords` import site working unchanged. New code should import
// from src/engine directly.
export * from '../engine/stats';
