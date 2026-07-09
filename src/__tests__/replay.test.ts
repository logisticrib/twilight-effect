// Phase 2 (tasks/test_seed_plan.md): the replay recorder + runner. Proves record → JSON →
// replay reproduces state deterministically (RNG captured + re-injected), that divergence is
// caught loudly, and that committed *.replay.json fixtures replay clean = permanent regressions.
import { describe, it, expect, beforeEach } from 'vitest';
import { gs, deckCards, mkPc, mkComp } from './helpers';
import { CATALOG } from '../data/catalog';
import { shuffle } from '../store/gameStore';
import { rng } from '../store/rng';
import { recorder } from '../replay/recorder';
import { replay, ReplayDivergence } from '../replay/replay';
import { tryExport } from '../replay/exportReplay';
import { canonical, isReplayable, stableStringify, hashState, accidentalArg } from '../replay/format';
import type { ReplayLog, ActionEntry, StoreSlice } from '../replay/format';

// Deep clone through ACTUAL JSON text — load-bearing: an in-memory replay would share object
// references with live state and pass even if a reducer compared an arg by reference. A disk
// fixture is deserialized (fresh objects); the round-trip reproduces that.
const roundTrip = (log: ReplayLog): ReplayLog => JSON.parse(JSON.stringify(log));

const FLAME = CATALOG.find(c => c.name === 'Flame-Spinner')!; // Companion, on-enter d6 roll
const SZ = CATALOG.filter(c => c.class1 === 'Sorcerer').slice(0, 3);

/** Record a short solo game that includes a real die roll (Flame-Spinner on-enter). Seeds a
 *  mid-game position while the recorder is suspended, then records the play. */
function recordDieGame(): ReplayLog {
  recorder._resetForTest();
  recorder.suspend();
  gs.getState().startSolo(deckCards, deckCards); // solo base (mode=solo); suspended → not recorded
  gs.setState(s => ({ game: { ...s.game,
    setupQueue: [], currentPhase: 'action' as const, activePlayer: 'p1' as const, selected: null,
    p1: { ...s.game.p1,
      hand: [FLAME],
      classZone: SZ.map((c, i) => ({ id: `cz${i}`, cls: 'Sorcerer', name: c.name, faceDown: false, cardData: c })),
      willpower: 5,
      board: { b3: mkPc('pc-actor', { cls: 'Sorcerer' }) },
    },
    // An enemy so Flame-Spinner's on-enter dieCheck has a target (else it fizzles, no roll).
    p2: { ...s.game.p2, board: { f1: mkComp('enemy-1', 'Enemy Grunt') } },
  } }));
  recorder.resume();
  recorder._beginForTest(() => gs.getState());
  gs.getState().selectEntity('pc-actor');
  gs.getState().beginPlay(FLAME.id);
  gs.getState().placeCard('b1');               // arms the on-enter target (enemy eligible)
  gs.getState().resolveActionTarget('enemy-1'); // resolves dieCheck → rollD6 → rng captured here
  gs.getState().adjustHp('pc-actor', -1);
  gs.getState().endTurn();
  const { log } = recorder.getLog();
  rng.reset();
  if (!log) throw new Error('recorder produced no log');
  return log;
}

beforeEach(() => { recorder._resetForTest(); rng.reset(); });

describe('rng boundary: capture then re-inject is deterministic', () => {
  it('re-injecting the captured draws reproduces a shuffle exactly', () => {
    const src = Array.from({ length: 24 }, (_, i) => i);
    const buf: number[] = [];
    rng.beginCapture(buf);
    const first = shuffle(src);
    rng.endCapture();
    expect(buf.length, 'shuffle drew randoms').toBeGreaterThan(0);

    let i = 0;
    rng.setSource(() => buf[i++]);
    const second = shuffle(src);
    rng.reset();
    expect(second).toEqual(first);
  });
});

