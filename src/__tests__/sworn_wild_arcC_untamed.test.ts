// SWORN WILD — ARC C: UNTAMED (2026-08-23). Six cards go live:
//   dd000051 Bristlemane Boar        UNTAMED: +1 attack          (continuous stat)
//   dd000061 Ashfen Lynx             UNTAMED: +2 attack          (continuous stat)
//   dd000054 Mistfur Fox             UNTAMED: gains Hit & Run    (conditional keyword)
//   dd000065 Stonefern Wyrm          UNTAMED: gains Guardian     (conditional keyword)
//   dd000071 The Long Green Silence  UNTAMED: Beasts +2 attack   (conditional aura)
//   dd000066 Elder Shellback         enters, if Untamed: armor   (entry snapshot + the G-op)
//
// OWNER RULINGS BUILT TO:
//  · GEAR ONLY (2026-08-18). Weapons are Items but NOT Gear and never suppress Untamed.
//  · ENCOUNTER-WIDE (2026-08-18). BOTH players' Gear and Physical Constructs count.
//  · KEYWORD-INDEPENDENT (2026-08-23). Untamed belongs to the ENCOUNTER; the keyword
//    only attaches a bonus. This is what makes dd000066's authored keyword array — which
//    prints Guardian and Oathsworn, NOT Untamed — correct as written. No card face changed.
//  · dd000066 is the deliberate EXCEPTION SHAPE: an entry-snapshot intervening-if, read
//    once and never re-evaluated. No retroactive placement when the encounter later clears.
//  · The universal counter rule (2026-08-18) already made armor counters BE the
//    prevention however placed, so the new op only PLACES. Prevention got no new code.
//  · DERIVED ON READ. Nothing about Untamed serializes into GameState.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { CATALOG, SWORN_WILD_DEV_CARDS } from '../data/catalog';
import { isUntamedEncounter, effectiveAttack, effectiveKeywords, gearItemsOf,
         bindingGuardianIds, HIT_RUN_STATUS } from '../store/keywords';
import { armorCandidatesOf } from '../engine/combat';
import type { Card, BoardEntity } from '../types/card';
import type { SlotId } from '../engine/geometry';

const sw = (name: string): Card => {
  const c = SWORN_WILD_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`sworn wild card missing: ${name}`);
  return c;
};
const czFor = (cls: string) => CATALOG.slice(20, 25).map((c, i) => mkCz(c, cls, `cz-${i}`));
const g = () => gs.getState().game;

/** An entity built from a REAL card, so every match runs against authored data. */
const ent = (id: string, cardName: string, over: Partial<BoardEntity> = {}): BoardEntity => {
  const c = sw(cardName);
  return mkComp(id, cardName, {
    subtype: c.subtype, cls: c.class1, keywords: [...c.keywords],
    atk: c.attack ?? 0, hp: c.hp ?? 1, maxHp: c.hp ?? 1, ...over,
  });
};
const gear = (id: string, name = 'Guard Plate') => mkItem(id, name, { armor: 2, sub: 'Armor' });
/** Fang of the First Hunt — a real WEAPON, the ruling's sharpest table case. */
const fang = (id = 'fang') => mkItem(id, sw('Fang of the First Hunt').name, { sub: 'Weapon - Fang' });
const wearing = (gearItem: ReturnType<typeof gear> | null,
                 weapon: ReturnType<typeof fang> | null = null) =>
  ({ loadout: { weapon, gear: [gearItem, null] } });

function seed(p1board: Record<string, BoardEntity> = {},
              p2board: Record<string, BoardEntity> = {}, hand: Card[] = []) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
    p1: { ...s.game.p1, hand, classZone: czFor('Druid'), willpower: 5, dead: [],
          board: { b3: mkPc('pc-1', { cls: 'Druid', hp: 10, maxHp: 20 }), ...p1board } },
    p2: { ...s.game.p2, dead: [], board: { b3: mkPc('pc-2', { cls: 'Paladin' }), ...p2board } },
  } }));
}
const place = (card: Card, slot: SlotId) => {
  gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};
const at = (id: string): BoardEntity => {
  for (const side of ['p1', 'p2'] as const) {
    const hit = Object.values(g()[side].board).find(e => e?.id === id);
    if (hit) return hit;
  }
  throw new Error(`entity ${id} not on either board`);
};

