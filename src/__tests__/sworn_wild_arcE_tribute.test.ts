// SWORN WILD — ARC E: TRIBUTE (2026-08-23). One card, one family, and the last
// genuinely new machinery in the program: an ADDITIONAL COST PAID AT PLAY TIME.
// The shipped Cost schema covers activated abilities only; this is the play-time
// chokepoint, sited in placeCard between the last legality check and the Class-Zone spend.
//
//   dd000089 The Pale Ascendant — TRIBUTE: sacrifice a Beast. Guardian, Zealous.
//                                 Enters: draw two.
//
// RULINGS BUILT TO:
//  · Canon (MKL:64/65): "As an additional cost to play this Angel companion, pay its
//    Tribute cost." Angel (Paladin) Companion Exclusive.
//  · UNPAYABLE = UNPLAYABLE (locked). No payable Beast → the play is REFUSED: the card
//    stays in hand, nothing is paid, no partial state. This is the pre-cost refusal
//    precedent, which governs COSTS — deliberately NOT the targeted-Action fizzle
//    (retired as an Action reading 2026-08-21). The two precedents must not be crossed.
//  · Payment IS a sacrifice: on-sacrifice listeners fire, generic leave triggers fire,
//    the card lands in its OWNER's Dead Zone. The exact inverse of the destroy pin,
//    which fires neither — both directions are pinned here.
//  · SLOT-VACANCY RULED 2026-08-23 (owner): "the offering makes room". A Back-Line slot
//    held by a PAYABLE Beast is itself a legal play target, so the slot is proven
//    available BEFORE any payment and "all legality before payment" survives intact.
//  · Beast matching via the Arc B shared matcher (token membership).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkCz } from './helpers';
import { CATALOG, SWORN_WILD_DEV_CARDS, TRIBUTE_BY_NAME, tributeOf } from '../data/catalog';
import { tributePayable } from '../engine';
import { validateCards } from '../data/validateCards';
import type { Card, BoardEntity, RawCard } from '../types/card';
import type { SlotId } from '../engine/geometry';
import rawDeck from '../data/paladin_druid_dev_50.json';

const sw = (name: string): Card => {
  const c = SWORN_WILD_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`sworn wild card missing: ${name}`);
  return c;
};
const ANGEL = () => sw('The Pale Ascendant');
const czFor = (cls: string) => CATALOG.slice(20, 25).map((c, i) => mkCz(c, cls, `cz-${i}`));
const g = () => gs.getState().game;
const st = () => gs.getState();

/** An entity built from a REAL card, so matching runs against AUTHORED data. */
const ent = (id: string, cardName: string, over: Partial<BoardEntity> = {}): BoardEntity => {
  const c = sw(cardName);
  return mkComp(id, cardName, {
    subtype: c.subtype, cls: c.class1, keywords: [...c.keywords],
    atk: c.attack ?? 0, hp: c.hp ?? 1, maxHp: c.hp ?? 1, ...over,
  });
};

/** Seed a board where the Angel is playable on cost/Willpower grounds (level 5). */
function seed(p1board: Record<string, BoardEntity> = {}, p2board: Record<string, BoardEntity> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
    p1: { ...s.game.p1, hand: [ANGEL()], classZone: czFor('Paladin'), willpower: 6, dead: [],
          board: { b3: mkPc('pc-1', { cls: 'Paladin', hp: 20, maxHp: 20 }), ...p1board } },
    p2: { ...s.game.p2, dead: [], board: { b3: mkPc('pc-2', { cls: 'Druid' }), ...p2board } },
  } }));
}
const play = (slot: SlotId) => { gs.getState().beginPlay(ANGEL().id); gs.getState().placeCard(slot); };
const said = () => st().toasts.map(t => t.msg).join(' || ');
const handIds = () => g().p1.hand.map(c => c.id);
const faceUpCZ = () => g().p1.classZone.filter(c => !c.faceDown).length;
const onBoard = (name: string) => Object.values(g().p1.board).find(e => e?.name === name);

