// REQUIEM deck — Arc F (the finale), 2026-08-25. Eleven cards convert and the flag
// list reaches ZERO: Glimmerwood Teller, Feast for Worms, Ossuary Altar, Turn of
// Phrase, Chorus Bell, Gravecharm Locket, Steal the Show, Discordant Air, Lay to
// Rest, Toll the Silence, Field of the Unquiet. PROGRAM 3 COMPLETE — all 50 Requiem
// cards carry live behavior.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { destroyEntity, applyReadyRemovals, armNextItemTransfer, armPrompts } from '../engine';
import { CATALOG, REQUIEM_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';

const rc = (name: string): Card => {
  const c = REQUIEM_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`Requiem card missing: ${name}`);
  return c;
};
const czCards = CATALOG.slice(20, 25);

function seed(p1board: Record<string, ReturnType<typeof mkComp>>,
              over: { hand?: Card[]; dead?: Card[]; deck?: Card[]; cls?: string } = {},
              p2board: Record<string, ReturnType<typeof mkComp>> = { b2: mkPc('pc-2') }) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: over.hand ?? [], board: p1board, dead: over.dead ?? [],
      deck: over.deck ?? s.game.p1.deck,
      classZone: czCards.map((c, i) => mkCz(c, over.cls ?? 'Necromancer', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2board },
  } }));
}
const g = () => gs.getState().game;
const play = (card: Card) => {
  gs.setState(s => ({ game: { ...s.game, selected: 'pc-1', p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().playAction(card.id);
};
const place = (card: Card, slot: string) => {
  gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot as never);
};
const filler = CATALOG.filter(c => c.type === 'Companion' && !c.dev).slice(0, 6);
const byLevel = (lvl: number) => CATALOG.find(x => x.type === 'Companion' && !x.dev && x.level === lvl)!;

describe('ZERO FLAGS — Program 3 complete', () => {
  it('no Requiem card carries a DEV NOT-IMPLEMENTED flag any more', () => {
    const flagged = REQUIEM_DEV_CARDS.filter(c => c.effectsFlag?.includes('NOT-IMPLEMENTED'));
    expect(flagged.map(c => c.name), 'the machinery debt is PAID').toEqual([]);
  });
});

describe('Glimmerwood Teller — the own-choice discard', () => {
  it('enter → draw, then the CONTROLLER\'s own discard prompt; resolving sends the pick to the Dead Zone', () => {
    const [A, B] = filler;
    seed({ b3: mkPc('pc-1') }, { deck: [A, B], cls: 'Bard' });
    place(rc('Glimmerwood Teller'), 'b1');
    expect(g().p1.hand.map(c => c.id), 'drew first').toEqual([A.id]);
    expect(g().pendingDiscard?.victim, 'the discard prompt belongs to the CONTROLLER').toBe('p1');
    gs.getState().resolveDiscard(A.id);
    expect(g().p1.hand.length).toBe(0);
    expect(g().p1.dead.some(c => c.id === A.id), 'discarded to the Dead Zone').toBe(true);
  });
});

describe('Feast for Worms — the own-companion sacrifice', () => {
  it('pick an own companion → a REAL sacrifice → draw 2; the PC is never offered', () => {
    const [A, B, C] = filler;
    seed({ b3: mkPc('pc-1'), f1: mkComp('lamb', filler[3].name, { hp: 3 }) }, { deck: [A, B, C] });
    play(rc('Feast for Worms'));
    const pa = gs.getState().pendingActionTarget;
    expect(pa?.eligibleIds).toContain('lamb');
    expect(pa?.eligibleIds, 'the PC is structurally ineligible').not.toContain('pc-1');
    gs.getState().resolveActionTarget('lamb');
    expect(g().p1.board.f1 ?? null, 'sacrificed').toBeFalsy();
    expect(g().p1.dead.some(c => c.name === filler[3].name)).toBe(true);
    expect(g().p1.hand.length, 'drew 2').toBe(2);
  });

  it('no companions → the action fizzles, no draw', () => {
    seed({ b3: mkPc('pc-1') }, { deck: filler.slice(0, 2) });
    play(rc('Feast for Worms'));
    expect(gs.getState().pendingActionTarget ?? null).toBeFalsy();
    expect(g().p1.hand.length, 'no free draw').toBe(0);
  });
});

describe('Ossuary Altar — the own-companion-death listener', () => {
  const altar = () => mkConstruct('altar', 'Ossuary Altar', 3, { subtype: 'Incantation' });

  it('an own companion dies → mill 1; the OPPONENT\'s companion dying → silent', () => {
    const [A, B] = filler;
    seed({ b3: mkPc('pc-1'), f1: altar(), f2: mkComp('mine', filler[0].name, { hp: 2 }) },
      { deck: [A, B] }, { b2: mkPc('pc-2'), f1: mkComp('theirs', filler[1].name, { hp: 2 }) });
    gs.setState(s => ({ game: destroyEntity(s.game, 'mine', [], [], 'damage').game }));
    expect(g().p1.deck.map(c => c.id), 'milled 1 on the own death').toEqual([B.id]);
    gs.setState(s => ({ game: destroyEntity(s.game, 'theirs', [], [], 'damage').game }));
    expect(g().p1.deck.map(c => c.id), 'the enemy death is not "a companion you control"').toEqual([B.id]);
  });

  it('an own companion FLEES → mill 1 (a flee is a death); the Altar\'s own decay → silent', () => {
    const [A, B] = filler;
    seed({ b3: mkPc('pc-1'), f1: altar(),
      f2: mkComp('big', filler[0].name, { level: 4, hp: 3 }) }, { deck: [A, B] });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, willpower: 1 } } }));
    const r = applyReadyRemovals(g(), 'p1', 'Your');
    expect(r.game.p1.deck.map(c => c.id), 'the flee milled 1').toEqual([B.id]);
    // The Altar decaying (a CONSTRUCT death) fires nothing.
    seed({ b3: mkPc('pc-1'), f1: mkConstruct('altar', 'Ossuary Altar', 1, { subtype: 'Incantation' }) }, { deck: [A] });
    const r2 = applyReadyRemovals(g(), 'p1', 'Your');
    expect(r2.game.p1.deck.length, 'constructs are not companions').toBe(1);
  });
});