// ─── 1. The predicate itself ──────────────────────────────────────────────────
describe('isUntamedEncounter — the one derived predicate', () => {
  it('a board with no Gear and no Physical Constructs is Untamed', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    expect(isUntamedEncounter(g())).toBe(true);
  });

  it('GEAR suppresses — from EITHER side (encounter-wide, 2026-08-18)', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar', wearing(gear('g-mine'))) });
    expect(isUntamedEncounter(g()), 'own Gear suppresses').toBe(false);

    seed({ f1: ent('boar', 'Bristlemane Boar') },
         { f1: mkComp('them', 'Enemy A', wearing(gear('g-theirs'))) });
    expect(isUntamedEncounter(g()),
      "the OPPONENT's Gear suppresses too — never controller-scoped").toBe(false);
  });

  it('a WEAPON never suppresses — Fang of the First Hunt on a Beast (the sharpest case)', () => {
    // The ruling's flavor case: the deck's own weapon, equipped on the deck's own Beast.
    // "Gear is a strict subset of Items" — a Weapon is an Item and is not Gear.
    seed({ f1: ent('boar', 'Bristlemane Boar', wearing(null, fang())) });
    expect(g().p1.board.f1!.loadout!.weapon!.name,
      'the weapon really is equipped').toBe('Fang of the First Hunt');
    expect(gearItemsOf(g()), 'and it is not in the Gear universe').toEqual([]);
    expect(isUntamedEncounter(g()), 'Untamed stays LIVE under a weapon').toBe(true);
  });

  it('PHYSICAL Constructs suppress; Magic and Vocal Constructs do NOT', () => {
    seed({}, { f1: mkConstruct('trap', 'Tripwire Snare', 3, { subtype: 'Trap' }) });
    expect(isUntamedEncounter(g()), 'Trap is Physical').toBe(false);
    seed({}, { f1: mkConstruct('fort', 'Siegeworks', 3, { subtype: 'Fortification' }) });
    expect(isUntamedEncounter(g()), 'Fortification is Physical').toBe(false);
    seed({}, { f1: mkConstruct('inc', 'Binding Sigil', 2, { subtype: 'Incantation' }) });
    expect(isUntamedEncounter(g()), 'Incantation is MAGIC — no suppression').toBe(true);
    seed({}, { f1: mkConstruct('rite', 'Rite Under Test', 2, { subtype: 'Rite' }) });
    expect(isUntamedEncounter(g()), 'Rite is VOCAL — no suppression').toBe(true);
  });

  it('The Long Green Silence is an Incantation, so it never suppresses ITSELF', () => {
    // A Physical Construct here would make the card self-defeating — worth pinning
    // against a future subtype edit.
    expect(sw('The Long Green Silence').subtype).toBe('Incantation');
    seed({ f1: ent('boar', 'Bristlemane Boar'),
           f2: mkConstruct('lgs', 'The Long Green Silence', 3, { subtype: 'Incantation' }) });
    expect(isUntamedEncounter(g())).toBe(true);
  });
});

