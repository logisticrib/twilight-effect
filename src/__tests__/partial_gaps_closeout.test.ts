// Partial-gaps closeout (owner-ratified 2026-07-16) — the five remaining partial
// cards + the any-deck peek machinery. Printed per-turn limits STAY on triggers
// and passives (the exhaust-cost guideline governs ACTIVATED abilities only).
// ENGINE READING (flagged in HANDOFF): "when equipped character PLAYS a Magic
// Action" fires on the PLAY itself (2026-07-15: "play" is the from-hand event) —
// a countered action was still played, so the Embercast Wand rider still draws.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkItem, mkCz } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const czCards = CATALOG.slice(20, 25);
const compCard = CATALOG.find(c => c.type === 'Companion')!;
const magicAction = (id: string, pm: 'Minor' | 'Major'): Card => ({ id, name: `Test Spark ${id}`, level: 1,
  type: 'Action', subtype: 'Magic', rarity: 'Common', class1: 'Sorcerer', class2: '', attack: 0, hp: 0,
  anchor: null, actionSub: '', actionPM: pm, itemKind: '', keywords: [], text: '', flavor: '',
  effects: [{ trigger: 'onPlay', effects: [{ op: 'damage', amount: 1, target: 'frontLineEnemy' }] }] } as unknown as Card);

function seed(hand: Card[], p1Board: Record<string, ReturnType<typeof mkComp>>, p2Board: Record<string, ReturnType<typeof mkComp>> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand, deck: CATALOG.slice(30, 38), board: p1Board,
      classZone: czCards.map((c, i) => mkCz(c, 'Sorcerer', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2Board, hand: [], deck: CATALOG.slice(40, 44) },
  } }));
}
const p1 = () => gs.getState().game.p1;
const playAs = (actorId: string, cardId: string) => {
  gs.setState(s => ({ game: { ...s.game, selected: actorId } }));
  gs.getState().playAction(cardId);
};

describe('Embercast Wand — "Once per turn, when equipped character plays a Magic Action, draw a card."', () => {
  const wandBearer = () => mkComp('wb', compCard.name, { fresh: false,
    loadout: { weapon: mkItem('ew-1', 'Embercast Wand', {}), gear: [null, null] } });

  it('draws on the bearer\'s Magic Action play; once per turn; resets next turn', () => {
    seed([magicAction('m1', 'Minor'), magicAction('m2', 'Major'), magicAction('m3', 'Minor')],
      { f1: wandBearer() }, { f1: mkComp('tgt', compCard.name, { hp: 9 }) });
    const hand0 = p1().hand.length, deck0 = p1().deck.length;
    playAs('wb', 'm1');
    expect(p1().hand.length, 'played one, drew one — hand size net unchanged').toBe(hand0);
    expect(p1().deck.length, 'the rider drew exactly one').toBe(deck0 - 1);
    playAs('wb', 'm2');
    expect(p1().deck.length, 'second Magic play same turn — NO second draw (per-wand once/turn)').toBe(deck0 - 1);
    gs.getState().endTurn(); gs.getState().endTurn();
    gs.setState(s => ({ game: { ...s.game, currentPhase: 'action' } }));
    playAs('wb', 'm3');
    expect(p1().deck.length, 'next turn: the rider fires again (turn draw accounted)').toBe(deck0 - 1 - 1 - 1);
  });
});

describe('Ashforged Pendant × Ward of Silence — "The first Magic Action equipped character plays each turn cannot be countered."', () => {
  const pendantBearer = () => mkComp('pb', compCard.name, { fresh: false,
    loadout: { weapon: null, gear: [mkItem('ap-1', 'Ashforged Pendant', {}), null] } });
  const ward = (id: string) => mkConstruct(id, 'Ward of Silence', 2, { subtype: 'Incantation' });

  it('FIRST Magic Action resolves through the ward; the SECOND is countered; the count resets next turn', () => {
    seed([magicAction('m1', 'Minor'), magicAction('m2', 'Major'), magicAction('m3', 'Minor')],
      { f1: pendantBearer() }, { f1: mkComp('tgt', compCard.name, { hp: 9 }), f2: ward('w-1'), f3: ward('w-2') });
    playAs('pb', 'm1');
    let g = gs.getState().game;
    expect(g.p2.board.f1?.hp, 'first Magic Action RESOLVED (uncounterable)').toBe(8);
    expect(g.p2.board.f2?.name, 'ward untouched by the protected play').toBe('Ward of Silence');
    playAs('pb', 'm2');
    g = gs.getState().game;
    expect(g.p2.board.f1?.hp, 'second Magic Action COUNTERED — no damage').toBe(8);
    expect(g.p2.board.f2, 'a ward paid itself to counter it').toBeUndefined();
    gs.getState().endTurn(); gs.getState().endTurn();
    gs.setState(s => ({ game: { ...s.game, currentPhase: 'action' } }));
    playAs('pb', 'm3');
    expect(gs.getState().game.p2.board.f1?.hp, 'new turn: the FIRST is protected again').toBe(7);
  });
});