describe('Turn of Phrase — hand to the deck BOTTOM', () => {
  it('draw, then the chosen card lands on the bottom (never the Dead Zone)', () => {
    const [A, B, C] = filler;
    seed({ b3: mkPc('pc-1') }, { deck: [A, B, C], cls: 'Bard' });
    play(rc('Turn of Phrase'));
    expect(g().p1.hand.map(c => c.id), 'drew A').toEqual([A.id]);
    expect(g().pendingDiscard?.dest).toBe('bottom');
    gs.getState().resolveDiscard(A.id);
    expect(g().p1.deck.map(c => c.id), 'A is on the BOTTOM').toEqual([B.id, C.id, A.id]);
    expect(g().p1.dead.some(c => c.id === A.id), 'never the Dead Zone').toBe(false);
  });
});

describe('Chorus Bell — the Vocal play window (item-hosted)', () => {
  const bearer = () => mkComp('bard', filler[0].name,
    { loadout: { weapon: null, gear: [mkItem('bell', 'Chorus Bell')] } });

  it('playing a Chant draws; playing an Incantation does not', () => {
    const [A, B] = filler;
    seed({ b3: mkPc('pc-1'), f1: bearer() }, { deck: [A, B], cls: 'Bard' });
    place(rc('Chant of Returning'), 'f2');
    expect(g().p1.hand.some(c => c.id === A.id), 'the Bell drew on the Vocal play').toBe(true);
    // An Incantation play stays silent.
    const spark = CATALOG.find(c => c.name === 'Lingering Spark')!;
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      classZone: czCards.map((c, i) => mkCz(c, 'Sorcerer', `cz-${i}`)) } } }));
    const handBefore = g().p1.hand.length;
    place(spark, 'f3');
    expect(g().p1.hand.length, 'no draw for a Magic construct').toBe(handBefore);
  });
});

describe('Gravecharm Locket — the equipped-dies window', () => {
  it('the bearer dies → draw 2; the Locket still reaches the Dead Zone; at a 1-card deck the draw LOSES (the chokepoint)', () => {
    const [A, B, C] = filler;
    seed({ b3: mkPc('pc-1', { exhausted: true, tapped: 'major' }),
      f1: mkComp('bear', filler[0].name, { hp: 2, loadout: { weapon: null, gear: [mkItem('lock', 'Gravecharm Locket')] } }) },
      { deck: [A, B, C] });
    gs.setState(s => {
      const sink: Parameters<typeof armPrompts>[1] = [];
      const d = destroyEntity(s.game, 'bear', sink, [], 'damage');
      return { game: armNextItemTransfer(armPrompts(d.game, sink, [])) };
    });
    expect(g().p1.hand.length, 'drew 2 on the bearer death').toBe(2);
    expect(g().p1.dead.some(c => c.name === 'Gravecharm Locket'), 'the Locket is buried').toBe(true);
    // The deck-out collision: 1 card left → draws 1, then the second attempt loses.
    seed({ b3: mkPc('pc-1', { exhausted: true, tapped: 'major' }),
      f1: mkComp('bear2', filler[1].name, { hp: 2, loadout: { weapon: null, gear: [mkItem('lock2', 'Gravecharm Locket')] } }) },
      { deck: [A] });
    gs.setState(s => ({ game: destroyEntity(s.game, 'bear2', [], [], 'damage').game }));
    expect(g().gameOver, 'the mandatory second draw at 0 cards loses').toBe('p2');
  });
});

