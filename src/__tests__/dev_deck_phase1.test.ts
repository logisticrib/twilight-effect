// DEV deck (dw_rogue_dev_50) — Phase 1 pins (2026-07-22).
// The owner-authored DW/Rogue dev deck exists to exercise the zero-coverage
// keywords and collision-seeking effects. Phase 1 = data entry + every card whose
// behavior rides SHIPPED ops. These pins prove the dev DATA drives the existing
// engine paths end-to-end (real card names — effectsOf/ITEM_GRANTED lookups are
// name-keyed), plus the two small returnFromDead extensions added this phase
// (optional: "you may"; itemKind: "target Weapon").
// NOT covered here (visible debt, DEV NOT-IMPLEMENTED flags in the deck JSON):
// Arcs A–I machinery. Those cards' pins land with their arcs.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { effectiveKeywords, effectiveAttack, legalAttackTargetIds, moveRestrictedBy,
         recomputeStatics, currentWillpower, isImmuneToSplash } from '../store/keywords';
import { resolveActionEffects } from '../engine';
import { CATALOG, DW_ROGUE_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';
import type { SlotId } from '../engine';

const dc = (name: string): Card => {
  const c = DW_ROGUE_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`dev card missing: ${name}`);
  return c;
};
const czCards = CATALOG.slice(20, 25);
const czFor = (cls: string, n = 5) => czCards.slice(0, n).map((c, i) => mkCz(c, cls, `cz-${i}`));

/** Seed p1 as the acting side with a class zone of `cls` and the given zones. */
function seedP1(over: { hand?: Card[]; board?: Record<string, ReturnType<typeof mkComp>>; dead?: Card[]; cls?: string },
                p2over: { board?: Record<string, ReturnType<typeof mkComp>>; hand?: Card[]; dead?: Card[] } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: over.hand ?? [], board: over.board ?? {}, dead: over.dead ?? [],
      classZone: czFor(over.cls ?? 'Doom-Whisperer'), willpower: 5 },
    p2: { ...s.game.p2, board: p2over.board ?? {}, hand: p2over.hand ?? [CATALOG[5]], dead: p2over.dead ?? [] },
  } }));
}
const g = () => gs.getState().game;
// Companion placement is a Special Action: it needs a live, unsealed PC (the PC's
// atomic activation) and companions enter the BACK LINE only.
const place = (card: Card, slot: SlotId) => {
  gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};
const playAs = (actorId: string, card: Card) => {
  gs.setState(s => ({ game: { ...s.game, selected: actorId, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().playAction(card.id);
};

describe('dev deck data: exactly the 50 owner cards, all flagged dev', () => {
  it('50 cards, every one dev:true, ids dd000001–dd000050 unique', () => {
    expect(DW_ROGUE_DEV_CARDS.length).toBe(50);
    expect(DW_ROGUE_DEV_CARDS.every(c => c.dev)).toBe(true);
    expect(new Set(DW_ROGUE_DEV_CARDS.map(c => c.id)).size).toBe(50);
  });

  it('Beast re-cut (owner-ratified 2026-08-18): the four animals carry the PRINTED Beast modifier — modifier-first, never derived', () => {
    // Owner ruling (Card_Design_Parameters §12, 2026-08-18): Beast = a non-magical
    // animal without sapience; PRINTED on the type line (physical-play
    // trackability), order Modifier → Organism. Exactly these four qualify —
    // every other companion in the pool is sapient or of supernatural origin.
    const beasts = DW_ROGUE_DEV_CARDS.filter(c => c.type === 'Companion' && /^Beast /.test(c.subtype ?? ''));
    expect(new Map(beasts.map(c => [c.name, c.subtype]))).toEqual(new Map([
      ['Fang-Adder', 'Beast Snake'], ['Marsh Scorpion', 'Beast Scorpion'],
      ['Carrion Crow', 'Beast Crow'], ['Sewer Rat', 'Beast Rat'],
    ]));
  });
});

describe('Coercion carrier (Whispering Acolyte) — the shipped keyword flow fires from dev data', () => {
  it('placing it arms pendingCoercion against the opponent', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { hand: [CATALOG[5]] });
    place(dc('Whispering Acolyte'), 'b1');
    expect(g().pendingCoercion?.victim).toBe('p2');
    expect(g().pendingCoercion?.source).toContain('Whispering Acolyte');
  });
});

describe('Paranoia on a VOCAL CONSTRUCT (Whispers in the Ranks) — construct carriers gather', () => {
  it("an opposing companion play arms the controller-owned peek over the placer's deck", () => {
    seedP1({ cls: 'Rogue', board: { b3: mkPc('pc-1') } },
      { board: { b2: mkConstruct('wir', 'Whispers in the Ranks', 2, { subtype: 'Utterance', keywords: ['Paranoia'] }) } });
    place(dc('Alley Cutpurse'), 'b1');
    const pk = g().pendingPeek;
    expect(pk, 'peek armed').toBeTruthy();
    expect(pk?.lp, 'owned by the Paranoia CONTROLLER').toBe('p2');
    expect(pk?.deckSide, "over the PLACER's deck").toBe('p1');
    expect(pk?.dests).toEqual(['top', 'bottom']);
  });
});

describe('Dismay on companion AND Utterance construct (printed keywords, recomputeStatics)', () => {
  it('a Litany of Despair (construct) under p1 dismays p2; willpower reads −1', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f2: mkConstruct('lod', 'Litany of Despair', 3, { subtype: 'Utterance', keywords: ['Dismay'] }) } },
      p2: { ...s.game.p2, willpower: 3 },
    } }));
    const g2 = recomputeStatics(g());
    expect(g2.p2.dismayed, 'construct carrier dismays').toBe(true);
    expect(currentWillpower(g2.p2)).toBe(2);
    expect(g2.p1.dismayed, 'controller unaffected').toBe(false);
  });
});

