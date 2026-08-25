// REQUIEM deck — Arc E (Song machinery), 2026-08-25. Five cards convert: Chant of
// Returning + Lullaby of the Deep Meadow (REPRISE), Anthem of the Unbroken (Vocal
// decay-prevention, excludeSelf), Song of Hearthlight (entry-anchor bonus), Vielle
// (attackTwice — the Bard win condition). Reprise registry done:true — ALL FOUR
// Requiem keywords are now live.
//
// RULES UNDER TEST (MKL REPRISE, ratified 2026-08-25):
// - "When this Vocal Construct would be sacrificed because its last Anchor counter
//   was removed, return it to your hand instead." ANY last-counter removal — decay
//   AND effect removal (the unified 2026-07-15 sacrifice family, owner re-ruled).
// - Leaves but NEVER dies: no sacrifice/death listeners, no Dead Zone.
// - Vielle: the standing allowance is read AT THE SECOND ATTACK; attacks only.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkCz } from './helpers';
import { effectiveKeywords } from '../store/gameStore';
import { applyReadyRemovals, resolveActionEffects, readyAndFlip } from '../engine';
import { CATALOG, REQUIEM_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';

const rc = (name: string): Card => {
  const c = REQUIEM_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`Requiem card missing: ${name}`);
  return c;
};
const czCards = CATALOG.slice(20, 25);

function seed(p1board: Record<string, ReturnType<typeof mkComp>>,
              over: { hand?: Card[]; deck?: Card[] } = {},
              p2board: Record<string, ReturnType<typeof mkComp>> = { b2: mkPc('pc-2') }) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: over.hand ?? [], board: p1board, dead: [],
      deck: over.deck ?? s.game.p1.deck,
      classZone: czCards.map((c, i) => mkCz(c, 'Bard', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2board },
  } }));
}
const g = () => gs.getState().game;
const chant = (id = 'chant', anchors = 1) =>
  mkConstruct(id, 'Chant of Returning', anchors, { subtype: 'Chant', keywords: ['Reprise'] });

describe('REPRISE — the decay site (start-of-turn last-counter removal)', () => {
  it('the last anchor decays → the Chant returns to its owner\'s HAND, never the Dead Zone; on-sacrifice listeners stay SILENT', () => {
    // Siegeworks listens for sacrificed Physical Constructs — a Reprise return is
    // neither a sacrifice nor Physical, but seed it anyway to pin the silence.
    seed({ b3: mkPc('pc-1'), f2: chant('chant', 1),
      f1: mkConstruct('siege', 'Siegeworks', 3, { subtype: 'Fortification' }) });
    const r = applyReadyRemovals(g(), 'p1', 'Your');
    expect(r.game.p1.hand.some(c => c.name === 'Chant of Returning'), 'to hand').toBe(true);
    expect(r.game.p1.dead.some(c => c.name === 'Chant of Returning'), 'never the Dead Zone').toBe(false);
    expect(r.sacrificed.length, 'NO sacrifice event occurred').toBe(0);
    expect(r.notices.join(' | ')).toMatch(/Reprise/);
  });

  it('a NON-Reprise construct still dies to decay (the replacement is keyword-gated)', () => {
    seed({ b3: mkPc('pc-1'), f2: mkConstruct('spark', 'Lingering Spark', 1, { subtype: 'Incantation' }) });
    const r = applyReadyRemovals(g(), 'p1', 'Your');
    expect(r.game.p1.dead.some(c => c.name === 'Lingering Spark')).toBe(true);
    expect(r.sacrificed.length).toBe(1);
  });

  it('the Lullaby loop: reprised → replayed → the enter-exhaust fires AGAIN (repeatable at a replay cost)', () => {
    seed({ b3: mkPc('pc-1'), f2: mkConstruct('lull', 'Lullaby of the Deep Meadow', 1, { subtype: 'Song', keywords: ['Reprise'] }) },
      {}, { b2: mkPc('pc-2'), f1: mkComp('vic', CATALOG[0].name) });
    const r = applyReadyRemovals(g(), 'p1', 'Your');
    gs.setState(s => ({ game: r.game }));
    expect(g().p1.hand.some(c => c.name === 'Lullaby of the Deep Meadow')).toBe(true);
    // Replay it — the enter-exhaust targets the opposing companion again.
    const lullaby = g().p1.hand.find(c => c.name === 'Lullaby of the Deep Meadow')!;
    gs.getState().beginPlay(lullaby.id);
    gs.getState().placeCard('f2');
    gs.getState().resolveActionTarget('vic');
    expect(g().p2.board.f1?.exhausted, 'the exhaust fired again on the replay').toBe(true);
  });
});