describe('record → JSON → replay round-trips clean', () => {
  it('re-executes every action (with injected RNG) and every hash matches', () => {
    const log = recordDieGame();
    expect(log.entries.some(e => e.kind === 'action' && e.rng.length > 0), 'a die roll was captured').toBe(true);
    expect(log.mode).toBe('solo');
    // Through real JSON text — proves no reducer relies on arg object identity.
    expect(() => replay(roundTrip(log))).not.toThrow();
    // And again, to prove replay left the store re-runnable.
    expect(() => replay(roundTrip(log))).not.toThrow();
  });
});

describe('divergence is caught loudly', () => {
  it('a tampered post-action hash throws ReplayDivergence with step + action', () => {
    const log = recordDieGame();
    const victim = log.entries[1];
    const bad = roundTrip(log);
    bad.entries[1] = { ...bad.entries[1], hash: 'deadbeef' };
    try {
      replay(bad);
      throw new Error('expected divergence');
    } catch (e) {
      expect(e).toBeInstanceOf(ReplayDivergence);
      const d = e as ReplayDivergence;
      expect(d.step).toBe(victim.step);
    }
  });

  it('RNG underrun (a drawing action missing a recorded value) throws with context', () => {
    const log = recordDieGame();
    const bad = roundTrip(log);
    const rngEntry = bad.entries.find((e): e is ActionEntry => e.kind === 'action' && e.rng.length > 0)!;
    rngEntry.rng = rngEntry.rng.slice(0, -1); // drop one draw → the reducer draws past the end
    expect(() => replay(bad)).toThrow(/underrun/i);
  });

  it('RNG surplus (an unconsumed recorded value) throws on the exact-empty assertion', () => {
    const log = recordDieGame();
    const bad = roundTrip(log);
    const anyAction = bad.entries.find((e): e is ActionEntry => e.kind === 'action')!;
    anyAction.rng = [...anyAction.rng, 0.5]; // one more than the reducer will draw
    expect(() => replay(bad)).toThrow(/surplus/i);
  });

  // The divergence report must name the first diverging FIELD (recorded vs replayed), not just
  // two opaque hashes — that's what makes a copied export error actionable. Forced by tampering
  // a recorded action's arg so re-execution produces a genuinely different canonical state.
  it('a divergence report names the first diverging canonical field', () => {
    recorder._resetForTest();
    gs.getState().startSolo(deckCards, deckCards); // starts recording
    gs.getState().selectEntity('entity-X');        // recorded: game.selected = 'entity-X'
    const bad = roundTrip(recorder.getLog().log!);
    const e = bad.entries.find((x): x is ActionEntry => x.kind === 'action' && x.action === 'selectEntity')!;
    e.args = ['entity-Y'];                          // replay selects Y → real state divergence
    try {
      replay(bad);
      throw new Error('expected divergence');
    } catch (err) {
      expect(err).toBeInstanceOf(ReplayDivergence);
      const d = err as ReplayDivergence;
      expect(d.diff, `diff was: ${d.diff}`).toMatch(/game\.selected/);
      expect(d.diff).toMatch(/entity-X/); // recorded value present in the report
      expect(d.diff).toMatch(/entity-Y/); // replayed value present
    }
  });

  // download.ts strips `state` from action entries (fixtures stay lean), so a FIXTURE
  // divergence can only field-diff against the last turn checkpoint — that diff is CUMULATIVE
  // drift since the checkpoint, not this entry's change (observed 2026-07-08: a switchSides
  // divergence printed `game.activePlayer: p1 → p2`, which was just turn progression). The
  // report must label the anchor honestly and carry the live failing state instead.
  it('a stripped (fixture-shaped) entry labels its diff as cumulative drift + includes the live state', () => {
    recorder._resetForTest();
    gs.getState().startSolo(deckCards, deckCards); // starts recording
    gs.getState().selectEntity('entity-X');
    const bad = roundTrip(recorder.getLog().log!);
    // What download.ts ships: no per-entry state on actions.
    bad.entries = bad.entries.map(e => e.kind === 'action' ? { ...e, state: undefined } : e);
    const e = bad.entries.find((x): x is ActionEntry => x.kind === 'action' && x.action === 'selectEntity')!;
    e.args = ['entity-Y']; // replay selects Y → real state divergence
    try {
      replay(bad);
      throw new Error('expected divergence');
    } catch (err) {
      expect(err).toBeInstanceOf(ReplayDivergence);
      const d = err as ReplayDivergence;
      expect(d.diff, `diff was: ${d.diff}`).toMatch(/CUMULATIVE drift/);
      expect(d.diff).toMatch(/vs (init|last checkpoint \(turn \d+\))/);
      expect(d.diff).not.toContain('first diverging field:'); // the precise-diff label must not appear
      // The report carries the actual failing (replayed) state — d.current AND the message.
      expect(d.current.game.selected).toBe('entity-Y');
      expect(d.message).toContain('live post-action state');
      expect(d.message).toContain(stableStringify(d.current));
    }
  });
});