describe('Evasive (Alley Cutpurse) — back line legal despite an occupied front', () => {
  it('the evasive attacker reaches the back line; a plain attacker does not', () => {
    freshGame();
    const evasive = mkComp('ac', 'Alley Cutpurse', { keywords: ['Evasive'], atk: 2 });
    const plain = mkComp('pl', 'Plain Grunt', { atk: 2 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: evasive, f2: plain } },
      p2: { ...s.game.p2, board: { f1: mkComp('front', 'Front Def'), b1: mkComp('back', 'Back Def') } },
    } }));
    expect(legalAttackTargetIds(g(), evasive, 'p1').has('back'), 'Evasive reaches the back').toBe(true);
    expect(legalAttackTargetIds(g(), plain, 'p1').has('back'), 'plain attacker does not').toBe(false);
  });
});

describe('Poison carrier (Fang-Adder) — combat damage poisons and exhausts', () => {
  it('a real dev Poison companion applies the counter on a damaging hit', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('fa', 'Fang-Adder', { keywords: ['Poison'], atk: 1 }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('vic', 'Victim', { hp: 3 }) } },
    }, pending: { action: 'attack', charId: 'fa' } }));
    gs.getState().resolveAttack('vic');
    const vic = g().p2.board.f1!;
    expect(vic.hp, 'took the hit').toBe(2);
    expect(vic.poison, 'poison counter placed').toBe(1);
    expect(vic.exhausted, 'exhausted by Poison').toBe(true);
  });
});

describe("CLASS-keyed Bane (Faithless Assassin, PALADIN'S BANE) — canon 'subtype or class'", () => {
  it('doubles damage against a Paladin-CLASS companion; normal damage otherwise', () => {
    freshGame();
    const seedFight = (defCls: string) => {
      gs.setState(s => ({ game: { ...s.game,
        p1: { ...s.game.p1, board: { f1: mkComp('fa', 'Faithless Assassin', { keywords: ["Paladin's Bane"], atk: 3 }) } },
        p2: { ...s.game.p2, board: { f1: mkComp('def', 'Defender', { cls: defCls, hp: 9, maxHp: 9 }) } },
      }, pending: { action: 'attack', charId: 'fa' } }));
      gs.getState().resolveAttack('def');
      return g().p2.board.f1!.hp;
    };
    expect(seedFight('Paladin'), 'Paladin class → doubled (9−6)').toBe(3);
    expect(seedFight('Warrior'), 'other class → normal (9−3)').toBe(6);
  });
});

describe('Scavenger carrier (Carrion Crow) — optional Dead-Zone attach pick', () => {
  it('placing it with an Item in the Dead Zone arms the attach pick (Items only, optional)', () => {
    const itemCard = CATALOG.find(c => c.type === 'Item')!;
    const nonItem = CATALOG.find(c => c.type === 'Companion')!;
    seedP1({ cls: 'Rogue', board: { b3: mkPc('pc-1') }, dead: [itemCard, nonItem] });
    place(dc('Carrion Crow'), 'b1');
    const dp = g().pendingDeadPick;
    expect(dp, 'pick armed').toBeTruthy();
    expect(dp?.optional, 'Scavenger is a MAY').toBe(true);
    expect(dp?.attachTo?.name).toBe('Carrion Crow');
    expect(dp?.options.every(o => o.card.type === 'Item'), 'Items only').toBe(true);
  });
});

