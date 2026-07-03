// Tier 4 item 1 (test_seed_plan.md) — happy path + one edge per Effect op, driven
// through the REAL playAction / resolveActionTarget / resolveActionSlot paths with
// synthetic Action cards (class-free, Minor-cost, so only the op is under test).
// Covered elsewhere and not repeated: damageSelfPC + die/halfDie Amounts (tier2 Wrath),
// moveAnchor (tier1 zones), attackBonus + payHP cost (tier1 Mara), suppressKeywords
// (tier1 combat), anchor group self-exclusion (rulings). The exhaustSelf COST is only
// authored on Library of Memory's start-of-turn clause (SoT path) — validator-covered.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { effectiveAttack } from '../store/keywords';
import type { Effect } from '../types/effects';
import type { BoardEntity, Card } from '../types/card';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];
const itemCard = CATALOG.find(c => c.type === 'Item')!;

let n = 0;
const mkAction = (effects: Effect[], over: Record<string, unknown> = {}): Card => ({
  id: `synth-${++n}`, name: `Synth Op ${n}`, level: 1, type: 'Action', subtype: '', rarity: '',
  class1: '', class2: '', attack: 0, hp: 0, anchor: null, actionSub: '', actionPM: 'Minor',
  itemKind: '', keywords: [], text: '', flavor: '',
  effects: [{ trigger: 'onPlay', effects }], cls: '',
  ...over,
} as unknown as Card);

/** Fresh game, caster (atk 3) selected at p1 f1, `card` in hand, boards merged in; plays it. */
function cast(card: Card, boards: { own?: Record<string, BoardEntity>; enemy?: Record<string, BoardEntity> } = {}) {
  freshGame();
  const caster = mkComp('caster', compCard.name, { atk: 3, hp: 5, maxHp: 5 });
  gs.setState(s => ({ game: { ...s.game, selected: 'caster',
    p1: { ...s.game.p1, willpower: 9, hand: [card], board: { f1: caster, ...(boards.own ?? {}) } },
    p2: { ...s.game.p2, board: { ...(boards.enemy ?? {}) } },
  } }));
  gs.getState().playAction(card.id);
}
const game = () => gs.getState().game;
const pat = () => gs.getState().pendingActionTarget;

afterEach(() => vi.restoreAllMocks());

describe('damage', () => {
  it('interactive single target takes the amount', () => {
    cast(mkAction([{ op: 'damage', amount: 3, target: 'enemyCharacter' }]),
      { enemy: { f1: mkComp('foe', compCard2.name, { hp: 9, maxHp: 9 }) } });
    expect(pat(), 'target step armed').not.toBeNull();
    gs.getState().resolveActionTarget('foe');
    expect(game().p2.board.f1?.hp).toBe(6);
  });

  it("edge: 'enemyCompanion' excludes the PC; 'enemyCharacter' includes it", () => {
    const enemy = { f1: mkComp('foe', compCard2.name), b1: mkPc('foe-pc') };
    cast(mkAction([{ op: 'damage', amount: 1, target: 'enemyCompanion' }]), { enemy });
    expect(pat()?.eligibleIds, 'companion spec: PC excluded').not.toContain('foe-pc');
    expect(pat()?.eligibleIds).toContain('foe');
    gs.getState().cancelActionTarget();
    cast(mkAction([{ op: 'damage', amount: 1, target: 'enemyCharacter' }]), { enemy });
    expect(pat()?.eligibleIds, 'character spec: PC included').toContain('foe-pc');
    gs.getState().cancelActionTarget();
  });

  it("edge: splash 'board' hits every enemy", () => {
    cast(mkAction([{ op: 'damage', amount: 2, target: 'allEnemies', splash: 'board' }]),
      { enemy: { f1: mkComp('foe1', compCard2.name, { hp: 9, maxHp: 9 }), b1: mkPc('foe-pc', { hp: 20 }) } });
    expect(game().p2.board.f1?.hp, 'companion hit').toBe(7);
    expect(game().p2.board.b1?.hp, 'PC hit too').toBe(18);
  });
});