// Validity is decided at export by replaying the log (the deterministic oracle) — NOT by a
// per-action hash-drift proxy (which fired on benign React interleaving). A normally-recorded
// game exports clean; only a hard, enumerable boundary (resumeGame / an MP start) refuses.
describe('export validation (replay is the oracle)', () => {
  function seedActive() {
    recorder._resetForTest();
    recorder.suspend();
    gs.getState().startSolo(deckCards, deckCards);
    gs.setState(s => ({ game: { ...s.game, setupQueue: [], currentPhase: 'action' as const, selected: null } }));
    recorder.resume();
    recorder._beginForTest(() => gs.getState());
  }

  it('a normally recorded game (incl. a die roll) validates + exports clean', () => {
    recordDieGame();                 // leaves an active, replayable recording
    const res = tryExport();
    expect(res.ok, res.ok ? '' : res.error).toBe(true);
  });

  it('inter-action churn (selection, no-op setGame) still exports clean', () => {
    seedActive();
    gs.getState().selectEntity('unit-a');
    gs.getState().setGame(g => ({ ...g, selected: 'unit-b' })); // paste
    gs.getState().selectEntity('unit-c');
    const res = tryExport();
    expect(res.ok, res.ok ? '' : res.error).toBe(true);
  });

  // Categorical fix for the setup-divergence bug: a store action wired straight as an onClick
  // handler is invoked with the click event as args[0]. The event is a cyclic DOM object, so the
  // old clone(args) threw AFTER the action mutated state but BEFORE pushing the entry — the
  // advance applied to live state but vanished from the log, and replay under-walked setupQueue.
  // Now a non-JSON arg routes to a state-paste (isReplayable) and an entry is never dropped.
  it('an action called with a leaked (circular) event arg records as a paste, never dropped, exports clean', () => {
    recorder._resetForTest();
    recorder.suspend();
    gs.getState().startSolo(deckCards, deckCards);
    gs.setState(s => ({ game: { ...s.game, setupQueue: ['classbonus:p1', 'place-pc:p1'] } }));
    recorder.resume();
    recorder._beginForTest(() => gs.getState());     // init snapshots this setupQueue

    const evt: Record<string, unknown> = { type: 'click', nativeEvent: {} };
    evt.currentTarget = evt;                          // cyclic, like a DOM node / SyntheticEvent
    // advanceSetup is typed () => void; wiring it as onClick passes the event anyway at runtime.
    (gs.getState().advanceSetup as unknown as (a: unknown) => void)(evt);

    // The advance applied live AND was captured (no silent drop, no invalidation).
    expect(gs.getState().game.setupQueue).toEqual(['place-pc:p1']);
    expect(recorder.getStatus().invalidReason).toBeUndefined();
    const entries = recorder.getLog().log!.entries;
    expect(entries[entries.length - 1].kind).toBe('paste'); // non-serializable arg → paste

    const res = tryExport();
    expect(res.ok, res.ok ? '' : res.error).toBe(true);
  });

  // Paste-path regression: a paste snapshot is stored as a JSON clone, but its hash used to be
  // computed on the pre-clone slice. An undefined-valued canonical field (game.pN._pc, set by
  // placePc) is emitted as null by the pre-clone hash but DROPPED by the clone, so the stored
  // hash disagreed with the installed snapshot and the paste diverged on replay (owner's step-39
  // endTurnToEndPhase). Fixed by making stableStringify omit undefined keys (round-trip-stable).
  it('an event-wired paste after PC placement (_pc undefined) exports clean', () => {
    recorder._resetForTest();
    recorder.suspend();
    gs.getState().startSolo(deckCards, deckCards);
    // Clean init at a place-pc step with the PC staged (real object → no undefined field yet).
    gs.setState(s => ({ game: { ...s.game, setupQueue: ['place-pc:p1'],
      currentPhase: 'action' as const, p1: { ...s.game.p1, _pc: mkPc('pc-stage'), board: {} } } }));
    recorder.resume();
    recorder._beginForTest(() => gs.getState());       // init: _pc is a real object → clean
    gs.getState().placePc('b1', 'p1');                  // ACTION → sets p1._pc = undefined, advances queue
    // endTurnToEndPhase wired as onClick (PhaseRail:124) passes the event → recorded as a paste
    // whose JSON snapshot drops the undefined _pc key.
    const evt: Record<string, unknown> = { type: 'click' }; evt.currentTarget = evt;
    (gs.getState().endTurnToEndPhase as unknown as (a: unknown) => void)(evt);
    const entries = recorder.getLog().log!.entries;
    expect(entries[entries.length - 1].kind).toBe('paste');
    const res = tryExport();
    expect(res.ok, res.ok ? '' : res.error).toBe(true);
  });

  // Fidelity audit. A leaked handler arg demotes a re-executable action into a state-paste: the
  // log stays CORRECT but that reducer never re-runs on replay, so the fixture silently
  // under-tests it. The recorder now flags exactly that, while leaving genuine setGame(fn)
  // updater pastes alone. Goal: the next bare-wired component fails a test the day it's written.
  it('flags an accidental action→paste demotion (no-arg action invoked with a leaked event)', () => {
    seedActive();
    const evt: Record<string, unknown> = { type: 'click' }; evt.currentTarget = evt;
    // `advanceSetup: () => void` (arity 0) wired as onClick → React passes the event as args[0].
    (gs.getState().advanceSetup as unknown as (a: unknown) => void)(evt);

    const log = recorder.getLog().log!;
    expect(log.entries[log.entries.length - 1].kind).toBe('paste'); // correct...
    expect(log.demotions).toHaveLength(1);                           // ...but flagged as accidental
    expect(log.demotions[0]).toMatchObject({ action: 'advanceSetup', argIndex: 0, arity: 0 });
    expect(recorder.getStatus().demotions).toBe(1);                  // surfaced in the chip
    // Still exports clean — a demotion is a fidelity warning, not a correctness failure.
    expect(tryExport().ok).toBe(true);
  });

  it('does NOT flag a genuine setGame(fn) updater paste', () => {
    seedActive();
    gs.getState().setGame(g => ({ ...g, selected: 'unit-a' })); // function in a DECLARED slot
    const log = recorder.getLog().log!;
    expect(log.entries[log.entries.length - 1].kind).toBe('paste');
    expect(log.demotions).toEqual([]);
    expect(recorder.getStatus().demotions).toBe(0);
  });

  it('a recording that crosses a resumeGame boundary refuses to export', () => {
    seedActive();
    gs.getState().saveGame();          // savedGame = current
    gs.getState().selectEntity('unit-a');
    gs.getState().resumeGame();        // BOUNDARY (game replaced) → recording unrepayable
    const res = tryExport();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/resumeGame/i);
    expect(recorder.getStatus().invalidReason, 'chip reflects the boundary').toMatch(/resumeGame/i);
  });

  // Confirmation (1): tryExport's whole value is inheriting replay()'s rejection — a divergent
  // log must be refused AT EXPORT (not only the boundary case), with the divergence report.
  it('refuses a hash-tampered log at export (inherits ReplayDivergence)', () => {
    const bad = roundTrip(recordDieGame());
    bad.entries[1] = { ...bad.entries[1], hash: 'deadbeef' };
    const res = tryExport(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/divergence/i);
  });

  it('refuses an RNG-short log at export (inherits the underrun error)', () => {
    const bad = roundTrip(recordDieGame());
    const e = bad.entries.find((x): x is ActionEntry => x.kind === 'action' && x.rng.length > 0)!;
    e.rng = e.rng.slice(0, -1);
    const res = tryExport(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/underrun/i);
  });

  // Confirmation (2): the non-destructive validation must restore the FULL canonical slice —
  // every field, not just `game`. Made NON-VACUOUS by applying a non-recorded divergent change
  // to every canonical field right before export: replay lands on the *recorded* (init) state,
  // which differs from `before` on every field, so `after === before` can only hold if the
  // restore recovered ALL of them (a game-only restore would leave prompts/localPlayer/mode
  // stuck at the replayed values).
  it('export is non-destructive: the entire canonical slice is restored (every field)', () => {
    recorder._resetForTest();
    recorder.suspend();
    gs.getState().startSolo(deckCards, deckCards);           // localPlayer='p1', conn.mode='solo'
    gs.setState(s => ({ game: { ...s.game, setupQueue: [], currentPhase: 'action' as const } }));
    recorder.resume();
    recorder._beginForTest(() => gs.getState());             // init = this clean state
    gs.getState().selectEntity('rec');                        // one recorded action (log non-empty)

    // Non-recorded divergent change on EVERY canonical field (the log won't reproduce these):
    gs.setState(s => ({
      game: { ...s.game, turn: 999, selected: 'DIVERGED' },
      localPlayer: 'p2' as const,
      conn: { ...s.conn, mode: 'host' as const },
      pending: { kind: 'move' } as never,
      pendingPlay: { cardId: 'c1', actorId: 'a1' } as never,
      pendingTrigger: { kind: 'reinforce', n: 2, sourceName: 'T' } as never,
      pendingKit: { sourceName: 'K', step: 'source', eligibleIds: [] } as never,
      pendingActionTarget: { source: 'action', sourceName: 'A', lp: 'p1', effects: [], eligibleIds: ['e'] } as never,
      pendingEquipPick: { source: 'E', lp: 'p1', targetId: 't', items: [] } as never,
      oathContext: { marker: 42 } as never,
      modalQueue: ['m1', 'm2'],
    }));
    const before = JSON.parse(JSON.stringify(canonical(gs.getState() as unknown as StoreSlice)));
    tryExport();                                              // replay → init state (≠ before); finally restores
    const after = canonical(gs.getState() as unknown as StoreSlice);
    expect(after, 'every canonical field restored exactly').toEqual(before);
  });
});