// ─── 1. The authored cost ─────────────────────────────────────────────────────
describe('the cost is AUTHORED, never parsed out of printed prose', () => {
  it('dd000089 authors tribute.sacrificeSubtype in the deck data', () => {
    const raw = (rawDeck as { cards: RawCard[] }).cards.find(c => c.id === 'dd000089')!;
    expect(raw.tribute).toEqual({ sacrificeSubtype: 'Beast' });
    // The printed text still says it — but the ENGINE reads the authored field. The
    // 2026-08-18 equipOnto lesson: printed prose must not be load-bearing code input,
    // or a rewording silently changes the rules with nothing to catch it.
    expect(raw.text).toContain('TRIBUTE: sacrifice a Beast.');
  });

  it('the runtime Card does NOT carry it (nothing new serializes into recordings)', () => {
    // The Arc B trap: Card objects sit inside recorded snapshots, so an authored field
    // left on them re-hashes every fixture. normalize() drops it; the lookup holds it.
    expect(Object.prototype.hasOwnProperty.call(ANGEL(), 'tribute')).toBe(false);
    expect(tributeOf('The Pale Ascendant')).toEqual({ sacrificeSubtype: 'Beast' });
    expect(TRIBUTE_BY_NAME.size, 'exactly one Tribute carrier in the pool today').toBe(1);
  });

  it('a card with no Tribute has no cost — the lookup is not a default', () => {
    expect(tributeOf('Bristlemane Boar')).toBeUndefined();
  });
});

// ─── 2. The exclusivity + agreement guard ─────────────────────────────────────
describe('validator: TRIBUTE is Angel-exclusive and must agree with its authored cost', () => {
  const raw = () => structuredClone((rawDeck as { cards: RawCard[] }).cards
    .find(c => c.id === 'dd000089')!) as unknown as Card;

  it('the shipped card passes', () => {
    expect(validateCards([raw()])).toEqual([]);
  });

  it('TRIBUTE on a non-Angel is refused (MKL:65, Angel Companion Exclusive)', () => {
    const bad = { ...raw(), id: 'x-1', name: 'Tribute Boar Under Test',
                  subtype: 'Beast Boar', subtypes: ['Beast', 'Boar'] } as unknown as Card;
    expect(validateCards([bad]).some(m => /Angel-companion exclusive/.test(m))).toBe(true);
  });

  it('TRIBUTE with no authored cost is refused — the play would be FREE', () => {
    const bad = { ...raw(), id: 'x-2', name: 'Costless Angel Under Test',
                  tribute: undefined } as unknown as Card;
    expect(validateCards([bad]).some(m => /authors no `tribute\.sacrificeSubtype`/.test(m))).toBe(true);
  });

  it('an authored cost with no printed keyword is refused — it would charge silently', () => {
    const bad = { ...raw(), id: 'x-3', name: 'Silent Cost Under Test',
                  keywords: ['Guardian'] } as unknown as Card;
    expect(validateCards([bad]).some(m => /does not print the TRIBUTE keyword/.test(m))).toBe(true);
  });
});