describe('heal', () => {
  it('restores HP; edge: never above effectiveMaxHp', () => {
    cast(mkAction([{ op: 'heal', amount: 2, target: 'ownCompanion' }]),
      { own: { f2: mkComp('hurt', compCard2.name, { hp: 1, maxHp: 5 }) } });
    gs.getState().resolveActionTarget('hurt');
    expect(game().p1.board.f2?.hp, 'healed by 2').toBe(3);
    const overheal = mkAction([{ op: 'heal', amount: 99, target: 'ownCompanion' }]);
    gs.getState().resetActions('caster'); // the first cast spent the caster's Minor
    gs.setState(s => ({ game: { ...s.game, selected: 'caster', p1: { ...s.game.p1, hand: [overheal] } } }));
    gs.getState().playAction(overheal.id);
    gs.getState().resolveActionTarget('hurt');
    expect(game().p1.board.f2?.hp, 'capped at printed max').toBe(5);
  });
});

describe('buff', () => {
  it('endOfTurn atk buff applies to the scope and is stripped when the turn ends', () => {
    cast(mkAction([{ op: 'buff', stat: 'atk', amount: 2, scope: 'ownCompanions', duration: 'endOfTurn' }]),
      { own: { f2: mkComp('ally', compCard2.name, { atk: 3 }) } });
    let g = game();
    expect(effectiveAttack(g.p1.board.f2!, g), 'buffed 3→5').toBe(5);
    gs.getState().endTurn();
    g = game();
    expect(effectiveAttack(g.p1.board.f2!, g), 'stripped at end of turn').toBe(3);
  });
});

describe('draw + Condition kinds', () => {
  const handAfter = () => game().p1.hand.length; // the played card left the hand → base 0

  it('draws N; edge: each implemented Condition kind gates it', () => {
    cast(mkAction([{ op: 'draw', count: 2 }]));
    expect(handAfter(), 'unconditional draw 2').toBe(2);

    cast(mkAction([{ op: 'draw', count: 1, if: { kind: 'controlsType', cardType: 'Construct' } }]));
    expect(handAfter(), 'controlsType unmet → no draw').toBe(0);
    cast(mkAction([{ op: 'draw', count: 1, if: { kind: 'controlsType', cardType: 'Construct' } }]),
      { own: { f2: mkConstruct('w', 'Test Wall', 2) } });
    expect(handAfter(), 'controlsType met → draws').toBe(1);

    cast(mkAction([{ op: 'draw', count: 1, if: { kind: 'controlsCount', of: 'companions', min: 2 } }]));
    expect(handAfter(), 'controlsCount 2 unmet (caster only) → no draw').toBe(0);
    cast(mkAction([{ op: 'draw', count: 1, if: { kind: 'controlsCount', of: 'companions', min: 2 } }]),
      { own: { f2: mkComp('ally', compCard2.name) } });
    expect(handAfter(), 'controlsCount met → draws').toBe(1);

    cast(mkAction([{ op: 'draw', count: 1, if: { kind: 'willpowerAtLeast', value: 99 } }]));
    expect(handAfter(), 'willpowerAtLeast unmet → no draw').toBe(0);
  });
});

describe('shuffleHandRedraw', () => {
  it('opponent shuffles their hand into the deck and redraws handSize + offset', () => {
    freshGame();
    const p2HandBefore = game().p2.hand.length;
    const card = mkAction([{ op: 'shuffleHandRedraw', offset: -1 }]);
    gs.setState(s => ({ game: { ...s.game, selected: undefined as never } }));
    cast(card);
    expect(game().p2.hand.length, 'redrew one fewer').toBe(p2HandBefore - 1);
  });
});

