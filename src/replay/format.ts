// Replay log schema + the canonical-state projection and hash shared by the recorder
// (src/replay/recorder.ts) and the runner (src/replay/replay.ts). Type-only imports from
// the store — no runtime dependency, so no import cycle.
import type {
  GameState, ConnState, PendingAction, PendingPlay, PendingTrigger,
  PendingActionTarget, PendingEquipPick, OathContext,
} from '../store/gameStore';
import type { PendingKit } from '../store/gameStore';

/** Bump when the log shape changes; the runner refuses a mismatched fixture. */
export const LOG_FORMAT_VERSION = 1;

// Build-time git short hash, injected by vite `define` (see vite.config.ts). Undefined
// under Vitest (standalone config, no define) → falls back to 'unknown'. `typeof` guards
// against a ReferenceError on the bare identifier.
declare const __COMMIT_HASH__: string;
export const COMMIT: string =
  typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'unknown';

/**
 * The exact slice of store state that is recorded, hashed, and re-applied. It is the
 * gameplay-relevant state and NOTHING volatile: excludes `toasts` (ids + setTimeout),
 * `hovered`, `pileView`, `savedGame`, `_broadcast`, and conn latency/names (only `conn.mode`
 * is kept). All combat/scry prompts live inside `game`, so they ride along in `game`.
 */
export interface CanonicalSlice {
  game: GameState;
  localPlayer: 'p1' | 'p2';
  conn: { mode: ConnState['mode'] };
  pending: PendingAction | null;
  pendingPlay: PendingPlay | null;
  pendingTrigger: PendingTrigger | null;
  pendingKit: PendingKit | null;
  pendingActionTarget: PendingActionTarget | null;
  pendingEquipPick: PendingEquipPick | null;
  oathContext: OathContext | null;
  modalQueue: string[];
}

/** The superset the projection reads from (the live store state is assignable to this). */
export interface StoreSlice {
  game: GameState;
  localPlayer: 'p1' | 'p2';
  conn: ConnState;
  pending: PendingAction | null;
  pendingPlay: PendingPlay | null;
  pendingTrigger: PendingTrigger | null;
  pendingKit: PendingKit | null;
  pendingActionTarget: PendingActionTarget | null;
  pendingEquipPick: PendingEquipPick | null;
  oathContext: OathContext | null;
  modalQueue: string[];
}

export function canonical(s: StoreSlice): CanonicalSlice {
  return {
    game: s.game,
    localPlayer: s.localPlayer,
    conn: { mode: s.conn.mode },
    pending: s.pending,
    pendingPlay: s.pendingPlay,
    pendingTrigger: s.pendingTrigger,
    pendingKit: s.pendingKit,
    pendingActionTarget: s.pendingActionTarget,
    pendingEquipPick: s.pendingEquipPick,
    oathContext: s.oathContext,
    modalQueue: s.modalQueue,
  };
}

/** Deterministic, key-order-insensitive JSON of a value. Arrays stay ordered (deck/board
 *  order is significant); object keys are sorted. undefined is normalized to null. */
export function stableStringify(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** Allowlist predicate: is `v` a pure JSON value — primitive, plain array, or plain object,
 *  with no cycles — i.e. does it round-trip through JSON without loss? The recorder uses this
 *  to decide whether an action's args are re-executable (kind:"action") or must be captured as
 *  a state-paste (kind:"paste"). Rejects functions, undefined, symbols, bigints, non-finite
 *  numbers, class instances (Date/Map/Set), DOM nodes / React synthetic events, and cyclic
 *  structures — categorically. Defined by "is this replayable", not a blocklist, so the next
 *  non-serializable arg class (e.g. a store action wired straight as an onClick handler, which
 *  leaks the event in as args[0]) can't reintroduce a silently-dropped entry. */
export function isReplayable(v: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (v === null) return true;
  const t = typeof v;
  if (t === 'string' || t === 'boolean') return true;
  if (t === 'number') return Number.isFinite(v as number); // NaN/Infinity → JSON null (lossy)
  if (t !== 'object') return false;                          // function / undefined / symbol / bigint
  if (seen.has(v as object)) return false;                   // cycle — not JSON-representable
  seen.add(v as object);
  if (Array.isArray(v)) return v.every(x => isReplayable(x, seen));
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return false; // class instance / Map / DOM / event
  return Object.values(v as Record<string, unknown>).every(x => isReplayable(x, seen));
}

/** cyrb53 — a fast, well-distributed 53-bit string hash (not cryptographic). */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function hashState(slice: CanonicalSlice): string {
  return cyrb53(stableStringify(slice));
}

/** First differing path between two states (via stable JSON) — used to turn a hash mismatch
 *  into an actionable "which field diverged" report. Returns null if identical. */
export function firstDiff(a: unknown, b: unknown, path = ''): string | null {
  if (stableStringify(a) === stableStringify(b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path || '(root)'}: expected ${stableStringify(a).slice(0, 140)} — got ${stableStringify(b).slice(0, 140)}`;
  }
  for (const k of new Set([...Object.keys(a as object), ...Object.keys(b as object)])) {
    const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return `${path} (key set differs)`;
}

// ─── Log entries ────────────────────────────────────────────────────────────────
export interface TurnSnapshot { turn: number; state: CanonicalSlice }

/** A re-executable action: replay calls the store action with `args`, feeding `rng`. */
export interface ActionEntry {
  step: number;
  kind: 'action';
  action: string;
  args: unknown[];
  rng: number[];
  hash: string;
  turn?: TurnSnapshot;
  /** Full post-action canonical state, kept IN MEMORY for a precise field-level divergence
   *  report; stripped from downloaded fixtures (they replay from re-execution, not this). */
  state?: CanonicalSlice;
}

/** A state-paste: replay `setState`s `state` (used for non-serializable-arg actions like
 *  setGame(fn); the primitive MP will reuse for remote state-syncs). */
export interface PasteEntry {
  step: number;
  kind: 'paste';
  from: string;
  state: CanonicalSlice;
  hash: string;
  turn?: TurnSnapshot;
}

export type ReplayEntry = ActionEntry | PasteEntry;

export interface ReplayLog {
  format: number;
  commit: string;
  mode: string;
  recordedAt: number;
  init: CanonicalSlice;
  initHash: string;
  entries: ReplayEntry[];
}