// ─── 3. What can pay ──────────────────────────────────────────────────────────
describe('tributePayable — controller-scoped, subtype-matched', () => {
  it('offers your own Beasts, by AUTHORED token membership', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar'), b1: ent('hart', 'Pale Hart') });
    const ids = tributePayable(g(), 'p1', 'Beast').map(x => x.id).sort();
    // "Spirit Beast Deer" is a Beast — set membership, never string equality.
    expect(ids, 'both, including the stacked-modifier one').toEqual(['boar', 'hart']);
  });

  it("never offers the OPPONENT's Beasts — a cost is paid from your own board", () => {
    seed({}, { f1: ent('their-boar', 'Bristlemane Boar') });
    expect(tributePayable(g(), 'p1', 'Beast')).toEqual([]);
  });

  it('never offers a non-Beast, and never the Player Character', () => {
    seed({ f1: mkComp('human', 'Ally Human', { subtype: 'Human Scout' }) });
    expect(tributePayable(g(), 'p1', 'Beast')).toEqual([]);
    // The PC sits at b3 in every seed — the canBeSacrificed chokepoint excludes it
    // regardless of subtype, so it can never be dragged in as payment.
    expect(tributePayable(g(), 'p1', 'Beast').some(x => x.id === 'pc-1')).toBe(false);
  });

  it('the Angel can never pay its own Tribute — it is in HAND, and is not a Beast', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    const offered = tributePayable(g(), 'p1', 'Beast');
    expect(offered.some(x => x.name === 'The Pale Ascendant'), 'not on the board at all').toBe(false);
    // And the belt to that braces: even placed, an Angel is not a Beast (2026-08-18).
    seed({ f1: ent('boar', 'Bristlemane Boar'), b1: ent('angel', 'The Pale Ascendant') });
    expect(tributePayable(g(), 'p1', 'Beast').map(x => x.id)).toEqual(['boar']);
  });
});