describe('bounce', () => {
  it('edge: the bounced companion returns to hand, its items go to the DEAD zone', () => {
    cast(mkAction([{ op: 'bounce', target: 'enemyCompanion' }]),
      { enemy: { f1: mkComp('foe', compCard2.name, { loadout: { weapon: mkItem('it', itemCard.name), gear: [null, null] } }) } });
    gs.getState().resolveActionTarget('foe');
    const g = game();
    expect(g.p2.board.f1, 'left the board').toBeFalsy();
    expect(g.p2.hand.map(c => c.name), 'card to owner hand').toContain(compCard2.name);
    expect(g.p2.dead.map(c => c.name), 'item to owner dead').toContain(itemCard.name);
  });
});

describe('extraAttack', () => {
  it('a spent character may attack again', () => {
    cast(mkAction([{ op: 'extraAttack', target: 'ownCompanion' }]),
      { own: { f2: mkComp('spent', compCard2.name, { exhausted: true, tapped: 'major', acts: { move: false, minor: false, major: true } }) } });
    gs.getState().resolveActionTarget('spent');
    const ent = game().p1.board.f2!;
    expect(ent.acts.major, 'Major refreshed').toBe(false);
    expect(ent.exhausted, 'readied').toBe(false);
  });
});

describe('forceAttack', () => {
  it('every own front-line companion attacks the target once', () => {
    cast(mkAction([{ op: 'forceAttack', attackers: 'frontLineOwn', target: 'enemyCharacter' }]),
      { own: { f2: mkComp('ally', compCard2.name, { atk: 2 }) },
        enemy: { f1: mkComp('foe', compCard2.name, { hp: 9, maxHp: 9 }) } });
    gs.getState().resolveActionTarget('foe');
    const g = game();
    expect(g.p2.board.f1?.hp, 'took 3 (caster) + 2 (ally)').toBe(4);
    expect(g.p1.board.f1?.exhausted, 'forced attackers exhaust').toBe(true);
    expect(g.p1.board.f2?.exhausted).toBe(true);
  });
});

describe('anchor (single-target op)', () => {
  it('adds anchors; edge: draining to 0 sacrifices into the Dead Zone', () => {
    const constrCard = CATALOG.find(c => c.type === 'Construct')!;
    cast(mkAction([{ op: 'anchor', delta: 2, target: 'physicalConstruct' }]),
      { own: { f2: mkConstruct('wall', constrCard.name, 2, { subtype: 'Fortification' }) } });
    gs.getState().resolveActionTarget('wall');
    expect(game().p1.board.f2?.anchors, '+2').toBe(4);
    const drain = mkAction([{ op: 'anchor', delta: -4, target: 'physicalConstruct' }]);
    gs.getState().resetActions('caster');
    gs.setState(s => ({ game: { ...s.game, selected: 'caster', p1: { ...s.game.p1, hand: [drain] } } }));
    gs.getState().playAction(drain.id);
    gs.getState().resolveActionTarget('wall');
    expect(game().p1.board.f2, 'sacrificed at 0').toBeFalsy();
    expect(game().p1.dead.map(c => c.name), 'buried').toContain(constrCard.name);
  });
});

describe('animate', () => {
  it('turns a Magic Construct into an X/X Manifest companion; edge: bouncing a Manifest sacrifices it', () => {
    cast(mkAction([{ op: 'animate', atk: 2, hp: 2, target: 'magicalConstruct' }]),
      { own: { f2: mkConstruct('sig', 'Binding Sigil', 2, { subtype: 'Incantation' }) } });
    gs.getState().resolveActionTarget('sig');
    const ent = game().p1.board.f2!;
    expect(ent.kind, 'now a companion').toBe('companion');
    expect([ent.atk, ent.hp], 'X/X stats').toEqual([2, 2]);
    expect(ent.anchors, 'anchors retained').toBe(2);
    expect(ent.statuses, 'Manifest-marked').toContain('manifest');

    const bounce = mkAction([{ op: 'bounce', target: 'ownCompanion' }]);
    gs.getState().resetActions('caster');
    gs.setState(s => ({ game: { ...s.game, selected: 'caster', p1: { ...s.game.p1, hand: [bounce] } } }));
    gs.getState().playAction(bounce.id);
    gs.getState().resolveActionTarget('sig');
    const g = game();
    expect(g.p1.board.f2, 'Manifest left play').toBeFalsy();
    expect(g.p1.hand.map(c => c.name), 'NOT returned to hand').not.toContain('Binding Sigil');
    expect(g.p1.dead.map(c => c.name), 'sacrificed instead').toContain('Binding Sigil');
  });
});

