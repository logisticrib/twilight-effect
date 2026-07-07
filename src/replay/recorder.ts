// Always-on, in-memory replay recorder. Driven by the record middleware (src/store/
// recordMiddleware.ts), which calls onAction() for every non-nested, non-deny-listed store
// action. Holds one game's log; exports it as JSON (GameOverScreen / RecorderButton).
import {
  LOG_FORMAT_VERSION, COMMIT, hashState, canonical,
  type CanonicalSlice, type ReplayEntry, type ReplayLog, type StoreSlice,
} from './format';

export interface RecorderStatus {
  recording: boolean;
  valid: boolean;
  reason?: string;
  steps: number;
  turns: number;
}

class Recorder {
  /** True while a game is being recorded (set by startSolo). Read by the middleware to
   *  decide whether to compute the drift pre-hash. */
  active = false;
  /** True while the replay runner re-executes actions — the middleware passes through and
   *  onAction() no-ops so replay doesn't self-record. */
  suspended = false;

  private log: ReplayLog | null = null;
  private lastTurn = 0;
  private lastHash = '';
  private valid = false;
  private reason: string | undefined;
  private get: (() => StoreSlice) | null = null;

  private listeners = new Set<() => void>();
  private status: RecorderStatus = { recording: false, valid: false, steps: 0, turns: 0 };

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };
  getStatus = (): RecorderStatus => this.status;

  private notify() {
    this.status = {
      recording: this.active,
      valid: this.valid,
      reason: this.reason,
      steps: this.log?.entries.length ?? 0,
      turns: this.lastTurn,
    };
    for (const l of this.listeners) l();
  }

  private startGame(get: () => StoreSlice) {
    const slice = canonical(get());
    this.get = get;
    this.log = {
      format: LOG_FORMAT_VERSION, commit: COMMIT, mode: slice.conn.mode,
      recordedAt: 0, init: clone(slice), initHash: hashState(slice), entries: [],
    };
    this.lastTurn = slice.game.turn;
    this.lastHash = this.log.initHash;
    this.active = true;
    this.valid = true;
    this.reason = undefined;
    this.notify();
  }

  private invalidate(reason: string) {
    if (!this.valid) return;
    this.valid = false;
    this.reason = reason;
    this.notify();
  }

  /** The replay runner suspends recording while it re-executes actions (so replay doesn't
   *  self-record); the middleware passes through and onAction() no-ops while suspended. */
  suspend() { this.suspended = true; }
  resume() { this.suspended = false; }

  /** Called by the middleware after every recorded (non-nested, non-deny) action. */
  onAction(name: string, args: unknown[], draws: number[], preHash: string | null, get: () => StoreSlice) {
    if (this.suspended) return;
    if (name === 'startSolo') { this.startGame(get); return; }
    if (!this.active || !this.valid) return;
    // Categorical drift: a deny-listed (unrecorded) action mutated hashed state since the
    // last entry, so entries can no longer chain coherently → invalidate.
    if (preHash !== null && preHash !== this.lastHash) {
      this.invalidate(`state changed outside a recorded action before "${name}"`);
      return;
    }
    const slice = canonical(get());
    const postHash = hashState(slice);
    const step = this.log!.entries.length + 1;
    const hasFn = args.some(a => typeof a === 'function');
    const entry: ReplayEntry = hasFn
      ? { step, kind: 'paste', from: name, state: clone(slice), hash: postHash }
      : { step, kind: 'action', action: name, args: clone(args), rng: draws.slice(), hash: postHash };
    if (slice.game.turn > this.lastTurn) {
      this.lastTurn = slice.game.turn;
      entry.turn = { turn: slice.game.turn, state: clone(slice) };
    }
    this.log!.entries.push(entry);
    this.lastHash = postHash;
    this.notify();
  }

  /** Serialize the log for export. Re-checks live drift; returns null if invalid/empty. */
  export(): ReplayLog | null {
    if (this.active && this.valid && this.get) {
      const live = hashState(canonical(this.get()));
      if (live !== this.lastHash) this.invalidate('state changed since the last recorded action');
    }
    if (!this.active || !this.valid || !this.log) return null;
    return clone({ ...this.log, recordedAt: Date.now() });
  }

  /** Test seam: forget the current game (used by tests between runs). */
  _resetForTest() {
    this.active = false; this.suspended = false; this.log = null;
    this.lastTurn = 0; this.lastHash = ''; this.valid = false; this.reason = undefined; this.get = null;
    this.notify();
  }

  /** Test seam: begin recording from the current (already-arranged) store state without a
   *  startSolo. Real recording always starts via the startSolo action; tests use this to
   *  record from a seeded mid-game position (seed while suspended, then resume + begin). */
  _beginForTest(get: () => StoreSlice) { this.startGame(get); }
}

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

export const recorder = new Recorder();
export type { CanonicalSlice };