// ─── 2. The deck's core loop, end to end ──────────────────────────────────────
describe('the core loop: clear → suppressed → cleared again, in ONE read each way', () => {
  /** All five continuous carriers on one board at once. */
  const fiveCarriers = (): Record<string, BoardEntity> => ({
    f1: ent('boar', 'Bristlemane Boar'),   // +1 atk   (base 1)
    f2: ent('lynx', 'Ashfen Lynx'),        // +2 atk   (base 3)
    f3: ent('fox', 'Mistfur Fox'),         // Hit & Run
    b1: ent('wyrm', 'Stonefern Wyrm'),     // Guardian
    b2: mkConstruct('lgs', 'The Long Green Silence', 3,
        { subtype: 'Incantation', cls: 'Druid', keywords: ['Untamed'] }), // Beasts +2 atk
  });

  it('all five are LIVE on a clear encounter', () => {
    seed(fiveCarriers());
    expect(isUntamedEncounter(g())).toBe(true);
    expect(effectiveAttack(at('boar'), g()), 'base 1 + self 1 + aura 2').toBe(4);
    expect(effectiveAttack(at('lynx'), g()), 'base 3 + self 2 + aura 2').toBe(7);
    expect(effectiveKeywords(at('fox'), g())).toContain('Hit & Run');
    expect(effectiveKeywords(at('wyrm'), g())).toContain('Guardian');
    // The aura is Beast-scoped: the Fox is a Beast and takes it too (base 2 + 2).
    expect(effectiveAttack(at('fox'), g()), 'the aura reaches every Beast').toBe(4);
  });

  it('an OPPONENT equipping Gear drops all five at once — no event, no listener', () => {
    seed(fiveCarriers(), { f1: mkComp('them', 'Enemy A', wearing(gear('g-theirs'))) });
    expect(isUntamedEncounter(g())).toBe(false);
    expect(effectiveAttack(at('boar'), g()), 'printed base only').toBe(1);
    expect(effectiveAttack(at('lynx'), g()), 'printed base only').toBe(3);
    expect(effectiveKeywords(at('fox'), g()), 'the grant is gone').not.toContain('Hit & Run');
    expect(effectiveKeywords(at('wyrm'), g()), 'the grant is gone').not.toContain('Guardian');
  });

  it('Rust and Root destroying that Gear returns all five — liveness runs BOTH ways', () => {
    const rust = sw('Rust and Root'); // "Destroy target Gear."
    seed(fiveCarriers(), { f1: mkComp('them', 'Enemy A', wearing(gear('g-theirs'))) }, [rust]);
    expect(effectiveAttack(at('boar'), g()), 'suppressed to start').toBe(1);

    gs.getState().playAction(rust.id);
    gs.getState().resolveActionTarget('g-theirs');

    expect(gearItemsOf(g()), 'the Gear is gone from the encounter').toEqual([]);
    expect(isUntamedEncounter(g()), 'Untamed is live again').toBe(true);
    expect(effectiveAttack(at('boar'), g()), 'the +1 and the aura +2 both returned').toBe(4);
    expect(effectiveAttack(at('lynx'), g())).toBe(7);
    expect(effectiveKeywords(at('fox'), g())).toContain('Hit & Run');
    expect(effectiveKeywords(at('wyrm'), g())).toContain('Guardian');
  });

  it("the Wyrm's granted Guardian really BINDS attackers (a live keyword, not a label)", () => {
    seed({ f1: ent('wyrm', 'Stonefern Wyrm'), f2: ent('boar', 'Bristlemane Boar') },
         { f1: mkComp('att', 'Enemy A') });
    expect(bindingGuardianIds(g(), g().p2.board.f1!, 'p2'),
      'Untamed → Guardian binds').toEqual(['wyrm']);

    // Now suppress with a Physical Construct and the binding lifts in the same read.
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: { ...s.game.p2.board,
      f2: mkConstruct('trap', 'Tripwire Snare', 3, { subtype: 'Trap' }) } } } }));
    expect(bindingGuardianIds(g(), g().p2.board.f1!, 'p2'),
      'suppressed → nothing binds').toEqual([]);
  });

  it('a Beast the OPPONENT controls never takes the aura (ownCompanions scope survives the gate)', () => {
    seed({ b2: mkConstruct('lgs', 'The Long Green Silence', 3,
             { subtype: 'Incantation', cls: 'Druid', keywords: ['Untamed'] }) },
         { f1: ent('their-boar', 'Bristlemane Boar') });
    expect(isUntamedEncounter(g())).toBe(true);
    // Their Boar still gets its OWN +1 (it carries the keyword and the clause is
    // self-scoped), but not the +2 from an aura it does not control.
    expect(effectiveAttack(at('their-boar'), g()),
      'base 1 + its own +1, no foreign aura').toBe(2);
  });
});

// ─── 3. The declaration snapshot (the mid-combat flip edge) ───────────────────
describe('mid-combat flip — RATIFIED 2026-08-23: the declaration snapshot governs', () => {
  // DIAGNOSED, not assumed. A flip path DOES exist: The Final Word (dd000021) fires on
  // oppCompanionAttacks and forcedSacrifice's chokepoint canBeSacrificed admits any
  // non-PC permanent — a Physical Construct, or a Gear-bearing companion that takes its
  // Gear to the Dead Zone with it — and the stack driver deliberately PAUSES so that
  // sacrifice resolves BEFORE the queued attack's damage step.
  //
  // It is nonetheless UNOBSERVABLE for all six cards, because every combat-relevant read
  // is already taken at or before declaration: commitAttack stamps AttackCtx.dmg and
  // AttackCtx.hitRun, and bindingGuardianIds is consulted only in the pre-declaration
  // legality gate. Untamed inherits R2 (declaration and damage are SEPARATE steps) for
  // free, exactly as every other stat and keyword does.
  //
  // FUTURE-ARC DEPENDENCY: this holds only while no keyword read moves after declaration.
  // An arc that adds a defender-side re-check at damage time must revisit this ruling.
  it('AttackCtx stamps attack and Hit & Run at declaration, so a flip cannot reach them', () => {
    seed({ f1: ent('lynx', 'Ashfen Lynx') },
         { f1: mkComp('def', 'Enemy A', { hp: 20, maxHp: 20 }) });
    expect(effectiveAttack(at('lynx'), g()), 'declared while Untamed: 3 + 2').toBe(5);

    gs.getState().beginAttack('lynx');
    gs.getState().resolveAttack('def');

    expect(g().p2.board.f1!.hp, '20 − 5: the stamped value, not a re-read').toBe(15);
    expect(at('lynx').statuses, 'Hit & Run was stamped from the same snapshot')
      .toContain(HIT_RUN_STATUS);
  });

  it('a flip BETWEEN declarations is honoured — the next attack reads the new state', () => {
    seed({ f1: ent('lynx', 'Ashfen Lynx') },
         { f1: mkComp('def', 'Enemy A', { hp: 20, maxHp: 20 }),
           f2: mkConstruct('trap', 'Tripwire Snare', 3, { subtype: 'Trap' }) });
    expect(effectiveAttack(at('lynx'), g()), 'suppressed at declaration: base 3').toBe(3);

    gs.getState().beginAttack('lynx');
    gs.getState().resolveAttack('def');
    expect(g().p2.board.f1!.hp, '20 − 3').toBe(17);
  });
});