describe('dieCheck (both branches, mocked d6)', () => {
  const card = () => mkAction([{ op: 'dieCheck', threshold: 4,
    onPass: [{ op: 'damage', amount: 2, target: 'enemyCharacter' }],
    onFail: [{ op: 'damage', amount: 2, target: 'self' }] }]);

  it('passes at or above the threshold — the branch target chosen up-front', () => {
    cast(card(), { enemy: { f1: mkComp('foe', compCard2.name, { hp: 9, maxHp: 9 }) } });
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d6 = 6
    gs.getState().resolveActionTarget('foe');
    expect(game().p2.board.f1?.hp, 'onPass fired').toBe(7);
    expect(game().p1.board.f1?.hp, 'caster untouched').toBe(5);
  });

  it('fails below the threshold', () => {
    cast(card(), { enemy: { f1: mkComp('foe', compCard2.name, { hp: 9, maxHp: 9 }) } });
    vi.spyOn(Math, 'random').mockReturnValue(0); // d6 = 1
    gs.getState().resolveActionTarget('foe');
    expect(game().p2.board.f1?.hp, 'target untouched').toBe(9);
    expect(game().p1.board.f1?.hp, 'onFail hit the caster').toBe(3);
  });
});

describe('Amount kinds not covered elsewhere', () => {
  it('halfDieUp rounds the die up', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // d6 = 5 → ceil(2.5) = 3
    cast(mkAction([{ op: 'damage', amount: { halfDieUp: 6 }, target: 'allEnemies', splash: 'board' }]),
      { enemy: { f1: mkComp('foe', compCard2.name, { hp: 9, maxHp: 9 }) } });
    expect(game().p2.board.f1?.hp).toBe(6);
  });

  it('perControlled counts your companions', () => {
    cast(mkAction([{ op: 'damage', amount: { perControlled: 'companions' }, target: 'allEnemies', splash: 'board' }]),
      { own: { f2: mkComp('ally', compCard2.name) },
        enemy: { f1: mkComp('foe', compCard2.name, { hp: 9, maxHp: 9 }) } });
    expect(game().p2.board.f1?.hp, 'caster + ally = 2 damage').toBe(7);
  });
});

describe('returnFromDead', () => {
  it('defers to the Dead-Zone picker; edge: empty dead → no prompt', () => {
    freshGame();
    const card = mkAction([{ op: 'returnFromDead', to: 'hand' }]);
    const caster = mkComp('caster', compCard.name);
    gs.setState(s => ({ game: { ...s.game, selected: 'caster',
      p1: { ...s.game.p1, willpower: 9, hand: [card], dead: [CATALOG[5]], board: { f1: caster } } } }));
    gs.getState().playAction(card.id);
    expect(game().pendingDeadPick, 'picker armed').not.toBeNull();
    expect(game().pendingDeadPick?.options.map(o => o.card.id)).toContain(CATALOG[5].id);
    gs.getState().cancelDeadPick();

    cast(mkAction([{ op: 'returnFromDead', to: 'hand' }])); // fresh game, empty dead
    expect(game().pendingDeadPick, 'empty dead → nothing to pick').toBeNull();
  });
});

describe('exhaustSelf (op)', () => {
  it('exhausts the acting character', () => {
    cast(mkAction([{ op: 'exhaustSelf' }]));
    expect(game().p1.board.f1?.exhausted).toBe(true);
  });
});