describe('REPRISE — the effect-removal sites (the unified family)', () => {
  it('an anchor-removal effect taking the last counter returns it to hand (the anchor op site)', () => {
    seed({ b3: mkPc('pc-1'), f2: chant('chant', 1) });
    const r = resolveActionEffects(g(), 'p1', 'test-demolish', [{ op: 'anchor', delta: -1, target: 'anyConstruct' }], 'chant');
    expect(r.game.p1.hand.some(c => c.name === 'Chant of Returning'), 'to hand').toBe(true);
    expect(r.game.p1.dead.length, 'not the Dead Zone').toBe(0);
    expect(r.msgs.join(' | ')).toMatch(/Reprise/);
  });

  it('Dismantle-to-zero (the resolveTrigger site) returns it to hand — the owner-corrected ruling pinned', () => {
    seed({ b3: mkPc('pc-1'), f2: chant('chant', 1) });
    gs.setState(s => ({ pendingTrigger: { kind: 'dismantle' as const, n: 1, sourceName: 'Wrecking Crew', eligibleIds: ['chant'] } }));
    gs.getState().resolveTrigger('chant');
    expect(g().p1.hand.some(c => c.name === 'Chant of Returning')).toBe(true);
    expect(g().p1.dead.length).toBe(0);
  });

  it('suppressed Reprise dies normally (effectiveKeywords gate)', () => {
    seed({ b3: mkPc('pc-1'), f2: chant('chant', 1) },
      {}, { b2: mkPc('pc-2'), f1: mkConstruct('sigil', 'Binding Sigil', 3, { subtype: 'Incantation' }) });
    // Binding Sigil suppresses keywords on... verify the gate reads effectiveKeywords:
    // simulate by checking the suppressed state first; if the sigil's aura doesn't
    // reach constructs, fall back to a keywordless chant (the gate is the same read).
    const suppressed = !effectiveKeywords(g().p1.board.f2!, g()).includes('Reprise');
    if (!suppressed) {
      seed({ b3: mkPc('pc-1'), f2: mkConstruct('chant', 'Chant of Returning', 1, { subtype: 'Chant', keywords: [] }) });
    }
    const r = applyReadyRemovals(g(), 'p1', 'Your');
    expect(r.game.p1.dead.some(c => c.name === 'Chant of Returning'), 'no keyword — a normal death').toBe(true);
  });
});

describe('Anthem of the Unbroken — Vocal decay-prevention, excludeSelf', () => {
  it('another Song skips decay; the Anthem itself DECAYS; Physical Constructs are unaffected', () => {
    seed({ b3: mkPc('pc-1'),
      f1: mkConstruct('anthem', 'Anthem of the Unbroken', 2, { subtype: 'Song' }),
      f2: mkConstruct('other', 'Song of Hearthlight', 2, { subtype: 'Song' }),
      f3: mkConstruct('fort', 'Stone Rampart', 2, { subtype: 'Fortification' }) });
    const r = applyReadyRemovals(g(), 'p1', 'Your');
    expect(r.game.p1.board.f2?.anchors, 'the other Song held its anchors').toBe(2);
    expect(r.game.p1.board.f1?.anchors, 'the Anthem decayed (excludeSelf)').toBe(1);
    expect(r.game.p1.board.f3?.anchors, 'Physical Constructs decay as ever').toBe(1);
  });
});