// Committed fixtures (dropped in by real playtests) replay clean. Empty until the first is added.
const fixtures = import.meta.glob('../replay/fixtures/*.replay.json', { eager: true }) as Record<string, { default: ReplayLog }>;
describe('committed replay fixtures', () => {
  const names = Object.keys(fixtures);
  if (names.length === 0) {
    it('no fixtures yet (drop *.replay.json into src/replay/fixtures/)', () => { expect(true).toBe(true); });
  }
  for (const name of names) {
    it(`replays clean: ${name.split('/').pop()}`, () => {
      expect(() => replay(fixtures[name].default)).not.toThrow();
    });
    // A committed fixture must be a HIGH-FIDELITY regression: every recordable action re-executes
    // on replay. Any demotion means a bare-wired call site turned a reducer into a setState.
    it(`records zero accidental demotions: ${name.split('/').pop()}`, () => {
      const log = fixtures[name].default;
      expect(log.demotions, 'fixture predates the demotion audit (log format v3) — re-record it').toBeDefined();
      expect(log.demotions, "a demoted action never re-executes on replay — fix the bare onClick={action} call site (use onClick={() => action()}) and re-record").toEqual([]);
    });
  }
});

// The categorical rule behind the demotion audit. Arity ALONE is not the test: a leaked event
// landing on a declared parameter slot (selectEntity(event)) is still junk the action never asked
// for. Only a FUNCTION in a declared slot — setGame(fn) — is a legitimate updater paste.
describe('accidentalArg — legitimate updater vs leaked handler arg', () => {
  const fn = () => {};
  const evt: Record<string, unknown> = { type: 'click' }; evt.currentTarget = evt; // cyclic, like a DOM event

  it('returns null for replayable args and for a declared updater function', () => {
    expect(accidentalArg([], 0)).toBeNull();                    // endTurn()
    expect(accidentalArg(['b1', 'p1'], 2)).toBeNull();          // placePc('b1','p1')
    expect(accidentalArg([fn], 1)).toBeNull();                  // setGame(fn) — GENUINE paste
  });

  it('flags a non-replayable arg the action never declared', () => {
    expect(accidentalArg([evt], 0)).toEqual({ index: 0, type: 'Object' });   // endTurn(event)
    expect(accidentalArg([evt], 1)).toEqual({ index: 0, type: 'Object' });   // selectEntity(event) — declared slot, still junk
    expect(accidentalArg([fn], 0)).toEqual({ index: 0, type: 'function' });  // fn to a no-arg action
    expect(accidentalArg(['ok', new Map()], 2)).toEqual({ index: 1, type: 'Map' });
  });
});