describe('deckPeek + resolvePeek', () => {
  it('routes the looked-at cards to hand / bottom', () => {
    cast(mkAction([{ op: 'deckPeek', look: 2, dests: ['hand', 'top', 'bottom'] }]));
    const peek = game().pendingPeek!;
    expect(peek, 'scry armed').toBeTruthy();
    const [first, second] = peek.cards;
    gs.getState().resolvePeek(['hand', 'bottom']);
    const g = game();
    expect(g.pendingPeek).toBeNull();
    expect(g.p1.hand.map(c => c.id), 'first card to hand').toContain(first.id);
    expect(g.p1.deck[g.p1.deck.length - 1]?.id, 'second card to the bottom').toBe(second.id);
  });
});

describe('move (reposition two-step) — Tactical Reposition shape', () => {
  it('step 1 picks the character, step 2 the slot; the rest of the card resolves after', () => {
    cast(mkAction([{ op: 'move', target: 'ownCharacter', to: 'anySlot' }, { op: 'draw', count: 1 }]));
    expect(pat()?.twoStep).toBe('reposition');
    gs.getState().resolveActionTarget('caster');
    expect(pat()?.eligibleSlots?.length, 'empty slots offered').toBeGreaterThan(0);
    gs.getState().resolveActionSlot('b2');
    const g = game();
    expect(g.p1.board.b2?.id, 'moved').toBe('caster');
    expect(g.p1.board.f1, 'old slot empty').toBeFalsy();
    expect(g.p1.hand.length, 'rider draw resolved after the move').toBe(1);
  });
});

describe('attackDisarm (two-step) — Disarming Blow shape', () => {
  it('the chosen character hits the target, then an item on it is sacrificed', () => {
    cast(mkAction([{ op: 'attackDisarm', attacker: 'ownCharacter', target: 'enemyCharacter' }]),
      { enemy: { f1: mkComp('foe', compCard2.name, { hp: 9, maxHp: 9, loadout: { weapon: mkItem('fw', itemCard.name), gear: [null, null] } }) } });
    expect(pat()?.twoStep).toBe('disarm');
    gs.getState().resolveActionTarget('caster'); // step 1: your attacker (atk 3)
    gs.getState().resolveActionTarget('foe');    // step 2: the victim
    const g = game();
    expect(g.p2.board.f1?.hp, 'attacked for the attacker atk').toBe(6);
    expect(g.p2.board.f1?.loadout?.weapon, 'item stripped').toBeNull();
    expect(g.p2.dead.map(c => c.name), 'item sacrificed to owner dead').toContain(itemCard.name);
    expect(g.p1.board.f1?.exhausted, 'the forced attacker exhausts').toBe(true);
  });
});

describe('counterAction (Ward of Silence)', () => {
  it('counters the action to the Dead Zone unresolved and sacrifices the ward; edge: uncounterable bypasses', () => {
    const counterable = mkAction([{ op: 'damage', amount: 3, target: 'enemyCharacter' }]);
    cast(counterable, { enemy: {
      f1: mkComp('foe', compCard2.name, { hp: 9, maxHp: 9 }),
      f2: mkConstruct('ward', 'Ward of Silence', 2, { subtype: 'Incantation' }),
    } });
    let g = game();
    expect(gs.getState().pendingActionTarget, 'never reached targeting').toBeNull();
    expect(g.p2.board.f1?.hp, 'no damage resolved').toBe(9);
    expect(g.p2.board.f2, 'ward sacrificed').toBeFalsy();
    expect(g.p2.dead.map(c => c.name)).toContain('Ward of Silence');
    expect(g.p1.dead.map(c => c.name), 'countered card in dead').toContain(counterable.name);

    const uncounterable = mkAction([], {
      effects: [{ trigger: 'onPlay', uncounterable: true, effects: [{ op: 'damage', amount: 3, target: 'enemyCharacter' }] }],
    });
    cast(uncounterable, { enemy: {
      f1: mkComp('foe', compCard2.name, { hp: 9, maxHp: 9 }),
      f2: mkConstruct('ward2', 'Ward of Silence', 2, { subtype: 'Incantation' }),
    } });
    gs.getState().resolveActionTarget('foe');
    g = game();
    expect(g.p2.board.f1?.hp, 'uncounterable resolved').toBe(6);
    expect(g.p2.board.f2?.name, 'ward untouched').toBe('Ward of Silence');
  });
});

