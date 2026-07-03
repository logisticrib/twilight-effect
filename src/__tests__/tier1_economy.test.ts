// Tier 1 (test_seed_plan.md) — willpower & action-economy regressions, items 1/2/7/8/9.
// Each broke in a real playtest; tested exactly as it failed.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkItem, mkCz } from './helpers';
import { canPlayActionCard, playWillpower } from '../store/keywords';
import { isSealed, abilityUsedTag, gatherActivated } from '../store/gameStore';
import type { Card } from '../types/card';
import { CATALOG } from '../data/catalog';

const mkCard = (over: Record<string, unknown>): Card => ({
  id: 'synth', name: 'Synthetic', level: 1, type: 'Action', subtype: '', rarity: '',
  class1: '', class2: '', attack: 0, hp: 0, anchor: null, actionSub: '', actionPM: '',
  itemKind: '', keywords: [], text: '', flavor: '', cls: '',
  ...over,
} as unknown as Card);

const cheapComps = CATALOG.filter(c => c.type === 'Companion' && c.level <= 2);
const [compA, compB, compC] = cheapComps;

describe('item 1: Willpower survives Special Actions (was 3→2→1)', () => {
  it('placing two companions (two Special Actions) leaves Willpower at 3', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
      willpower: 3,
      hand: [compA, compB],
      board: {},
    } } }));
    gs.getState().beginPlay(compA.id);
    gs.getState().placeCard('b1');
    let g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'first companion placed').toBe(compA.name);
    expect(g.p1.willpower, 'WP after 1 Special Action').toBe(3);
    expect(g.p1.classZone.filter(c => c.faceDown).length, 'one CZ card flipped as marker').toBe(1);

    gs.getState().beginPlay(compB.id);
    gs.getState().placeCard('b2');
    g = gs.getState().game;
    expect(g.p1.board.b2?.name, 'second companion placed').toBe(compB.name);
    expect(g.p1.willpower, 'WP after 2 Special Actions').toBe(3);
    expect(playWillpower(g.p1), 'playWillpower = total CZ − Dismayed').toBe(3);
  });

  it('Dismayed subtracts 1 from playWillpower but not from the stat', () => {
    const g = gs.getState().game;
    expect(playWillpower({ ...g.p1, dismayed: true })).toBe(2);
    expect(g.p1.willpower).toBe(3);
  });

  it('Special-Action availability still requires a face-up CZ card to flip', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      classZone: CATALOG.slice(20, 23).map((c, i) => ({ ...mkCz(c, 'Warrior', `cz-${i}`), faceDown: true })),
      willpower: 3,
      hand: [compC],
      board: {},
    } } }));
    gs.getState().beginPlay(compC.id);
    gs.getState().placeCard('b1');
    expect(gs.getState().game.p1.board.b1, 'no face-up card → placement refused').toBeUndefined();
    expect(gs.getState().game.p1.hand.some(c => c.id === compC.id), 'card stays in hand').toBe(true);
  });
});

describe('item 2: Willpower ≥ Level is a hard play gate', () => {
  it('canPlayActionCard blocks an over-level Action', () => {
    freshGame();
    const g = gs.getState().game;
    const ent = mkComp('e1', 'Actor');
    const okCard = mkCard({ level: g.p1.willpower, actionPM: 'Minor' });
    const overCard = mkCard({ level: g.p1.willpower + 1, actionPM: 'Minor' });
    expect(canPlayActionCard(g, 'p1', ent, okCard).ok).toBe(true);
    const res = canPlayActionCard(g, 'p1', ent, overCard);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Willpower/);
  });

  it('placeCard blocks an over-level companion', () => {
    freshGame();
    const overComp = mkCard({ id: 'over-c', type: 'Companion', level: 9, hp: 3, attack: 1 });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
      willpower: 3, hand: [overComp], board: {},
    } } }));
    gs.getState().beginPlay(overComp.id);
    gs.getState().placeCard('b1');
    expect(gs.getState().game.p1.board.b1, 'over-level companion refused').toBeUndefined();
  });

  it('equipItem blocks an over-level item (stays in hand)', () => {
    freshGame();
    const overItem = mkCard({ id: 'over-i', type: 'Item', level: 9, itemKind: 'Trinket' });
    const wearer = mkComp('w1', compA.name);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      willpower: 3, hand: [overItem], board: { f1: wearer },
    } } }));
    gs.getState().equipItem('w1', overItem.id);
    const g = gs.getState().game;
    expect(g.p1.hand.some(c => c.id === overItem.id), 'item stays in hand').toBe(true);
    expect(g.p1.board.f1?.loadout?.gear.filter(Boolean).length, 'nothing equipped').toBe(0);
  });
});