describe('item-granted keywords via the printed keyword (whitelisted grants)', () => {
  it('Smoke Bomb grants ACROBATICS (incl. splash immunity); Second-Story Grapnel grants HIT & RUN', () => {
    freshGame();
    const bearer = mkComp('br', 'Bearer', { loadout: { weapon: null, gear: [mkItem('sb', 'Smoke Bomb'), null] } });
    const bearer2 = mkComp('br2', 'Bearer Two', { loadout: { weapon: null, gear: [mkItem('gr', 'Second-Story Grapnel'), null] } });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: bearer, f2: bearer2 } } } }));
    expect(effectiveKeywords(g().p1.board.f1!, g())).toContain('Acrobatics');
    expect(isImmuneToSplash(g().p1.board.f1!, g()), 'Acrobatics dodges splash').toBe(true);
    expect(effectiveKeywords(g().p1.board.f2!, g())).toContain('Hit & Run');
  });

  it('Venom-Slicked Dagger and Wolfsbane Knife carry their +1 attack (equipped buff)', () => {
    freshGame();
    const b1 = mkComp('b1', 'Bearer', { atk: 2, loadout: { weapon: mkItem('vd', 'Venom-Slicked Dagger'), gear: [] } });
    const b2 = mkComp('b2', 'Bearer Two', { atk: 2, loadout: { weapon: mkItem('wk', 'Wolfsbane Knife'), gear: [] } });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: b1, f2: b2 } } } }));
    expect(effectiveAttack(g().p1.board.f1!, g())).toBe(3);
    expect(effectiveAttack(g().p1.board.f2!, g())).toBe(3);
  });
});

describe('Sermon of Stillness — lineWard on a VOCAL construct (Long-Quiet Wall clause, word-identical)', () => {
  it('wards the opposite line absolutely: even an Evasive companion cannot reach it', () => {
    freshGame();
    const evasive = mkComp('ev', 'Evasive Attacker', { keywords: ['Evasive'], atk: 2 });
    const seedBoard = (withWard: boolean) => {
      const p2board: Record<string, ReturnType<typeof mkComp>> = {
        f1: mkComp('front', 'Front Def'), b1: mkComp('back', 'Back Def'),
      };
      if (withWard) p2board.f2 = mkConstruct('sos', 'Sermon of Stillness', 3, { subtype: 'Utterance' });
      gs.setState(s => ({ game: { ...s.game,
        p1: { ...s.game.p1, board: { f1: evasive } },
        p2: { ...s.game.p2, board: p2board },
      } }));
    };
    seedBoard(true);
    expect(legalAttackTargetIds(g(), evasive, 'p1').has('back'), 'front-line ward protects the back line').toBe(false);
    expect(legalAttackTargetIds(g(), evasive, 'p1').has('front'), 'the front stays attackable').toBe(true);
    seedBoard(false);
    expect(legalAttackTargetIds(g(), evasive, 'p1').has('back'), 'no ward → Evasive reaches it (control)').toBe(true);
  });
});

describe('Droning Edict — restrictMove on a VOCAL construct (Reinforced Gate clause)', () => {
  it('opposing companions cannot move between lines while it stands', () => {
    freshGame();
    const mover = mkComp('mv', 'Mover', {});
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mover } },
      p2: { ...s.game.p2, board: { b2: mkConstruct('de', 'Droning Edict', 2, { subtype: 'Utterance' }) } },
    } }));
    expect(moveRestrictedBy(g(), mover, 'p1', 'f1', 'b1'), 'between lines → named restrictor').toBe('Droning Edict');
    expect(moveRestrictedBy(g(), mover, 'p1', 'f1', 'f2'), 'lateral move stays free').toBeNull();
  });
});

describe('Recall the Oath-Debt — returnFromDead via the action dead-pick sink (Special Action)', () => {
  it('arms a forced pick over the whole Dead Zone and returns the chosen card', () => {
    const [cardA, cardB] = [CATALOG[0], CATALOG[1]];
    seedP1({ board: { b1: mkPc('pc-1') }, dead: [cardA, cardB] });
    playAs('pc-1', dc('Recall the Oath-Debt'));
    const dp = g().pendingDeadPick;
    expect(dp, 'pick armed').toBeTruthy();
    expect(dp?.optional, '"return target card" — forced').toBe(false);
    expect(dp?.options.length, 'whole Dead Zone eligible').toBe(2);
    gs.getState().resolveDeadPick(0);
    expect(g().p1.hand.some(c => c.name === cardA.name), 'chosen card in hand').toBe(true);
    // Dead Zone: cardB + the played Recall the Oath-Debt itself (Actions are buried on resolve).
    expect(g().p1.dead.map(c => c.name)).not.toContain(cardA.name);
    expect(g().p1.dead.some(c => c.name === 'Recall the Oath-Debt'), 'the Action buried itself').toBe(true);
  });
});