describe('magicDamageBonus (static)', () => {
  it('+1 to Magic-Action damage; edge: non-Magic actions unboosted', () => {
    const foe = () => mkComp('foe', compCard2.name, { hp: 9, maxHp: 9 });
    cast(mkAction([{ op: 'damage', amount: 2, target: 'enemyCharacter' }], { subtype: 'Magic' }),
      { own: { f2: mkConstruct('eye', 'Burning Eye', 3, { subtype: 'Incantation' }) }, enemy: { f1: foe() } });
    gs.getState().resolveActionTarget('foe');
    expect(game().p2.board.f1?.hp, 'Magic action boosted 2→3').toBe(6);

    cast(mkAction([{ op: 'damage', amount: 2, target: 'enemyCharacter' }], { subtype: 'Physical' }),
      { own: { f2: mkConstruct('eye', 'Burning Eye', 3, { subtype: 'Incantation' }) }, enemy: { f1: foe() } });
    gs.getState().resolveActionTarget('foe');
    expect(game().p2.board.f1?.hp, 'Physical action unboosted').toBe(7);
  });
});

describe('preventAnchorDecay (static — Master of Foundations)', () => {
  it('own Physical Constructs skip decay; Magic Constructs still decay', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: {
      f1: mkComp('master', 'Master of Foundations'),
      f2: mkConstruct('phys', 'Test Wall', 2, { subtype: 'Fortification' }),
      f3: mkConstruct('mag', 'Test Glyph', 2, { subtype: 'Incantation' }),
    } } } }));
    gs.getState().endTurn(); // p1 → p2
    gs.getState().endTurn(); // p2 → p1: p1's ready phase runs decay
    const g = game();
    expect(g.p1.board.f2?.anchors, 'Physical protected').toBe(2);
    expect(g.p1.board.f3?.anchors, 'Magic decays normally').toBe(1);
  });
});

describe('lineWard (static — The Long-Quiet Wall)', () => {
  function seed() {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: {
        f1: mkConstruct('wall', 'The Long-Quiet Wall', 5, { subtype: 'Fortification' }),
        b1: mkComp('victim', compCard.name, { hp: 9, maxHp: 9 }),
      } },
      p2: { ...s.game.p2, board: { f1: mkComp('raider', compCard2.name, { atk: 3 }), b1: mkPc('foe-pc', { atk: 4 }) } },
    }, pending: null }));
  }

  it('an opposing COMPANION cannot attack the warded (opposite) line', () => {
    seed();
    gs.setState({ pending: { action: 'attack', charId: 'raider' } });
    gs.getState().resolveAttack('victim');
    expect(game().p1.board.b1?.hp, 'attack refused').toBe(9);
  });

  it('edge: a PC attacker bypasses the ward', () => {
    seed();
    gs.setState({ pending: { action: 'attack', charId: 'foe-pc' } });
    gs.getState().resolveAttack('victim');
    expect(game().p1.board.b1?.hp, 'PC attack lands').toBe(5);
  });
});