describe('Steal the Show — the non-Companion pick filter', () => {
  it('a Companion pick is refused; a non-Companion pick bottoms and they draw', () => {
    const comp = filler[0];
    const item = CATALOG.find(c => c.type === 'Item' && !c.dev)!;
    seed({ b3: mkPc('pc-1') }, { cls: 'Bard' },
      { b2: mkPc('pc-2') });
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, hand: [comp, item], deck: s.game.p2.deck.slice(0, 3) } } }));
    play(rc('Steal the Show'));
    expect(g().pendingHandReveal?.pickFilter).toBe('nonCompanion');
    gs.getState().resolveHandReveal(comp.id);
    expect(g().pendingHandReveal, 'the Companion pick was refused — the prompt stands').toBeTruthy();
    gs.getState().resolveHandReveal(item.id);
    expect(g().p2.deck.at(-1)?.id, 'the item went to the bottom').toBe(item.id);
    expect(g().p2.hand.length, 'they drew back to 2').toBe(2);
  });
});

describe('Discordant Air — the charm pair', () => {
  it('enter → pick enemy A → pick enemy B (A excluded) → A ATTACKS B through the real machinery', () => {
    seed({ b3: mkPc('pc-1') }, { cls: 'Bard' },
      { b2: mkPc('pc-2'),
        f1: mkComp('a', filler[0].name, { atk: 3, hp: 5 }),
        f3: mkComp('b', filler[1].name, { atk: 2, hp: 5 }) });
    place(rc('Discordant Air'), 'f1');
    const pa = gs.getState().pendingActionTarget;
    expect(pa?.twoStep).toBe('forcePair');
    expect(pa?.eligibleIds?.sort()).toEqual(['a', 'b']);
    gs.getState().resolveActionTarget('a');
    const pa2 = gs.getState().pendingActionTarget;
    expect(pa2?.eligibleIds, 'the attacker is excluded from the target pick').toEqual(['b']);
    gs.getState().resolveActionTarget('b');
    expect(g().p2.board.f3?.hp, 'A (3 atk) hit B').toBe(2);
    expect(g().p2.board.f1?.exhausted, 'the forced attacker is spent').toBe(true);
  });
});

describe('the destroy caps', () => {
  it('Lay to Rest: level 2 eligible, level 3 not (boundary)', () => {
    seed({ b3: mkPc('pc-1') }, {},
      { b2: mkPc('pc-2'), f1: mkComp('l2', byLevel(2).name, { level: 2 }), f3: mkComp('l3', byLevel(3).name, { level: 3 }) });
    play(rc('Lay to Rest'));
    const pa = gs.getState().pendingActionTarget;
    expect(pa?.eligibleIds).toContain('l2');
    expect(pa?.eligibleIds, 'level 3 > cap 2').not.toContain('l3');
  });

  it('Toll the Silence: 3 dead companions → level 2 eligible, level 3 NOT (strictly below); empty Dead Zone → uncastable', () => {
    seed({ b3: mkPc('pc-1') }, { dead: [filler[0], filler[1], filler[2]] },
      { b2: mkPc('pc-2'), f1: mkComp('l2', byLevel(2).name, { level: 2 }), f3: mkComp('l3', byLevel(3).name, { level: 3 }) });
    play(rc('Toll the Silence'));
    const pa = gs.getState().pendingActionTarget;
    expect(pa?.eligibleIds).toContain('l2');
    expect(pa?.eligibleIds, '3 is NOT strictly below a census of 3').not.toContain('l3');
    gs.getState().cancelActionTarget();
    // Empty Dead Zone: nothing is strictly below 0 — the action fizzles unarmed.
    seed({ b3: mkPc('pc-1') }, {},
      { b2: mkPc('pc-2'), f1: mkComp('l2', byLevel(2).name, { level: 2 }) });
    play(rc('Toll the Silence'));
    expect(gs.getState().pendingActionTarget ?? null, 'no eligible target at census 0').toBeFalsy();
  });
});

describe('Field of the Unquiet — opposing companions enter exhausted', () => {
  it('the opponent\'s Field spends MY played companion — and Zealous still cannot attack (the pinned collision); my own entries under MY Field are unaffected', () => {
    // The FIELD belongs to P2; P1 (us) plays a companion into it.
    seed({ b3: mkPc('pc-1') }, { cls: filler[0].class1 },
      { b2: mkPc('pc-2'), f1: mkConstruct('field', 'Field of the Unquiet', 3, { subtype: 'Incantation' }) });
    const zealous = CATALOG.find(c => c.type === 'Companion' && !c.dev && c.keywords.includes('Zealous'))!;
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      classZone: czCards.map((c, i) => mkCz(c, zealous.class1, `cz-${i}`)) } } }));
    place(zealous, 'b1');
    const ent = g().p1.board.b1!;
    expect(ent.exhausted, 'entered exhausted under the opposing Field').toBe(true);
    gs.getState().beginAttack(ent.id);
    expect(gs.getState().pending ?? null, 'Zealous waives the willpower check but exhausted cannot attack').toBeFalsy();
    // The Field never touches its OWN controller's entries.
    seed({ b3: mkPc('pc-1'), f1: mkConstruct('field', 'Field of the Unquiet', 3, { subtype: 'Incantation' }) },
      { cls: filler[0].class1 });
    place(filler[0], 'b1');
    expect(g().p1.board.b1?.exhausted, 'own entries unaffected').toBe(false);
  });
});
