// Armor INVERTED (owner ruling 2026-08-18, Master_Keyword_List §Item & Equipment
// Keywords): armor enters the encounter with X counters, each prevented damage
// instance REMOVES one, and at zero the item is sacrificed / the companion simply
// stops preventing. Mirrors Anchor-counter logic deliberately.
//
// Also pins the UNIVERSAL COUNTER RULE, the load-bearing half of the ruling: armor
// counters on a companion ARE the prevention ability. A companion with one or more
// armor counters prevents damage regardless of how the counters arrived — printed
// keyword or card effect — so prevention asks whether counters are PRESENT, never
// whether the keyword is.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkItem } from './helpers';
import { CATALOG } from '../data/catalog';
import { parseArmorKeyword } from '../store/keywords';
import { armorCandidatesOf, selfArmorId, isSelfArmorId } from '../engine/combat';
import { equipOnto } from '../engine/lifecycle';
import { itemProfileOf } from '../engine/entities';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];

/** Seed a 1-hit attack from p1's `att` into p2's `def`, and resolve it. */
function strike(att: ReturnType<typeof mkComp>, def: ReturnType<typeof mkComp>) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: { f1: att } },
    p2: { ...s.game.p2, board: { f1: def } },
  }, pending: { action: 'attack', charId: att.id } }));
  gs.getState().resolveAttack(def.id);
  return gs.getState().game;
}

describe('items: counters count DOWN from X', () => {
  it('an equipped Armor 3 piece enters loaded and spends one per prevented hit', () => {
    const piece = mkItem('inv-ar', 'Guard Plate', { armor: 3 });
    expect(piece.counters, 'enters with X, not 0').toBe(3);

    const g = strike(
      mkComp('inv-att', compCard.name, { atk: 4 }),
      mkComp('inv-def', compCard2.name, { hp: 5, loadout: { weapon: null, gear: [piece, null] } }),
    );
    expect(g.p2.board.f1?.hp, 'damage fully prevented').toBe(5);
    expect(g.p2.board.f1?.loadout?.gear[0]?.counters, '3 → 2').toBe(2);
  });

  it('the piece is sacrificed when its LAST counter is removed, not when it reaches X', () => {
    const g = strike(
      mkComp('lst-att', compCard.name, { atk: 4 }),
      mkComp('lst-def', compCard2.name, { hp: 5, loadout: { weapon: null, gear: [mkItem('lst-ar', 'Thin Shield', { armor: 1 }), null] } }),
    );
    expect(g.p2.board.f1?.hp, 'the one hit it had left was prevented').toBe(5);
    expect(g.p2.board.f1?.loadout?.gear[0], 'last counter gone → sacrificed').toBeNull();
  });

  it('an EMPTY piece (0 counters left) no longer prevents — the damage lands', () => {
    const g = strike(
      mkComp('emp-att', compCard.name, { atk: 4 }),
      mkComp('emp-def', compCard2.name, { hp: 5, loadout: { weapon: null, gear: [mkItem('emp-ar', 'Spent Plate', { armor: 3, counters: 0 }), null] } }),
    );
    expect(g.p2.board.f1?.hp, 'empty armor prevents nothing').toBe(1);
    expect(g.p2.board.f1?.loadout?.gear[0]?.counters, 'and stays at 0 — never goes negative').toBe(0);
  });
});