describe('Cost kinds: sacrificeSelf (item and entity)', () => {
  it('Quill of Unmaking: the item is sacrificed as the cost, then the bounce resolves', () => {
    freshGame();
    const constrCard = CATALOG.find(c => c.type === 'Construct')!;
    const holder = mkComp('holder', compCard.name, { loadout: { weapon: null, gear: [mkItem('q', 'Quill of Unmaking'), null] } });
    // Real catalog name — bounce returns the card to hand via a name-keyed lookup.
    const wall = mkConstruct('wall', constrCard.name, 2, { subtype: constrCard.subtype });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [], board: { f1: holder, f2: wall } } } }));
    gs.getState().activateAbility('holder', 0);
    let g = game();
    expect(g.p1.board.f1?.loadout?.gear.filter(Boolean), 'item paid as the cost').toHaveLength(0);
    expect(g.p1.dead.map(c => c.name)).toContain('Quill of Unmaking');
    expect(gs.getState().pendingActionTarget, 'bounce target armed').not.toBeNull();
    gs.getState().resolveActionTarget('wall');
    g = game();
    expect(g.p1.board.f2, 'construct bounced').toBeFalsy();
    expect(g.p1.hand.map(c => c.name)).toContain(constrCard.name);
  });

  it('Collapsing Tunnel: the construct sacrifices ITSELF, then the damage resolves', () => {
    freshGame();
    const tunnel = mkConstruct('tunnel', 'Collapsing Tunnel', 2, { subtype: 'Trap' });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: tunnel } },
      p2: { ...s.game.p2, board: { b1: mkComp('lurker', compCard2.name, { hp: 9, maxHp: 9 }) } },
    } }));
    gs.getState().activateAbility('tunnel', 0);
    let g = game();
    expect(g.p1.board.f1, 'tunnel sacrificed as the cost').toBeFalsy();
    expect(g.p1.dead.map(c => c.name)).toContain('Collapsing Tunnel');
    const armed = gs.getState().pendingActionTarget;
    if (armed) gs.getState().resolveActionTarget('lurker');
    g = game();
    expect(g.p2.board.b1?.hp, 'back-line enemy took 3').toBe(6);
  });
});

describe('equipFromHand (on-enter — Veteran of the Ashgrove shape)', () => {
  it('placing the Veteran arms a free equip from hand', () => {
    freshGame();
    const veteran = CATALOG.find(c => c.name === 'Veteran of the Ashgrove')!;
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      willpower: 5, classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
      hand: [veteran, itemCard], board: {},
    } } }));
    gs.getState().beginPlay(veteran.id);
    gs.getState().placeCard('b1');
    expect(gs.getState().pendingEquipPick, 'equip pick armed').not.toBeNull();
    gs.getState().resolveEquipPick(itemCard.id);
    const ent = game().p1.board.b1!;
    const equipped = [ent.loadout?.weapon, ...(ent.loadout?.gear ?? [])].filter(Boolean);
    expect(equipped.map(i => i!.name), 'item equipped for free').toContain(itemCard.name);
    expect(ent.acts.minor, 'no Minor spent').toBe(false);
  });
});

describe('declared-but-uninterpreted ops (documented as safe no-ops)', () => {
  it('discard / mill / sacrifice / sacrificeItem / search / modal / gainControl neither crash nor corrupt', () => {
    const specs: Effect[] = [
      { op: 'discard', count: 1, target: 'targetPlayer' },
      { op: 'mill', count: 2, target: 'targetPlayer' },
      { op: 'sacrifice', target: 'ownCompanion' },
      { op: 'sacrificeItem', target: 'anyItem' },
      { op: 'search', cardType: 'Companion' },
      { op: 'modal', options: [{ label: 'A', effects: [] }] },
      { op: 'gainControl', target: 'enemyCompanion', duration: 'while' },
    ];
    for (const e of specs) {
      expect(() => {
        cast(mkAction([e]), { enemy: { f1: mkComp('foe', compCard2.name) } });
        const armed = gs.getState().pendingActionTarget;
        if (armed?.eligibleIds.length) gs.getState().resolveActionTarget(armed.eligibleIds[0]);
        else if (armed) gs.getState().cancelActionTarget();
      }, `${e.op} must not throw`).not.toThrow();
      expect(gs.getState().pendingActionTarget, `${e.op} leaves no dangling prompt`).toBeNull();
    }
  });
});
