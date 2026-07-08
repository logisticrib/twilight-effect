// Always-on, in-memory replay recorder. Driven by the record middleware (src/store/
// recordMiddleware.ts), which calls onAction() for every non-nested, non-deny-listed store
// action. Holds one game's log; exports it as JSON (GameOverScreen / RecorderButton).
import {
  LOG_FORMAT_VERSION, COMMIT, hashState, canonical, isReplayable,
  type CanonicalSlice, type ReplayEntry, type ReplayLog, type StoreSlice,
} from './format';

export interface RecorderStatus {
  recording: boolean;
  steps: number;
  turns: number;
  /** Set only when the recording crosses a hard boundary (resumeGame / an MP start) that
   *  makes the log unreplayable; export refuses. Undefined during normal recording. */
  invalidReason?: string;
}

// Actions that make a recording genuinely unreplayable if they occur mid-recording: they
// wholesale-replace `game` from outside the recorded action stream, so entries after them
// can't chain from the log's init. Enumerable + deterministic (unlike the old hash-drift
// proxy, which fired on benign React interleaving). export() refuses if one was crossed.
const BOUNDARY = new Set<string>(['resumeGame', 'startMultiplayer', 'assembleMpGame']);

class Recorder {
  /** True while a game is being recorded (set by startSolo). */
  active = false;
  /** True while the replay runner re-executes actions — the middleware passes through and
   *  onAction() no-ops so replay doesn't self-record. */
  suspended = false;

  private log: ReplayLog | null = null;
  private lastTurn = 0;
  private invalidReason: string | undefined;

  private listeners = new Set<() => void>();
  private status: RecorderStatus = { recording: false, steps: 0, turns: 0 };

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };
  getStatus = (): RecorderStatus => this.status;

  private notify() {
    this.status = {
      recording: this.active,
      steps: this.log?.entries.length ?? 0,
      turns: this.lastTurn,
      invalidReason: this.invalidReason,
    };
    for (const l of this.listeners) l();
  }

  private startGame(get: () => StoreSlice) {
    const slice = canonical(get());
    this.log = {
      format: LOG_FORMAT_VERSION, commit: COMMIT, mode: slice.conn.mode,
      recordedAt: 0, init: clone(slice), initHash: hashState(slice), entries: [],
    };
    this.lastTurn = slice.game.turn;
    this.active = true;
    this.invalidReason = undefined;
    this.notify();
  }

  suspend() { this.suspended = true; }
  resume() { this.suspended = false; }

  /** Called by the middleware for every non-nested, non-deny action. Recording is a pure
   *  append — no per-action drift check (validity is decided at export by replay()). */
  onAction(name: string, args: unknown[], draws: number[], get: () => StoreSlice) {
    if (this.suspended) return;
    if (name === 'startSolo') { this.startGame(get); return; }
    if (!this.active) return;
    try {
      const slice = canonical(get());
      const step = this.log!.entries.length + 1;
      // Allowlist routing: an entry is re-executable (kind:"action") ONLY if every arg is a
      // pure JSON value (isReplayable). Anything else — setGame(fn), a Map/class instance, or
      // a leaked DOM/React event from a store action wired straight as an onClick handler —
      // falls back to a state-paste that setStates the post-action result. This is why a
      // non-serializable arg can no longer crash clone() and silently drop the advance.
      const replayable = args.every(a => isReplayable(a));
      const entry: ReplayEntry = replayable
        // Action entries keep a full-state copy IN MEMORY (for a precise divergence diff);
        // download.ts strips it so committed fixtures stay compact.
        ? { step, kind: 'action', action: name, args: clone(args), rng: draws.slice(), hash: hashState(slice), state: clone(slice) }
        : { step, kind: 'paste', from: name, state: clone(slice), hash: hashState(slice) };
      if (slice.game.turn > this.lastTurn) {
        this.lastTurn = slice.game.turn;
        entry.turn = { turn: slice.game.turn, state: clone(slice) };
      }
      this.log!.entries.push(entry);
      this.notify();
    } catch (err) {
      // A recorder must NEVER silently drop an action: the state change already happened, so a
      // missing entry corrupts the log. If capture fails unexpectedly (the allowlist should
      // prevent it), invalidate loudly so export() refuses rather than emit a broken fixture.
      if (!this.invalidReason) {
        this.invalidReason = `recorder failed to capture "${name}" (${err instanceof Error ? err.message : String(err)}) — start a new game to record`;
        this.notify();
      }
    }
  }

  /** Called by the middleware when a deny-listed BOUNDARY action fires mid-recording. */
  onBoundary(name: string) {
    if (!this.active || this.invalidReason || !BOUNDARY.has(name)) return;
    this.invalidReason = `recording crossed a "${name}" boundary (game replaced) — start a new game to record`;
    this.notify();
  }

  /** The current log (cloned + stamped) for export, or null with a reason. Does NOT run
   *  replay() — validation is done by the caller (src/replay/exportReplay.ts) to avoid an
   *  import cycle. */
  getLog(): { log: ReplayLog | null; reason?: string } {
    if (!this.active || !this.log) return { log: null, reason: 'No active recording.' };
    if (this.invalidReason) return { log: null, reason: this.invalidReason };
    if (this.log.entries.length === 0) return { log: null, reason: 'Nothing recorded yet.' };
    return { log: clone({ ...this.log, recordedAt: Date.now() }) };
  }

  /** Test seam: forget the current game (used by tests between runs). */
  _resetForTest() {
    this.active = false; this.suspended = false; this.log = null;
    this.lastTurn = 0; this.invalidReason = undefined;
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