// The recorder decides action-vs-paste by "is this arg replayable" (round-trips through JSON),
// an allowlist — NOT a blocklist of banned DOM/event types — so the next non-serializable arg
// class (Map, class instance, function, cycle) can't reintroduce the silent-drop bug.
describe('isReplayable — the arg allowlist', () => {
  it('accepts pure JSON values (recorded as re-executable actions)', () => {
    for (const v of ['b1', 42, 0, -1, true, false, null, ['a', 1, { k: [2, 3] }], { id: 'x', n: { a: [1] } }]) {
      expect(isReplayable(v), `${JSON.stringify(v)} should be replayable`).toBe(true);
    }
  });
  it('rejects anything that cannot round-trip through JSON (→ state-paste)', () => {
    class Widget { x = 1; }
    const cyc: Record<string, unknown> = { type: 'click' }; cyc.currentTarget = cyc; // like a React event
    for (const v of [() => {}, undefined, Symbol('s'), 10n, NaN, Infinity, new Map([['a', 1]]), new Set([1]), new Widget(), cyc, { ok: 'y', bad: () => {} }, [1, () => {}]]) {
      expect(isReplayable(v), `${String(v)} should NOT be replayable`).toBe(false);
    }
  });
});

// The hash MUST be invariant across a JSON round-trip — fixtures are JSON and paste snapshots
// are JSON clones, so a hash that counted undefined keys (as null) while JSON dropped them made
// pastes diverge. Pins the property itself (not just the _pc case) so it can't silently regress.
describe('stableStringify / hashState round-trip stability', () => {
  const rt = (x: unknown) => JSON.parse(JSON.stringify(x));
  it('are invariant across JSON.parse(JSON.stringify(x)) for undefined (top-level, nested, in-array)', () => {
    const samples: unknown[] = [
      { a: undefined },                                    // top-level undefined key → dropped
      { a: 1, b: undefined, c: null },                     // null stays, undefined goes
      { nested: { x: undefined, y: 2 } },                  // nested undefined key
      { arr: [1, undefined, 3] },                          // undefined IN an array → null (kept)
      { deep: { arr: [{ k: undefined, j: 5 }], z: undefined } },
      { _pc: undefined, board: { b1: { id: 'x', hp: 3 } } }, // the real placement shape
    ];
    for (const s of samples) {
      expect(stableStringify(s), `stableStringify not stable: ${JSON.stringify(s)}`).toBe(stableStringify(rt(s)));
      expect(hashState(s as never), `hashState not stable: ${JSON.stringify(s)}`).toBe(hashState(rt(s) as never));
    }
  });
});