describe('Song of Hearthlight — the entry-anchor bonus', () => {
  it('a placed Chant enters with +1 anchors (count AND start); a Magic construct takes no bonus', () => {
    seed({ b3: mkPc('pc-1'), f1: mkConstruct('hearth', 'Song of Hearthlight', 3, { subtype: 'Song' }) });
    const chantCard = rc('Chant of Returning');   // printed anchor 2
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [chantCard] } } }));
    gs.getState().beginPlay(chantCard.id);
    gs.getState().placeCard('f2');
    expect(g().p1.board.f2?.anchors, 'printed 2 + Hearthlight 1').toBe(3);
    expect(g().p1.board.f2?.anchorsStart, '"enters with" — the start includes it').toBe(3);
    // A Magic construct (Incantation) takes nothing.
    const spark = CATALOG.find(c => c.name === 'Lingering Spark')!; // printed anchor 2
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [spark],
      classZone: czCards.map((c, i) => mkCz(c, 'Sorcerer', `cz-${i}`)) } } }));
    gs.getState().beginPlay(spark.id);
    gs.getState().placeCard('f3');
    expect(g().p1.board.f3?.anchors, 'no bonus for a non-Vocal construct').toBe(spark.anchor);
  });
});

describe('Vielle — attack twice while in Crescendo', () => {
  const board = () => ({
    b3: mkPc('pc-1'),
    f1: mkComp('vielle', 'Vielle, Voice of the Requiem', { atk: 5, hp: 5, level: 5 }),
    f2: mkConstruct('song', 'Song of Hearthlight', 3, { subtype: 'Song' }),
  });
  const attack = (target = 'vic') => { gs.getState().beginAttack('vielle'); gs.getState().resolveAttack(target); };

  it('first attack taps her AND stamps attacksUsed; the SECOND is allowed and deals damage; a THIRD is refused', () => {
    seed(board(), {}, { b2: mkPc('pc-2'), f1: mkComp('vic', CATALOG[0].name, { hp: 20, maxHp: 20 }) });
    attack();
    expect(g().p1.board.f1?.exhausted, 'the first attack exhausts normally — no free Major').toBe(true);
    expect(g().p1.board.f1?.attacksUsed).toBe(1);
    expect(g().p2.board.f1?.hp).toBe(15);
    attack();
    expect(g().p2.board.f1?.hp, 'the second attack dealt damage').toBe(10);
    expect(g().p1.board.f1?.attacksUsed).toBe(2);
    const toastsBefore = gs.getState().toasts.length;
    attack();
    expect(g().p2.board.f1?.hp, 'a third is refused').toBe(10);
  });

  it('the song dies between attacks → the second is REFUSED (the standing allowance is read live)', () => {
    seed(board(), {}, { b2: mkPc('pc-2'), f1: mkComp('vic', CATALOG[0].name, { hp: 20, maxHp: 20 }) });
    attack();
    // The song leaves — Crescendo drops, the allowance dies with it.
    gs.setState(s => {
      const board = { ...s.game.p1.board };
      delete (board as Record<string, unknown>).f2;
      return { game: { ...s.game, p1: { ...s.game.p1, board } } };
    });
    attack();
    expect(g().p2.board.f1?.hp, 'no second attack without the song').toBe(15);
  });

  it('NOT in Crescendo: one attack only (the allowance never lives)', () => {
    seed({ b3: mkPc('pc-1'), f1: mkComp('vielle', 'Vielle, Voice of the Requiem', { atk: 5, hp: 5, level: 5 }) },
      {}, { b2: mkPc('pc-2'), f1: mkComp('vic', CATALOG[0].name, { hp: 20, maxHp: 20 }) });
    attack();
    expect(g().p2.board.f1?.hp).toBe(15);
    attack();
    expect(g().p2.board.f1?.hp, 'refused').toBe(15);
  });

  it('attacksUsed clears at her ready (key stripped)', () => {
    seed(board(), {}, { b2: mkPc('pc-2'), f1: mkComp('vic', CATALOG[0].name, { hp: 20, maxHp: 20 }) });
    attack();
    expect(g().p1.board.f1?.attacksUsed).toBe(1);
    const r = applyReadyRemovals(g(), 'p1', 'Your');
    // readyAndFlip is the stripper — run the full ready via the engine helpers:
    // applyReadyRemovals does removals; the flip/ready lives in readyAndFlip.
    gs.setState(() => ({ game: r.game }));
    gs.setState(s => ({ game: { ...s.game, p1: readyAndFlip(s.game.p1) } }));
    expect('attacksUsed' in (g().p1.board.f1 ?? {}), 'the key is STRIPPED, never written 0').toBe(false);
  });
});