describe('item 7: the right action is charged', () => {
  const patientStudy = CATALOG.find(c => c.name === 'Patient Study')!;

  it('Patient Study spends the MINOR, not the Major (was overcharged)', () => {
    freshGame();
    const caster = mkComp('cast-1', compA.name);
    gs.setState(s => ({ game: { ...s.game, selected: 'cast-1', p1: { ...s.game.p1,
      classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, patientStudy.class1, `cz-${i}`)),
      willpower: 5, hand: [patientStudy], board: { f1: caster },
    } } }));
    gs.getState().playAction(patientStudy.id);
    const g = gs.getState().game;
    const ent = g.p1.board.f1!;
    expect(ent.acts.minor, 'Minor spent').toBe(true);
    expect(ent.acts.major, 'Major NOT spent').toBe(false);
    expect(ent.exhausted, 'not exhausted by a Minor').toBe(false);
    expect(g.pendingPeek, 'Patient Study scry armed (the card actually played)').not.toBeNull();
  });

  it('a Major Action exhausts and spends the Major', () => {
    freshGame();
    const majorAction = CATALOG.find(c => c.type === 'Action' && c.actionPM === 'Major')!;
    const caster = mkComp('cast-2', compA.name);
    gs.setState(s => ({ game: { ...s.game, selected: 'cast-2', p1: { ...s.game.p1,
      classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, majorAction.class1, `cz-${i}`)),
      willpower: 5, hand: [majorAction], board: { f1: caster },
    } } }));
    gs.getState().playAction(majorAction.id);
    const ent = gs.getState().game.p1.board.f1;
    // Cost is paid up-front on every branch (immediate, targeted, or fizzled).
    expect(ent && (ent.acts.major || !gs.getState().game.p1.board.f1), 'Major spent').toBeTruthy();
    expect(ent?.acts.major, 'Major spent').toBe(true);
    expect(ent?.exhausted, 'Major exhausts').toBe(true);
  });

  it('class-in-CZ and Two-Handed-blocks-Magic are enforced', () => {
    const g = gs.getState().game;
    const ent = mkComp('e2', 'Actor');
    const needsSorcerer = mkCard({ class1: 'Sorcerer', level: 1 });
    expect(canPlayActionCard({ ...g, p1: { ...g.p1, classZone: [], willpower: 5 } } as typeof g, 'p1', ent, needsSorcerer).reason)
      .toMatch(/Sorcerer/);
    const magicCard = mkCard({ subtype: 'Magic', level: 1, actionPM: 'Minor' });
    const twoHanded = mkComp('e3', 'Actor', { loadout: { weapon: mkItem('2h', 'Big Axe', { hands: 2 }), gear: [] } });
    expect(canPlayActionCard(g, 'p1', twoHanded, magicCard).reason).toMatch(/2H/);
  });

  it('an activated ability consumes the character Major', () => {
    freshGame();
    const holder = mkComp('h1', compA.name, {
      loadout: { weapon: null, gear: [mkItem('as', 'Anchor Stone'), null] },
    });
    const wall = mkConstruct('wall-1', 'Test Wall', 3, { subtype: 'Fortification' });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: holder, f2: wall } } } }));
    expect(gatherActivated(holder).length, 'Anchor Stone exposes an activated ability').toBeGreaterThan(0);
    gs.getState().activateAbility('h1', 0);
    const ent = gs.getState().game.p1.board.f1!;
    expect(ent.acts.major, 'Major consumed').toBe(true);
    expect(ent.exhausted, 'exhausted by the activation').toBe(true);
  });

  it('constructs are exempt from character action economy', () => {
    freshGame();
    const circle = mkConstruct('tc-1', 'Translocation Circle', 3, { subtype: 'Incantation' });
    const own = mkComp('own-1', compA.name);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: circle, b1: own } } } }));
    expect(gatherActivated(circle).length, 'Translocation Circle has its authored ability').toBeGreaterThan(0);
    gs.getState().activateAbility('tc-1', 0);
    const g = gs.getState().game;
    const ent = g.p1.board.f1!;
    expect(ent.exhausted, 'construct not exhausted').toBe(false);
    expect(ent.statuses.some(st => st === abilityUsedTag('Translocation Circle')), 'oncePerTurn marker set').toBe(true);
    expect(g.finishedActors, 'construct never seals anyone').toHaveLength(0);
  });
});