describe('Litany of Endings — anchor −2 (Demolish family)', () => {
  // Real catalog construct name: destroyEntity buries the CARD by name lookup.
  const constrCard = CATALOG.find(c => c.type === 'Construct')!;
  const cast = (anchors: number) => {
    seedP1({ board: { f1: mkComp('actor', 'Caster', { fresh: false }) } },
      { board: { b2: mkConstruct('con-1', constrCard.name, anchors) } });
    playAs('actor', dc('Litany of Endings'));
    expect(gs.getState().pendingActionTarget, 'construct target armed').toBeTruthy();
    gs.getState().resolveActionTarget('con-1');
  };
  it('3 anchors → 1', () => {
    cast(3);
    expect(g().p2.board.b2?.anchors).toBe(1);
  });
  it('2 anchors → 0 → sacrificed to the Dead Zone', () => {
    cast(2);
    expect(g().p2.board.b2, 'gone from the board').toBeFalsy();
    expect(g().p2.dead.some(c => c.name === constrCard.name), 'buried').toBe(true);
  });
});

describe('Gutter Fence — Scavenger + structured onEnter on ONE card (the collision it was built to find)', () => {
  // RETIRED + REWRITTEN 2026-08-04 (Arc G): the old debt pin asserted the
  // single-pending enter window — Scavenger claimed the enter, the authored
  // hand-return clause was DROPPED (exactly one dead pick armed). The window is
  // now a queue: both enter triggers become owner-ordered 'enterUnit' stack
  // entries (Rules Note 2026-07-22), serialized so each evaluates FRESH. Full
  // choreography pins live in dev_deck_arcG.test.ts; this pin keeps the Phase-1
  // regression seat: the collision surfaces as an ordering prompt, nothing drops.
  it('REWRITTEN: both enter triggers queue — the owner orders, the return clause is no longer dropped', () => {
    const itemA = CATALOG.find(c => c.type === 'Item')!;
    const itemB = CATALOG.filter(c => c.type === 'Item')[1]!;
    seedP1({ cls: 'Rogue', board: { b3: mkPc('pc-1') }, dead: [itemA, itemB, CATALOG.find(c => c.type === 'Companion')!] });
    place(dc('Gutter Fence'), 'b1');
    const po = g().pendingTriggerOrder;
    expect(po?.lp, 'the OWNER orders their own enter triggers').toBe('p1');
    expect(po?.items.length, 'both triggers pending — neither dropped').toBe(2);
    expect(g().pendingDeadPick, 'no pick arms until the order is chosen (queue-time-blind)').toBeFalsy();
  });
});

describe('returnFromDead optional extension — "you may" arms a skippable pick (interpreter level)', () => {
  it('optional:true flows into the sink entry; default stays forced', () => {
    freshGame();
    const itemCard = CATALOG.find(c => c.type === 'Item')!;
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, dead: [itemCard] } } }));
    const sink: NonNullable<ReturnType<typeof gs.getState>['game']['pendingDeadPick']>[] = [];
    resolveActionEffects(g(), 'p1', 'Optional Probe',
      [{ op: 'returnFromDead', to: 'hand', cardType: 'Item', optional: true }], undefined, undefined, undefined, sink);
    expect(sink.length).toBe(1);
    expect(sink[0].optional, 'optional:true honored').toBe(true);
    const sink2: typeof sink = [];
    resolveActionEffects(g(), 'p1', 'Forced Probe',
      [{ op: 'returnFromDead', to: 'hand' }], undefined, undefined, undefined, sink2);
    expect(sink2[0].optional, 'absent → forced (shipped default unchanged)').toBe(false);
  });
});

describe("Fence's Ledger — activated exhaustItem, returnFromDead itemKind:'Weapon'", () => {
  it('offers ONLY Weapons, exhausts the trinket as the cost, and returns the weapon to hand', () => {
    freshGame();
    const weapon = CATALOG.find(c => c.itemKind === 'Weapon')!;
    const trinket = CATALOG.find(c => c.itemKind === 'Trinket' && c.name !== "Fence's Ledger")!;
    const bearer = mkComp('lb', 'Ledger Bearer', { fresh: false,
      loadout: { weapon: null, gear: [mkItem('fl', "Fence's Ledger"), null] } });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: bearer }, dead: [weapon, trinket, CATALOG.find(c => c.type === 'Companion')!] },
    } }));
    gs.getState().activateAbility('lb', 0);
    const dp = g().pendingDeadPick;
    expect(dp, 'pick armed').toBeTruthy();
    expect(dp?.options.map(o => o.card.name), 'Weapons ONLY (itemKind extension)').toEqual([weapon.name]);
    expect(g().p1.board.f1?.loadout?.gear[0]?.exhausted, 'ledger exhausted as the cost').toBe(true);
    gs.getState().resolveDeadPick(dp!.options[0].idx);
    expect(g().p1.hand.some(c => c.name === weapon.name), 'weapon in hand').toBe(true);
  });
});
