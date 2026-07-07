// Replay runner: re-execute a recorded log against the CURRENT engine and fail loudly on
// any divergence. Solo v1. A committed fixture that replays clean is a permanent regression
// test; a fixture that throws means a reducer's behavior changed.
import { useGameStore } from '../store/gameStore';
import { rng } from '../store/rng';
import { recorder } from './recorder';
import {
  LOG_FORMAT_VERSION, hashState, canonical, firstDiff,
  type ReplayLog, type CanonicalSlice, type StoreSlice, type TurnSnapshot,
} from './format';

function liveSlice(): CanonicalSlice {
  return canonical(useGameStore.getState() as unknown as StoreSlice);
}

/** Re-apply a canonical slice to the store (init + paste + turn checkpoints). Merges only
 *  `mode` into the live conn so latency/name churn never enters replay. */
function applySlice(slice: CanonicalSlice): void {
  useGameStore.setState((s) => ({
    game: slice.game,
    localPlayer: slice.localPlayer,
    conn: { ...s.conn, mode: slice.conn.mode },
    pending: slice.pending,
    pendingPlay: slice.pendingPlay,
    pendingTrigger: slice.pendingTrigger,
    pendingKit: slice.pendingKit,
    pendingActionTarget: slice.pendingActionTarget,
    pendingEquipPick: slice.pendingEquipPick,
    oathContext: slice.oathContext,
    modalQueue: slice.modalQueue,
  }) as Partial<ReturnType<typeof useGameStore.getState>>);
}

export class ReplayDivergence extends Error {
  readonly step: number;
  readonly action: string;
  readonly expected: string;
  readonly actual: string;
  readonly lastMatchingTurn: TurnSnapshot | null;
  readonly current: CanonicalSlice;
  /** The first canonical field that differs (recorded vs replayed) — the actionable culprit. */
  readonly diff: string | null;
  constructor(
    step: number, action: string, expected: string, actual: string,
    lastMatchingTurn: TurnSnapshot | null, current: CanonicalSlice, diff: string | null,
  ) {
    super(
      `Replay divergence at step ${step}, action "${action}".\n` +
      `  expected hash ${expected}, got ${actual}.\n` +
      `  first diverging field: ${diff ?? '(unavailable)'}\n` +
      `  last matching turn: ${lastMatchingTurn ? `#${lastMatchingTurn.turn}` : 'none (init)'}.`,
    );
    this.name = 'ReplayDivergence';
    this.step = step;
    this.action = action;
    this.expected = expected;
    this.actual = actual;
    this.lastMatchingTurn = lastMatchingTurn;
    this.current = current;
    this.diff = diff;
  }
}

/**
 * Replay `log` against the live store. Throws `ReplayDivergence` on a hash mismatch, or an
 * `Error` on version mismatch / init mismatch / RNG underrun / RNG surplus / unknown action.
 */
export function replay(log: ReplayLog): void {
  if (log.format !== LOG_FORMAT_VERSION) {
    throw new Error(`Replay: log format v${log.format} != runner v${LOG_FORMAT_VERSION} — regenerate the fixture.`);
  }
  recorder.suspend();
  try {
    applySlice(log.init);
    const initHash = hashState(liveSlice());
    if (initHash !== log.initHash) {
      throw new Error(`Replay: init hash mismatch (expected ${log.initHash}, got ${initHash}).`);
    }
    let lastMatchingTurn: TurnSnapshot | null = null;

    for (const entry of log.entries) {
      const label = entry.kind === 'action' ? entry.action : `paste:${entry.from}`;
      const draws = entry.kind === 'action' ? entry.rng : [];
      let cursor = 0;
      // Amendment 1: underrun throws immediately with context; surplus is asserted after.
      rng.setSource(() => {
        if (cursor >= draws.length) {
          throw new Error(`Replay: RNG underrun at step ${entry.step} ("${label}"), draw #${cursor} — the reducer drew more randoms than were recorded.`);
        }
        return draws[cursor++];
      });

      if (entry.kind === 'action') {
        const fn = (useGameStore.getState() as unknown as Record<string, unknown>)[entry.action];
        if (typeof fn !== 'function') {
          throw new Error(`Replay: unknown action "${entry.action}" at step ${entry.step}.`);
        }
        (fn as (...a: unknown[]) => unknown)(...entry.args);
        if (cursor !== draws.length) {
          throw new Error(`Replay: RNG surplus at step ${entry.step} ("${label}") — consumed ${cursor}/${draws.length} recorded draws.`);
        }
      } else {
        applySlice(entry.state);
      }

      const actual = hashState(liveSlice());
      if (actual !== entry.hash) {
        // `state` holds the recorded post-entry canonical state (pastes always; actions when
        // recorded live) → a precise recorded-vs-replayed field diff. Falls back to the last
        // full checkpoint if this entry has no stored state.
        const recorded: CanonicalSlice | undefined = entry.state ?? lastMatchingTurn?.state ?? log.init;
        throw new ReplayDivergence(entry.step, label, entry.hash, actual, lastMatchingTurn, liveSlice(),
          firstDiff(recorded, liveSlice()));
      }
      if (entry.turn) {
        // The per-action hash already matched; the turn snapshot is a redundant full-state
        // checkpoint (and the anchor reported on any later divergence).
        if (hashState(entry.turn.state) !== actual) {
          throw new Error(`Replay: turn-snapshot hash disagrees with step hash at turn ${entry.turn.turn}, step ${entry.step}.`);
        }
        lastMatchingTurn = entry.turn;
      }
    }
  } finally {
    rng.reset();
    recorder.resume();
  }
}
