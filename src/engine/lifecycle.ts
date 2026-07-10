// ─── Turn lifecycle + game construction ─────────────────────────────────────────
// Created in slice 5 with the rng-boundary helpers resolveActionEffects needs
// (shuffle, rollD6 — pulled forward from the slice-6 list); the rest of the
// lifecycle module (start-of-turn resolution, game construction, equip helpers)
// lands in slice 6. Moved verbatim from src/store/gameStore.ts.
import { rng } from './rng';

// Fisher-Yates; exported for UI shuffles (mulligan redeal, Bard's Encore!) so no
// component reinvents it with the biased sort(() => Math.random() - 0.5) trick.
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rollD6(): number { return 1 + Math.floor(rng.next() * 6); }
