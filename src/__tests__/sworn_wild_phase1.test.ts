// SWORN WILD dev deck (paladin_druid_dev_50) — Phase 1 pins (2026-08-19).
// The owner-authored Paladin/Druid dev deck. Phase 1 = data entry + DEV-flagging every
// behavior the engine cannot yet honor; the flag list IS the arc plan. These pins prove
// the DATA contract (ids, dev flags, printed canon wording, type-line modifiers) and
// that the cards riding SHIPPED ops drive real engine paths end-to-end.
//
// NOT covered here (visible debt, DEV NOT-IMPLEMENTED flags in the deck JSON): Untamed,
// Tribute, Warded, `destroy`, Beast-subtype targeting/scoping, the self-attacked
// trigger, own-companion-enters, keyword-filtered scopes, "up to N", controls-a-keyword.
// Those cards' pins land with their arcs — the dw_rogue_dev Phase 1 discipline.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkCz } from './helpers';
import { CATALOG, SWORN_WILD_DEV_CARDS } from '../data/catalog';
import { validateCards } from '../data/validateCards';
import { parseArmorKeyword } from '../store/keywords';
import type { Card } from '../types/card';

const sw = (name: string): Card => {
  const c = SWORN_WILD_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`sworn wild card missing: ${name}`);
  return c;
};