// ─── 4. The payable path ──────────────────────────────────────────────────────
describe('the payable path: pay, THEN enter', () => {
  it('arms the prompt without spending anything', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    const czBefore = faceUpCZ();
    play('b1');
    const pt = st().pendingTribute!;
    expect(pt, 'the play is suspended on the cost').toBeTruthy();
    expect(pt.options.map(o => o.id)).toEqual(['boar']);
    expect(handIds(), 'the Angel is still in hand').toContain(ANGEL().id);
    expect(faceUpCZ(), 'the Class Zone is untouched').toBe(czBefore);
    expect(onBoard('Bristlemane Boar'), 'nothing sacrificed yet').toBeTruthy();
  });

  it('paying sacrifices the Beast and the Angel enters, fresh, with Zealous and two drawn', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    const drawBefore = g().p1.hand.length;
    play('b1');
    gs.getState().resolveTribute('boar');

    expect(onBoard('Bristlemane Boar'), 'the Beast is gone from the board').toBeFalsy();
    expect(g().p1.dead.map(c => c.name), "…and is in its OWNER's Dead Zone, recoverable")
      .toContain('Bristlemane Boar');

    const angel = g().p1.board.b1!;
    expect(angel.name).toBe('The Pale Ascendant');
    expect(angel.fresh, 'entered this turn').toBe(true);
    expect(angel.keywords, 'printed keywords intact').toEqual(['Tribute', 'Guardian', 'Zealous']);
    // hand: -1 Angel played, +2 drawn by its enter trigger.
    expect(g().p1.hand.length, 'played one, drew two').toBe(drawBefore - 1 + 2);
    expect(st().pendingTribute, 'the prompt is cleared').toBeNull();
  });

  it('the Class Zone is spent exactly once, on the completed play', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    const before = faceUpCZ();
    play('b1');
    gs.getState().resolveTribute('boar');
    expect(faceUpCZ(), 'one card turned face-down').toBe(before - 1);
  });

  it('payment routes through the real exit path — leave triggers FIRE, loudly', () => {
    // Sporeback Toad ("Fungal Beast Toad") carries onLeave → draw. Paying it as Tribute
    // must fire that, because payment is a real removal and not a quiet delete. The draw
    // is the observable, so this cannot pass on Dead-Zone routing alone.
    seed({ f1: ent('toad', 'Sporeback Toad') });
    const before = g().p1.hand.length;
    play('b1');
    gs.getState().resolveTribute('toad');
    // −1 Angel played, +1 the Toad's leave trigger, +2 the Angel's enter trigger.
    expect(g().p1.hand.length, "the Toad's onLeave fired on the way out").toBe(before - 1 + 1 + 2);
    expect(said(), 'the payment is announced, never silent').toMatch(/sacrificed to pay TRIBUTE/i);
    expect(g().p1.dead.some(c => c.name === 'Sporeback Toad')).toBe(true);
  });

  it('the payment is threaded as a SACRIFICE, not a destroy', () => {
    // HONEST LIMIT, recorded rather than papered over: the only SACRIFICE-SPECIFIC
    // listener shipped today is `ownPhysicalConstructSacrificed` (Siegeworks), and a
    // Physical Construct can never be a Beast — so for a Tribute payment no listener in
    // the pool distinguishes 'sacrifice' from 'destroy'. Arc A pinned the inverse
    // direction (destroy leaves Siegeworks silent) where it IS observable.
    //
    // What is pinned here is the cause at the CALL SITE, which is what a future
    // companion-hosted on-sacrifice listener will read. destroyEntity's `cause` is a
    // REQUIRED parameter (Arc C), so this cannot silently drift to a wrong value — but
    // the moment such a listener lands, it must be pinned firing here.
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    play('b1');
    gs.getState().resolveTribute('boar');
    // The sworn-card return below is cause-agnostic; the Dead-Zone destination is the
    // shared exit path. Both prove the removal is REAL, which is the half that is
    // observable today.
    expect(g().p1.dead.some(c => c.name === 'Bristlemane Boar'),
      'routed through destroyEntity, not quietly deleted').toBe(true);
    expect(onBoard('Bristlemane Boar')).toBeFalsy();
  });

  it('an OATHSWORN Beast returns its sworn card to hand while paying (the designed collision)', () => {
    // The deck's intended collision: Tribute eats an Oathsworn Beast. Oathsworn has been
    // live since before the dev-deck import (keywordRegistry done:true), so this is a
    // pin, not new machinery — destroyEntity returns the sworn card on EVERY exit.
    const tucked = sw('Bristlemane Boar');
    seed({ f1: ent('turtle', 'Elder Shellback', { sworn: tucked }) });
    expect(g().p1.board.f1!.sworn?.name).toBe('Bristlemane Boar');
    play('b1');
    gs.getState().resolveTribute('turtle');
    expect(onBoard('Elder Shellback'), 'the Oathsworn Beast paid the cost').toBeFalsy();
    expect(g().p1.hand.some(c => c.name === 'Bristlemane Boar'),
      'its sworn card returned to hand mid-payment').toBe(true);
    expect(g().p1.board.b1?.name, 'and the Angel still entered').toBe('The Pale Ascendant');
  });

  it('declining costs nothing at all — no sacrifice, no Class Zone, card in hand', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    const czBefore = faceUpCZ();
    play('b1');
    gs.getState().cancelTribute();
    expect(st().pendingTribute).toBeNull();
    expect(handIds(), 'the Angel never left hand').toContain(ANGEL().id);
    expect(onBoard('Bristlemane Boar'), 'the Beast lives').toBeTruthy();
    expect(faceUpCZ(), 'the Class Zone is untouched').toBe(czBefore);
    expect(g().p1.board.b1 ?? null, 'nothing entered').toBeNull();
  });

  it('a single payable Beast still PROMPTS — a voluntary cost must be confirmable', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    play('b1');
    expect(st().pendingTribute?.options.length, 'one option, still a prompt').toBe(1);
    expect(onBoard('Bristlemane Boar'), 'not auto-paid behind the caster').toBeTruthy();
  });

  it('an invalid pick leaves the prompt armed and pays nothing', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar'), f2: mkComp('human', 'Ally Human', { subtype: 'Human Scout' }) });
    play('b1');
    gs.getState().resolveTribute('human');
    expect(st().pendingTribute, 'still armed').toBeTruthy();
    expect(onBoard('Ally Human'), 'the illegal pick was not taken').toBeTruthy();
    gs.getState().resolveTribute('pc-1');
    expect(onBoard('PC'), 'and never the PC').toBeTruthy();
  });
});

