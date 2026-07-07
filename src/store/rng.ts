// The single randomness boundary for the engine. Every die roll and shuffle draws from
// `rng.next()` — never `Math.random()` directly. In normal play it delegates to Math.random;
// the replay recorder captures the draws consumed during each action, and the replay runner
// injects the recorded draws back so re-execution is deterministic. (See src/replay/.)

// Delegates to Math.random via a wrapper (not a captured reference) so test spies on
// Math.random still take effect through the boundary. Replay swaps `impl` out entirely.
let impl: () => number = () => Math.random();
let capture: number[] | null = null;

export const rng = {
  /** THE random source. Returns a float in [0, 1); appends it to the capture buffer if one is set. */
  next(): number {
    const v = impl();
    if (capture) capture.push(v);
    return v;
  },
  /** Recorder: collect every draw into `buf` until endCapture(). */
  beginCapture(buf: number[]): void { capture = buf; },
  endCapture(): void { capture = null; },
  /** Replay: swap in a deterministic source (e.g. a cursor over recorded draws). */
  setSource(fn: () => number): void { impl = fn; },
  /** Restore live randomness and clear any capture. */
  reset(): void { impl = () => Math.random(); capture = null; },
};