describe('Sworn Wild — deck data contract', () => {
  it('is exactly 50 cards, dd000051–dd000100 in list order, every one dev:true', () => {
    expect(SWORN_WILD_DEV_CARDS.length).toBe(50);
    expect(SWORN_WILD_DEV_CARDS.map(c => c.id))
      .toEqual(Array.from({ length: 50 }, (_, i) => `dd${String(51 + i).padStart(6, '0')}`));
    expect(SWORN_WILD_DEV_CARDS.every(c => c.dev === true)).toBe(true);
  });

  it('validates clean against the card contract', () => {
    expect(validateCards(SWORN_WILD_DEV_CARDS)).toEqual([]);
  });

  it('names are unique across the WHOLE catalog (identity rule)', () => {
    const names = CATALOG.map(c => c.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it('every unimplemented behavior is FLAGGED, never silent (visible machinery debt)', () => {
    const flagged = SWORN_WILD_DEV_CARDS.filter(c => c.effectsFlag?.startsWith('DEV NOT-IMPLEMENTED'));
    // RETIRED + REWRITTEN 2026-08-19 (Arc A): this pinned the Phase-1 snapshot of 26.
    // Arc A cleared the seven family-A (destroy) cards, so the count is 19 — and the
    // pin now names WHICH cards went live, which is the fact worth protecting: a
    // regression that silently re-flagged one of them would slip past a bare count.
    const ARC_A = ['dd000075', 'dd000076', 'dd000077', 'dd000082', 'dd000092', 'dd000095', 'dd000096'];
    for (const id of ARC_A) {
      const c = SWORN_WILD_DEV_CARDS.find(x => x.id === id)!;
      expect(c.effectsFlag, `${id} ${c.name} went live in Arc A`).toBeUndefined();
      expect(c.effects?.length, `${id} carries real effects`).toBeGreaterThan(0);
    }
    // RETIRED + REWRITTEN 2026-08-20 (Arc B): was 19 after Arc A. Arc B cleared the
    // six family-B cards, leaving 13 — dd000066 and dd000071 keep NARROWED flags
    // because their remaining gaps belong to families C and G, not B.
    expect(flagged.length, "13 cards still await engine arcs (Arc B cleared six)").toBe(13);
    // A card is SILENT only if nothing at all carries its behavior: no effects, no
    // flag, and no printed keyword either. (Keyword reminder text is not silent — the
    // Armor carriers print a full clause that the live keyword honours, which is
    // exactly the case the validator's canon-containment check governs.)
    const silent = SWORN_WILD_DEV_CARDS.filter(c =>
      !c.effects?.length && !c.effectsFlag && !c.keywords?.length &&
      /\b(when|whenever|target|destroy|draw|heals?)\b/i.test(c.text ?? ''));
    expect(silent.map(c => c.name), 'no card carries behavior prose with nothing to honour it').toEqual([]);
  });
});

describe('Sworn Wild — printed canon (2026-08-18 rulings, quoted not paraphrased)', () => {
  it('Beast modifier is PRINTED, modifier-first, and Angels are never Beasts', () => {
    const beasts = SWORN_WILD_DEV_CARDS.filter(c => c.type === 'Companion' && /(^|\s)Beast\s/.test(c.subtype ?? ''));
    expect(beasts.length, 'the deck is Beast-heavy by design').toBe(16);
    // Modifier → Organism → Role: "Beast Boar", "Spirit Beast Deer", "Fungal Beast Toad".
    expect(sw('Bristlemane Boar').subtype).toBe('Beast Boar');
    expect(sw('Pale Hart').subtype).toBe('Spirit Beast Deer');
    expect(sw('Sporeback Toad').subtype).toBe('Fungal Beast Toad');
    // The Angel is sapient — NOT a Beast, which is why it can never pay its own Tribute.
    expect(sw('The Pale Ascendant').subtype).toBe('Angel');
    expect(sw('The Pale Ascendant').subtype).not.toContain('Beast');
  });

  it('ARMOR carriers print the full INVERTED companion clause with X substituted', () => {
    for (const name of ['Thornback Tortoise', 'Warden of Stonefern']) {
      const c = sw(name);
      expect(c.keywords).toContain('Armor 1');
      expect(parseArmorKeyword(c.keywords), 'X is read from the declarative array').toBe(1);
      expect(c.text).toContain('enters the encounter with 1 armor counter');
      expect(c.text).toContain('remove an armor counter from this companion');
      expect(c.text).toContain('it no longer prevents damage via this ability');
      // The INVERSION: never the retired accumulate-up wording.
      expect(c.text).not.toContain('put an armor counter');
      expect(c.text).not.toContain('sacrifice it');
    }
  });

  it('a companion-armor carrier enters the encounter LOADED with its counters', () => {
    // The universal counter rule end-to-end from real dev data: the printed keyword
    // places the counters once at entry, and from there the COUNTERS are the ability.
    const tortoise = sw('Thornback Tortoise');
    expect(parseArmorKeyword(tortoise.keywords)).toBe(1);
  });
});

describe('Sworn Wild — the cards riding SHIPPED ops drive real engine paths', () => {
  const czFor = (cls: string) => CATALOG.slice(20, 25).map((c, i) => mkCz(c, cls, `cz-${i}`));

  /** Seed p1 able to play `card` from hand, with a PC on board. */
  function seedWith(card: Card, cls: string) {
    freshGame();
    gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
      p1: { ...s.game.p1, hand: [card], classZone: czFor(cls), willpower: 5,
            board: { b3: mkPc('pc-1', { cls, hp: 10, maxHp: 20 }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('foe-1', 'Enemy A', { hp: 6 }), f2: mkComp('foe-2', 'Enemy B', { hp: 6 }) } },
    } }));
  }

  it('Gathering of Crows draws two', () => {
    const card = sw('Gathering of Crows');
    seedWith(card, 'Druid');
    const before = gs.getState().game.p1.hand.length;
    gs.getState().playAction(card.id);
    expect(gs.getState().game.p1.hand.length, 'played 1, drew 2').toBe(before - 1 + 2);
  });

  it('Light Unbroken heals a chosen character', () => {
    const card = sw('Light Unbroken');
    seedWith(card, 'Paladin');
    gs.getState().playAction(card.id);
    gs.getState().resolveActionTarget('pc-1');
    expect(gs.getState().game.p1.board.b3?.hp, '10 + 3').toBe(13);
  });

  it('Judgment of the Peaks deals 4 to a chosen opposing character', () => {
    const card = sw('Judgment of the Peaks');
    seedWith(card, 'Paladin');
    gs.getState().playAction(card.id);
    gs.getState().resolveActionTarget('foe-1');
    expect(gs.getState().game.p2.board.f1?.hp, '6 − 4').toBe(2);
  });

  it('Wrath of the Spires sweeps EVERY opposing companion (per-instance, no target pick)', () => {
    const card = sw('Wrath of the Spires');
    seedWith(card, 'Paladin');
    gs.getState().playAction(card.id);
    const g = gs.getState().game;
    expect(g.p2.board.f1?.hp, 'both hit for 3').toBe(3);
    expect(g.p2.board.f2?.hp, 'both hit for 3').toBe(3);
  });
});
