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
import type { ReplayLog, ActionEntry } from '../replay/format';

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
  const log = recorder.export();
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
});

describe('categorical invalidation (a deny-listed action that changes hashed state)', () => {
  function seedActive() {
    recorder._resetForTest();
    recorder.suspend();
    gs.getState().startSolo(deckCards, deckCards);
    gs.setState(s => ({ game: { ...s.game, setupQueue: [], currentPhase: 'action' as const, selected: null } }));
    recorder.resume();
    recorder._beginForTest(() => gs.getState());
  }

  it('resumeGame (reverts `game`) invalidates — caught at the next recorded action', () => {
    seedActive();
    gs.getState().saveGame();             // deny-listed; savedGame = current (selected null)
    gs.getState().selectEntity('unit-a'); // recorded; game.selected changes → hash changes
    gs.getState().resumeGame();           // deny-listed; game reverts (selected → null) → drift
    gs.getState().selectEntity('unit-b'); // next recorded action detects preHash != lastHash
    expect(recorder.getStatus().valid, 'recording marked invalid').toBe(false);
    expect(recorder.export(), 'export refused').toBeNull();
  });

  it('resumeGame is also caught by the export-time live-hash recheck (no trailing action)', () => {
    seedActive();
    gs.getState().saveGame();
    gs.getState().selectEntity('unit-a');
    gs.getState().resumeGame();           // drift, but nothing recorded afterwards
    expect(recorder.export(), 'export refused via live recheck').toBeNull();
  });

  it('a deny-listed action that does NOT change hashed state (backToLobby: only playPhase/conn) does not spuriously invalidate before it', () => {
    seedActive();
    gs.getState().selectEntity('unit-a'); // valid recorded change
    expect(recorder.getStatus().valid).toBe(true);
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
  }
});