describe('Runic Convergence Staff — "Exhaust this staff: look at the top card of any deck." (window-model tap + any-deck peek)', () => {
  const staffBearer = () => mkComp('sb', compCard.name, { fresh: false,
    loadout: { weapon: mkItem('rcs-1', 'Runic Convergence Staff', {}), gear: [null, null] } });

  it('tap arms the deck choice; OPPONENT deck: sees their top card, look-only (deck order unchanged); staff exhausts, bearer spends nothing', () => {
    seed([], { f1: staffBearer() });
    const oppTop = gs.getState().game.p2.deck[0]?.name;
    const oppDeck0 = gs.getState().game.p2.deck.map(c => c.id);
    gs.getState().activateAbility('sb', 0);
    let pk = gs.getState().game.pendingPeek;
    expect(pk?.chooseDeck, 'deck-choice phase armed').toBe(true);
    gs.getState().resolvePeekDeck('p2');
    pk = gs.getState().game.pendingPeek;
    expect(pk?.deckSide).toBe('p2');
    expect(pk?.cards[0]?.name, "sees the opponent's top card").toBe(oppTop);
    expect(pk?.dests, 'LOOK only — the single destination is back on top').toEqual(['top']);
    gs.getState().resolvePeek(['top']);
    const g = gs.getState().game;
    expect(g.p2.deck.map(c => c.id), 'opponent deck order unchanged').toEqual(oppDeck0);
    expect(g.p1.board.f1?.loadout?.weapon?.exhausted, 'staff exhausted (the whole cost)').toBe(true);
    expect(g.p1.board.f1?.tapped, 'bearer did not rotate (window model)').toBe('none');
  });

  it('OWN deck branch works too', () => {
    seed([], { f1: staffBearer() });
    const ownTop = p1().deck[0]?.name;
    gs.getState().activateAbility('sb', 0);
    gs.getState().resolvePeekDeck('p1');
    expect(gs.getState().game.pendingPeek?.cards[0]?.name, 'own top card shown').toBe(ownTop);
    gs.getState().resolvePeek(['top']);
    expect(gs.getState().game.pendingPeek, 'peek resolved').toBeNull();
  });
});

describe('Lens of Foretelling — start-of-turn peek gains the ANY-deck choice (printed top/bottom placement kept)', () => {
  it('at turn start the controller chooses the deck; opponent-deck pick offers top/bottom per the printed text', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p2: { ...s.game.p2, deck: CATALOG.slice(40, 44),
        board: { f1: mkComp('lb', compCard.name, { fresh: false,
          loadout: { weapon: null, gear: [mkItem('lof-1', 'Lens of Foretelling', {}), null] } }) } },
    } }));
    gs.getState().endTurn(); // p1 → p2: p2's turn starts, the Lens peek arms
    const pk = gs.getState().game.pendingPeek;
    expect(pk?.chooseDeck, 'deck choice armed at turn start').toBe(true);
    expect(pk?.lp, "the Lens controller's choice").toBe('p2');
    const p1Top = gs.getState().game.p1.deck[0]?.name;
    gs.getState().resolvePeekDeck('p1'); // look at the OPPONENT's deck
    const pk2 = gs.getState().game.pendingPeek;
    expect(pk2?.cards[0]?.name, "opponent's top card").toBe(p1Top);
    expect(pk2?.dests, 'printed placement choice kept').toEqual(['top', 'bottom']);
    gs.getState().resolvePeek(['bottom']);
    expect(gs.getState().game.p1.deck.at(-1)?.name, 'placed on the bottom of the CHOSEN deck').toBe(p1Top);
  });
});

describe("Captain's Belt / Engineer's Toolbelt — Kit-Master ON EQUIP (was dead; the keyword was enter-wired only)", () => {
  it('equipping the belt arms the kit prompt when a move exists; toasts the fizzle when none does', () => {
    const belt = CATALOG.find(c => c.name === "Captain's Belt")!;
    seed([belt], {
      f1: mkComp('wearer', compCard.name, { fresh: false, loadout: { weapon: null, gear: [null, null] } }),
      f2: mkComp('holder', compCard.name, { fresh: false, loadout: { weapon: mkItem('sw-1', 'Iron Sword', {}), gear: [null, null] } }),
    });
    gs.getState().equipItem('wearer', belt.id);
    const pk = gs.getState().pendingKit;
    expect(pk?.sourceName, 'kit prompt armed by the equip').toBe("Captain's Belt");
    expect(pk?.step).toBe('source');
    expect(pk?.eligibleIds, 'the sword-holder is a legal source').toContain('holder');
    gs.getState().cancelPending?.();
    gs.setState({ pendingKit: null });

    // No movable item anywhere → equip lands, kit fizzles with a toast.
    const belt2 = CATALOG.find(c => c.name === "Engineer's Toolbelt")!;
    seed([belt2], { f1: mkComp('solo-w', compCard.name, { fresh: false, loadout: { weapon: null, gear: [null, null] } }) });
    gs.getState().equipItem('solo-w', belt2.id);
    expect(gs.getState().pendingKit, 'no prompt without a legal move').toBeNull();
    expect(gs.getState().toasts.at(-1)?.msg).toContain('no item to move (Kit-Master)');
  });
});