// ─── 4. dd000066 Elder Shellback — the matrix ─────────────────────────────────
describe('Elder Shellback — entry snapshot + the counter-placing op', () => {
  const shellback = () => sw('Elder Shellback');
  /** The Shellback's own entity, wherever it landed. */
  const sb = () => g().p1.board.b1!;

  it('its authored keywords are CORRECT as printed — Untamed is NOT among them', () => {
    // Owner ruling 2026-08-23 (keyword-independence). Pinned because the alternative
    // reading would have required a card-face change, which is not an engineering fix.
    expect(shellback().keywords).toEqual(['Guardian', 'Oathsworn']);
    expect(shellback().text).toContain('if it is Untamed');
  });

  it('enters on a CLEAR encounter → one armor counter on each Beast companion you control', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar'), f2: ent('fox', 'Mistfur Fox') });
    place(shellback(), 'b1');

    expect(at('boar').armorCounters, 'own Beast').toBe(1);
    expect(at('fox').armorCounters, 'own Beast').toBe(1);
    expect(sb().armorCounters,
      'the Shellback is itself a Beast companion you control').toBe(1);
  });

  it('never reaches opposing Beasts, nor your own NON-Beasts (Arc B negatives, reused)', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar'),
           f2: mkComp('human', 'Ally Human', { subtype: 'Human Scout' }) },
         { f1: ent('their-boar', 'Bristlemane Boar') });
    place(shellback(), 'b1');

    expect(at('boar').armorCounters, 'own Beast').toBe(1);
    expect(at('human').armorCounters ?? 0, 'own NON-Beast is untouched').toBe(0);
    expect(at('their-boar').armorCounters ?? 0, "the opponent's Beast is untouched").toBe(0);
    expect(g().p1.board.b3!.armorCounters ?? 0, 'your PC is not a Beast companion').toBe(0);
  });

  it('enters WITH Gear present → nothing, and clearing later places nothing (no retroactive fire)', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') },
         { f1: mkComp('them', 'Enemy A', wearing(gear('g-theirs'))) });
    place(shellback(), 'b1');
    expect(at('boar').armorCounters ?? 0, 'the intervening-if refused at entry').toBe(0);

    // Clear the encounter AFTER the fact. The snapshot was taken and is gone.
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: {
      ...s.game.p2.board, f1: mkComp('them', 'Enemy A') } } } }));
    expect(isUntamedEncounter(g()), 'the encounter is clear now').toBe(true);
    expect(at('boar').armorCounters ?? 0,
      'but nothing fires retroactively — read ONCE, at entry').toBe(0);
    expect(sb().armorCounters ?? 0, 'not even on itself').toBe(0);
  });

  it('a refused entry fizzles LOUDLY, never silently (R4 / no-silent-outcomes)', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') },
         { f1: mkComp('them', 'Enemy A', wearing(gear('g-theirs'))) });
    place(shellback(), 'b1');
    const said = gs.getState().toasts.map(t => t.msg).join(' || ');
    expect(said, 'the player is told the condition failed').toMatch(/condition is not met/i);
  });

  it('placed counters PERSIST through a later flip, and STILL prevent (counters are counters)', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    place(shellback(), 'b1');
    expect(at('boar').armorCounters).toBe(1);

    // Gear enters afterwards. Untamed gates NOTHING post-placement.
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: {
      ...s.game.p2.board, f1: mkComp('them', 'Enemy A', wearing(gear('g-late'))) } } } }));
    expect(isUntamedEncounter(g()), 'suppressed now').toBe(false);
    expect(at('boar').armorCounters, 'the counter is untouched').toBe(1);

    // And it is REAL prevention — the universal counter rule, reused not rebuilt.
    const cands = armorCandidatesOf(at('boar'));
    expect(cands.length, 'the counter registers as an armor source').toBe(1);
    expect(cands[0].counters).toBe(1);
  });

  it('effect-placed counters ADD to printed ones — one counter pool per entity', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar', { armorCounters: 2, armorStart: 2 }) });
    place(shellback(), 'b1');
    expect(at('boar').armorCounters, '2 printed + 1 placed').toBe(3);
    expect(at('boar').armorStart,
      'armorStart records the PRINTED X and is not rewritten').toBe(2);
  });

  it("the Shellback's own Guardian and Oathsworn are untouched either way", () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    place(shellback(), 'b1');
    expect(effectiveKeywords(sb(), g()),
      'printed Guardian survives the arc').toContain('Guardian');
    expect(sb().keywords,
      'Oathsworn stays printed — family E, NOT cleared here').toContain('Oathsworn');
  });

  it('with no OTHER eligible Beast it still armors itself (the enumeration reads the LIVE board)', () => {
    seed({ f1: mkComp('human', 'Ally Human', { subtype: 'Human Scout' }) });
    place(shellback(), 'b1');
    expect(sb().armorCounters, 'the enterer is in its own scope').toBe(1);
    expect(at('human').armorCounters ?? 0).toBe(0);
  });
});