// ─── 5. The refusal path ──────────────────────────────────────────────────────
describe('UNPAYABLE = UNPLAYABLE — refusal before any payment', () => {
  it('no Beast at all → refused, hand unchanged, nothing paid', () => {
    seed({ f1: mkComp('human', 'Ally Human', { subtype: 'Human Scout' }) });
    const czBefore = faceUpCZ();
    play('b1');
    expect(st().pendingTribute, 'no prompt — the cost is unpayable').toBeNull();
    expect(said()).toMatch(/unpayable, so the play is refused/i);
    expect(handIds(), 'the card stays in hand').toContain(ANGEL().id);
    expect(faceUpCZ(), 'Class Zone unspent').toBe(czBefore);
    expect(g().p1.board.b1 ?? null, 'nothing entered').toBeNull();
    expect(g().p1.dead, 'nothing died').toEqual([]);
  });

  it("an OPPOSING Beast does NOT make it payable", () => {
    seed({}, { f1: ent('their-boar', 'Bristlemane Boar') });
    play('b1');
    expect(st().pendingTribute).toBeNull();
    expect(said()).toMatch(/unpayable/i);
    expect(g().p2.board.f1, "their Beast is untouched").toBeTruthy();
  });

  it('refusal is a COST refusal, not the Action fizzle — the card is not buried', () => {
    // The 2026-08-21 ruling retired refuses-at-zero for targeted ACTIONS, which fizzle
    // into the Dead Zone. A cost is the other precedent: nothing is spent and the card
    // never leaves hand. Crossing the two would bury the Angel for free.
    seed({ f1: mkComp('human', 'Ally Human', { subtype: 'Human Scout' }) });
    play('b1');
    expect(g().p1.dead.some(c => c.id === ANGEL().id), 'NOT buried').toBe(false);
    expect(handIds()).toContain(ANGEL().id);
  });
});

// ─── 6. The slot-vacancy ruling ───────────────────────────────────────────────
describe('slot vacancy — "the offering makes room" (owner ruling 2026-08-23)', () => {
  /** The ordinary blocking board: the PC holds b3, two Beasts hold b1/b2. */
  const fullBackLine = () => seed({
    b1: ent('boar', 'Bristlemane Boar'),
    b2: ent('lynx', 'Ashfen Lynx'),
    f1: mkComp('human', 'Ally Human', { subtype: 'Human Scout' }),
  });

  it('a Back-Line slot held by a payable Beast IS a legal destination', () => {
    fullBackLine();
    play('b1');
    const pt = st().pendingTribute!;
    expect(pt, 'the play was not refused for want of a slot').toBeTruthy();
    // The click chose the Beast: exactly one option, the slot's own occupant.
    expect(pt.options.map(o => o.id), 'the slot forces its occupant as the payment').toEqual(['boar']);
    expect(pt.slot).toBe('b1');
  });

  it('paying it vacates the slot and the Angel lands exactly there', () => {
    fullBackLine();
    play('b1');
    gs.getState().resolveTribute('boar');
    expect(g().p1.board.b1?.name, 'the Angel took the slot its Tribute vacated').toBe('The Pale Ascendant');
    expect(g().p1.board.b2?.name, 'the other Beast is untouched').toBe('Ashfen Lynx');
    expect(g().p1.dead.map(c => c.name)).toContain('Bristlemane Boar');
  });

  it('legality still precedes payment — the slot is proven free BEFORE the Beast dies', () => {
    fullBackLine();
    const czBefore = faceUpCZ();
    play('b1');
    // Suspended, not paid: the ruling buys the slot check nothing it did not already have.
    expect(onBoard('Bristlemane Boar'), 'still alive while the prompt is up').toBeTruthy();
    expect(faceUpCZ(), 'and nothing spent while it waits').toBe(czBefore);
    gs.getState().cancelTribute();
    expect(onBoard('Bristlemane Boar'), 'declining leaves the board exactly as it was').toBeTruthy();
    expect(faceUpCZ()).toBe(czBefore);
  });

  it('a slot held by a NON-payable permanent is refused, loudly', () => {
    seed({ b1: mkComp('human', 'Ally Human', { subtype: 'Human Scout' }),
           b2: ent('boar', 'Bristlemane Boar') });
    play('b1');
    expect(st().pendingTribute, 'the human cannot be offered').toBeNull();
    expect(said()).toMatch(/occupied by Ally Human/i);
    expect(onBoard('Ally Human'), 'untouched').toBeTruthy();
  });

  it('an EMPTY slot still offers every payable Beast (full agency preserved)', () => {
    seed({ b1: ent('boar', 'Bristlemane Boar'), f1: ent('lynx', 'Ashfen Lynx') });
    play('b2'); // empty
    expect(st().pendingTribute!.options.map(o => o.id).sort(),
      'both Beasts offered — the slot implied nothing').toEqual(['boar', 'lynx']);
  });

  it('a full Back Line with NO payable occupant is still unplayable', () => {
    seed({ b1: mkComp('h1', 'Ally One', { subtype: 'Human Scout' }),
           b2: mkComp('h2', 'Ally Two', { subtype: 'Human Scout' }),
           f1: ent('boar', 'Bristlemane Boar') });
    play('b1');
    expect(st().pendingTribute).toBeNull();
    expect(said()).toMatch(/occupied by Ally One/i);
  });
});