describe('item 8: atomic activation lock', () => {
  it('acting with B seals A; a sealed character cannot act again', () => {
    freshGame();
    const a = mkComp('act-a', compA.name);
    const b = mkComp('act-b', compB.name);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: a, f2: b } } } }));
    gs.getState().markAction('act-a', 'minor');
    expect(gs.getState().game.currentActor).toBe('act-a');
    expect(isSealed(gs.getState().game, 'act-a'), 'still open while current').toBe(false);
    gs.getState().markAction('act-b', 'minor');
    expect(isSealed(gs.getState().game, 'act-a'), 'A sealed once B acts').toBe(true);
    gs.getState().markAction('act-a', 'move');
    expect(gs.getState().game.p1.board.f1?.acts.move, 'sealed A cannot take further actions').toBe(false);
  });

  it('selecting/inspecting alone does not seal', () => {
    freshGame();
    const a = mkComp('sel-a', compA.name);
    const b = mkComp('sel-b', compB.name);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: a, f2: b } } } }));
    gs.getState().selectEntity('sel-a');
    gs.getState().selectEntity('sel-b');
    expect(gs.getState().game.finishedActors).toHaveLength(0);
  });

  it('a construct acting does not seal the current character', () => {
    freshGame();
    const a = mkComp('cx-a', compA.name);
    const con = mkConstruct('cx-con', 'Test Wall', 3);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: a, f2: con } } } }));
    gs.getState().markAction('cx-a', 'minor');
    gs.getState().markAction('cx-con', 'minor');
    expect(isSealed(gs.getState().game, 'cx-a'), 'construct action leaves A open').toBe(false);
    expect(gs.getState().game.currentActor).toBe('cx-a');
  });

  it('resetActions lifts the lock', () => {
    freshGame();
    const a = mkComp('rl-a', compA.name);
    const b = mkComp('rl-b', compB.name);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: a, f2: b } } } }));
    gs.getState().markAction('rl-a', 'minor');
    gs.getState().markAction('rl-b', 'minor');
    expect(isSealed(gs.getState().game, 'rl-a')).toBe(true);
    gs.getState().resetActions('rl-a');
    expect(isSealed(gs.getState().game, 'rl-a'), 'lock lifted').toBe(false);
    gs.getState().markAction('rl-a', 'minor');
    expect(gs.getState().game.p1.board.f1?.acts.minor, 'A can act again').toBe(true);
  });
});

describe('item 9: first-player handicap is skip-Turn-1-draw ONLY', () => {
  it('placing the first player PC does not draw a card', () => {
    gs.getState().startSolo(CATALOG.slice(0, 50), CATALOG.slice(0, 50));
    gs.setState(s => ({ game: { ...s.game, setupQueue: ['place-pc:p1', 'place-pc:p2'] } }));
    const handBefore = gs.getState().game.p1.hand.length;
    gs.getState().placePc('b1', 'p1');
    const g = gs.getState().game;
    expect(g.p1.board.b1?.kind, 'PC placed').toBe('pc');
    expect(g.p1.hand.length, 'NO Turn-1 draw for the first player').toBe(handBefore);
    gs.getState().placePc('b1', 'p2');
    expect(gs.getState().game.setupQueue, 'setup complete').toHaveLength(0);
  });

  it('there is NO Turn-1 Major restriction (flipped ruling 2026-06-23)', () => {
    freshGame();
    const settled = mkComp('t1-a', compA.name, { fresh: false });
    gs.setState(s => ({ game: { ...s.game, turn: 1, p1: { ...s.game.p1,
      willpower: 5, classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
      board: { f1: settled },
    } }, pending: null }));
    const majorCard = mkCard({ level: 1, actionPM: 'Major', class1: 'Warrior' });
    expect(canPlayActionCard(gs.getState().game, 'p1', settled, majorCard).ok, 'Turn-1 Major Action allowed').toBe(true);
    gs.getState().beginAttack('t1-a');
    expect(gs.getState().pending?.action, 'Turn-1 attack allowed').toBe('attack');
  });
});