// ─── 5. Discipline: nothing serializes, nothing else was gated ────────────────
describe('serialization + contract discipline', () => {
  it('no Untamed key enters GameState — the state is derived on every read', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    const before = JSON.stringify(g());
    expect(isUntamedEncounter(g())).toBe(true);
    effectiveAttack(at('boar'), g());
    effectiveKeywords(at('boar'), g());
    expect(JSON.stringify(g()), 'reading the predicate mutates nothing').toBe(before);

    // A KEY named for the state is what the rule forbids — printed card TEXT saying
    // "UNTAMED: …" is data and must survive. Walk the keys, not the substring.
    const keys = new Set<string>();
    (function walk(v: unknown): void {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') {
        for (const [k, sub] of Object.entries(v)) { keys.add(k); walk(sub); }
      }
    })(g());
    expect([...keys].filter(k => /untamed/i.test(k)),
      'no serialized key carries the state — it is derived on every read').toEqual([]);
  });

  it('the live carriers add no key to their entities either (fixture-hash discipline)', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') });
    const e = g().p1.board.f1!;
    expect(Object.prototype.hasOwnProperty.call(e, 'armorCounters'),
      'absent until an effect places one').toBe(false);
    expect(e.buffs ?? null, 'a while-static is never stamped as a buff entry').toBeFalsy();
  });

  it('ONLY buff and grantKeywords honour a static `if` — anything else must fail loudly here', () => {
    // Arc C gated the two static derive-on-read paths (staticBuffsOf, auraGrantedKeywords).
    // Four other static readers exist — magicDamageBonus, preventAnchorDecay, lineWard,
    // backLineAttack — and they do NOT consult `if`. No card authors that combination
    // today; this guard fails the day one does, instead of silently ignoring the gate.
    // Detection over enumeration (the enterUnitsOf idiom).
    const GATED_OPS = new Set(['buff', 'grantKeywords']);
    const offenders: string[] = [];
    for (const c of CATALOG) {
      for (const ce of c.effects ?? []) {
        if (ce.trigger !== 'static' || !ce.if) continue;
        for (const e of ce.effects) if (!GATED_OPS.has(e.op)) offenders.push(`${c.name}:${e.op}`);
      }
    }
    expect(offenders, 'extend the static `if` gate before shipping these').toEqual([]);
  });

  it('the arc cleared exactly its six cards, and left the other seven flagged', () => {
    const ARC_C = ['dd000051', 'dd000054', 'dd000061', 'dd000065', 'dd000066', 'dd000071'];
    for (const id of ARC_C) {
      const c = SWORN_WILD_DEV_CARDS.find(x => x.id === id)!;
      expect(c.effectsFlag, `${id} ${c.name} went live in Arc C`).toBeUndefined();
      expect(c.effects?.length, `${id} carries real effects`).toBeGreaterThan(0);
    }
    const flagged = SWORN_WILD_DEV_CARDS.filter(c =>
      c.effectsFlag?.startsWith('DEV NOT-IMPLEMENTED'));
    expect(flagged.map(c => c.id), 'the remaining arc debt, by card').toEqual(
      ['dd000058', 'dd000059', 'dd000073', 'dd000081', 'dd000089', 'dd000091', 'dd000098']);
  });
});