// ─── 7. Discipline ────────────────────────────────────────────────────────────
describe('serialization + wire discipline', () => {
  it('pendingTribute is STORE-LOCAL — no new wire shape', () => {
    // The `3a18396` finding: MP broadcasts GameState only and suppresses broadcasts
    // while a local pending is outstanding, so the prompt lives on the acting client
    // alone. A key on GameState would be a new wire shape AND would re-hash recordings.
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    play('b1');
    expect(st().pendingTribute, 'armed in the STORE').toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(g(), 'pendingTribute'),
      'and absent from GameState').toBe(false);
    expect(JSON.stringify(g()), 'nothing about the cost is serialized').not.toMatch(/pendingTribute/);
  });

  it('a completed play leaves no Tribute residue on the board entity', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    play('b1');
    gs.getState().resolveTribute('boar');
    const angel = g().p1.board.b1!;
    expect(Object.prototype.hasOwnProperty.call(angel, 'tribute'), 'no cost field rides along').toBe(false);
  });

  it('the ordinary play path is unchanged (commitPlay is shared, not forked)', () => {
    // A companion with NO Tribute must place exactly as before the extraction.
    freshGame();
    const boar = sw('Bristlemane Boar');
    gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
      p1: { ...s.game.p1, hand: [boar], classZone: czFor('Druid'), willpower: 6, dead: [],
            board: { b3: mkPc('pc-1', { cls: 'Druid' }) } },
    } }));
    gs.getState().beginPlay(boar.id);
    gs.getState().placeCard('b1');
    expect(g().p1.board.b1?.name).toBe('Bristlemane Boar');
    expect(st().pendingTribute, 'no cost, no prompt').toBeNull();
  });

  it('a Construct play is untouched by the cost gate', () => {
    freshGame();
    const lgs = sw('The Long Green Silence');
    gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
      p1: { ...s.game.p1, hand: [lgs], classZone: czFor('Druid'), willpower: 6, dead: [],
            board: { b3: mkPc('pc-1', { cls: 'Druid' }) } },
    } }));
    gs.getState().beginPlay(lgs.id);
    gs.getState().placeCard('f1');
    expect(g().p1.board.f1?.name).toBe('The Long Green Silence');
    expect(st().pendingTribute).toBeNull();
  });
});