describe('universal counter rule: a companion’s OWN armor counters', () => {
  it('parses the companion-variant keyword parameter', () => {
    expect(parseArmorKeyword(['Armor 2'])).toBe(2);
    expect(parseArmorKeyword(['Guardian'])).toBeNull();
    expect(parseArmorKeyword(['Armor'])).toBeNull(); // printed without its parameter
  });

  it('counters on the companion prevent damage and decrement — no item involved', () => {
    const g = strike(
      mkComp('own-att', compCard.name, { atk: 4 }),
      mkComp('own-def', compCard2.name, { hp: 5, armorCounters: 2, armorStart: 2 }),
    );
    expect(g.p2.board.f1?.hp, 'fully prevented by the companion’s own counters').toBe(5);
    expect(g.p2.board.f1?.armorCounters, '2 → 1').toBe(1);
  });

  it('at zero the companion is INERT but NOT sacrificed (canon: it just stops preventing)', () => {
    const g = strike(
      mkComp('in-att', compCard.name, { atk: 4 }),
      mkComp('in-def', compCard2.name, { hp: 5, armorCounters: 0 }),
    );
    expect(g.p2.board.f1, 'still on the board — nothing is sacrificed').toBeTruthy();
    expect(g.p2.board.f1?.hp, 'and it takes the damage').toBe(1);
  });

  it('spending the LAST counter leaves the companion alive and inert', () => {
    let g = strike(
      mkComp('lc-att', compCard.name, { atk: 4 }),
      mkComp('lc-def', compCard2.name, { hp: 5, armorCounters: 1, armorStart: 1 }),
    );
    expect(g.p2.board.f1?.hp, 'first hit prevented').toBe(5);
    expect(g.p2.board.f1?.armorCounters, 'now empty').toBe(0);

    // A second hit on the now-empty companion lands.
    gs.setState(s => ({ ...s, pending: { action: 'attack', charId: 'lc-att' } }));
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: { ...s.game.p1.board.f1!, exhausted: false, tapped: 'none' as const, acts: { move: false, minor: false, major: false } } } } } }));
    gs.getState().resolveAttack('lc-def');
    g = gs.getState().game;
    expect(g.p2.board.f1?.hp, 'second hit lands — the ability is over').toBe(1);
    expect(g.p2.board.f1, 'and the companion is still alive').toBeTruthy();
  });

  it('EFFECT-placed counters are indistinguishable from keyword-native ones', () => {
    // No Armor keyword printed at all — only the counters. Prevention must not care.
    const def = mkComp('fx-def', compCard2.name, { hp: 5, keywords: [], armorCounters: 1 });
    expect(parseArmorKeyword(def.keywords), 'no printed Armor keyword').toBeNull();
    const g = strike(mkComp('fx-att', compCard.name, { atk: 4 }), def);
    expect(g.p2.board.f1?.hp, 'the counter alone prevents').toBe(5);
    expect(g.p2.board.f1?.armorCounters, 'and is spent').toBe(0);
  });
});

describe('the picker offers a companion’s own counters alongside equipped pieces', () => {
  it('armorCandidatesOf gathers gear AND self, self carrying the sentinel id', () => {
    const ent = mkComp('cand', compCard.name, {
      armorCounters: 2, armorStart: 2,
      loadout: { weapon: null, gear: [mkItem('cand-gear', 'Guard Plate', { armor: 3 }), null] },
    });
    const cands = armorCandidatesOf(ent);
    expect(cands.map(c => c.id), 'both sources offered').toEqual(['cand-gear', selfArmorId('cand')]);
    expect(cands.every(c => c.counters > 0), 'each reports counters REMAINING').toBe(true);
    expect(isSelfArmorId(selfArmorId('cand'))).toBe(true);
    expect(isSelfArmorId('cand-gear')).toBe(false);
  });

  it('an empty source drops out of the candidate list entirely', () => {
    const ent = mkComp('drop', compCard.name, {
      armorCounters: 0,
      loadout: { weapon: null, gear: [mkItem('drop-gear', 'Spent Plate', { armor: 3, counters: 0 }), null] },
    });
    expect(armorCandidatesOf(ent), 'nothing left to prevent with').toEqual([]);
  });

  it('gear + own counters = 2 sources → the DEFENDER is prompted to choose', () => {
    const g = strike(
      mkComp('pk-att', compCard.name, { atk: 4 }),
      mkComp('pk-def', compCard2.name, { hp: 5, armorCounters: 2, armorStart: 2,
        loadout: { weapon: null, gear: [mkItem('pk-gear', 'Guard Plate', { armor: 3 }), null] } }),
    );
    expect(g.pendingArmor, 'combat paused on the choice').not.toBeNull();
    expect(g.pendingArmor?.defender, 'the affected character’s controller chooses').toBe('p2');
    expect(g.pendingArmor?.candidates.map(c => c.id).sort(),
      'the companion’s own counters sit alongside the equipped piece')
      .toEqual([selfArmorId('pk-def'), 'pk-gear'].sort());

    gs.getState().resolveArmor(selfArmorId('pk-def'));
    const after = gs.getState().game;
    expect(after.pendingArmor, 'resolved').toBeNull();
    expect(after.p2.board.f1?.hp, 'hit fully prevented').toBe(5);
    expect(after.p2.board.f1?.armorCounters, 'the CHOSEN source spent the counter (2 → 1)').toBe(1);
    expect(after.p2.board.f1?.loadout?.gear[0]?.counters, 'the gear piece untouched').toBe(3);
  });
});

