// The single action-interception hook: a Zustand middleware that wraps every store action
// at birth so the replay recorder sees each call (name + args + RNG draws + post-action
// state). Placed innermost in the create() chain so nested get().action() calls resolve to
// wrapped versions automatically. See src/replay/ for the recorder and runner.
import type { StateCreator, StoreMutatorIdentifier } from 'zustand';
import { rng } from './rng';
import { recorder } from '../replay/recorder';
import { hashState, canonical, type StoreSlice } from '../replay/format';

// Actions that mutate state but must NOT be recorded as replayable entries — cosmetic
// (hover/toasts/pile), session/connection, or game-lifecycle. A deny-listed action that
// changes the canonical hash invalidates the recording (categorical drift, in the recorder).
const DENY = new Set<string>([
  'setHovered', 'pushToast', 'openPile', 'closePile', 'setConn',
  'setBroadcast', 'clearBroadcast', 'saveGame', 'backToLobby',
  'resumeGame', 'startMultiplayer', 'assembleMpGame',
]);

// Module-level re-entrancy depth: only the OUTERMOST action records; sibling get().x()
// calls (and deny-listed wrappers) fold into their caller.
let depth = 0;

function wrapActions<T extends object>(state: T, get: () => StoreSlice): T {
  const out = { ...state } as Record<string, unknown>;
  for (const key of Object.keys(state as Record<string, unknown>)) {
    const val = (state as Record<string, unknown>)[key];
    if (typeof val !== 'function') continue;
    const orig = val as (...a: unknown[]) => unknown;
    out[key] = (...args: unknown[]) => {
      if (depth > 0) return orig(...args);          // nested — subsumed by the outer action
      if (recorder.suspended) return orig(...args); // replay — pass through, no capture/record
      if (DENY.has(key)) {                          // run, don't record; drift caught at next entry
        depth++;
        try { return orig(...args); } finally { depth--; }
      }
      depth++;
      const preHash = recorder.active ? hashState(canonical(get())) : null;
      const draws: number[] = [];
      rng.beginCapture(draws);
      try {
        return orig(...args);
      } finally {
        rng.endCapture();
        depth--;
        recorder.onAction(key, args, draws, preHash, get);
      }
    };
  }
  return out as T;
}

/** Zustand middleware (cast-based impl, the standard pattern): wraps the initializer's
 *  action methods. Mutator tuples are passed through unchanged so it composes under
 *  persist()/subscribeWithSelector(). */
type RecordActions = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<T, Mps, Mcs>,
) => StateCreator<T, Mps, Mcs>;

export const recordActions: RecordActions = ((initializer) =>
  ((set: unknown, getRaw: unknown, api: unknown) => {
    const init = initializer as (s: unknown, g: unknown, a: unknown) => object;
    const state = init(set, getRaw, api);
    return wrapActions(state, getRaw as () => StoreSlice);
  }) as unknown) as RecordActions;