// ── Heavy armor (owner ruling 2026-08-18) ─────────────────────────────────────
// "Two-Handed Armor" was an ERROR — no such subtype exists; it should be HEAVY.
// Canon: Card_Design_Parameters §Type Line Format, "Heavy Armor: 2 slots (inherent
// rule)". Detection previously sniffed the literal word "heavy" out of printed prose,
// which NO shipped card carries — so the heavy path had never once fired. These pin
// the corrected reading, and the duplicate-candidate bug it made reachable.
describe('heavy armor', () => {
  const PLATE = CATALOG.find(c => c.name === 'Plate of the Standing Wall')!;

  /** Seed `wearer` on `side` with empty gear, then equip `card` onto it for real. */
  function equipOn(side: 'p1' | 'p2', wearerId: string, card: typeof PLATE) {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      [side]: { ...s.game[side], board: { f1: mkComp(wearerId, compCard2.name, { hp: 5, loadout: { weapon: null, gear: [] } }) } },
    } }));
    const g = equipOnto(gs.getState().game, side, wearerId, card);
    gs.setState(() => ({ game: g }));
    return g;
  }

  it('the shipped heavy armor card carries the canon subtype, not the erroneous one', () => {
    expect(PLATE.subtype, 'corrected 2026-08-18').toBe('Heavy Armor');
    expect(PLATE.subtype).not.toBe('Two-Handed Armor');
  });

  it('is detected as heavy from its SUBTYPE (its prose contains no "heavy")', () => {
    expect(PLATE.text.toLowerCase().includes('heavy'), 'prose carries no "heavy"').toBe(false);
    const prof = itemProfileOf(PLATE);
    expect(prof.isHeavy, 'read from the subtype instead').toBe(true);
    expect(prof.isWeapon, 'armor is not a weapon').toBe(false);
  });

  it('occupies BOTH gear slots when equipped, and enters loaded with X', () => {
    const g = equipOn('p1', 'hv-wearer', PLATE);
    const gear = g.p1.board.f1?.loadout?.gear;
    expect(gear?.[0]?.id, 'slot 1').toBe(PLATE.id);
    expect(gear?.[1]?.id, 'slot 2 — inherent 2-slot rule').toBe(PLATE.id);
    expect(gear?.[0]?.counters, 'Armor 4 enters with 4 counters').toBe(4);
  });

  it('is ONE candidate, not two — the same object in both slots must not double-count', () => {
    const g = equipOn('p1', 'hv-wearer', PLATE);
    const cands = armorCandidatesOf(g.p1.board.f1!);
    expect(cands.length, 'deduped by id — a lone heavy piece is a single source').toBe(1);
    expect(cands[0].counters).toBe(4);
  });

  it('a lone heavy piece therefore auto-absorbs with NO prompt, both slots in step', () => {
    equipOn('p2', 'hv-def', PLATE);
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('hv-att', compCard.name, { atk: 9 }) } },
    }, pending: { action: 'attack', charId: 'hv-att' } }));
    gs.getState().resolveAttack('hv-def');
    const after = gs.getState().game;
    expect(after.pendingArmor, 'one source → no choice to make').toBeNull();
    expect(after.p2.board.f1?.hp, 'hit fully prevented').toBe(5);
    expect(after.p2.board.f1?.loadout?.gear[0]?.counters, '4 → 3').toBe(3);
    expect(after.p2.board.f1?.loadout?.gear[1]?.counters, 'both slots stay in step').toBe(3);
  });
});

describe('item Armor X comes from the KEYWORD ARRAY, not printed prose (2026-08-18)', () => {
  it('derives X from keywords even when the text says nothing parseable', () => {
    const hauberk = CATALOG.find(c => c.name === 'Mailed Hauberk')!;
    const reworded = { ...hauberk, text: 'This item enters the encounter with two armor counters.' };
    expect(/armor\s+(\d+)/i.test(reworded.text), 'the old text regex finds nothing here').toBe(false);
    expect(reworded.keywords, 'but the declarative array still carries it').toEqual(['Armor 2']);

    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('kw-wearer', compCard2.name, { hp: 5, loadout: { weapon: null, gear: [] } }) } },
    } }));
    const g = equipOnto(gs.getState().game, 'p1', 'kw-wearer', reworded);
    const piece = g.p1.board.f1?.loadout?.gear[0];
    expect(piece?.armor, 'X read from keywords, not prose').toBe(2);
    expect(piece?.counters, 'and it enters loaded').toBe(2);
  });
});
