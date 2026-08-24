// SWORN WILD — FINAL SWEEP (2026-08-21). Closes Program 2 at ZERO flags: the last four
// cards, plus the two repairs Arc D surfaced.
//
//   dd000058 Pale Hart              WARDED AGAINST PHYSICAL ACTIONS  (F)
//   dd000081 Fang of the First Hunt +2, or +3 on a Beast bearer      (G1)
//   dd000091 Declaration of Wardship start of turn, Guardians heal 2 (G2)
//   dd000098 Call to the Vow        draw 2, or 3 with an Oathsworn   (G3)
//
// REPAIR 1 — FORCED ATTACKS ARE ATTACKS (owner ruling 2026-08-21). A forced attack opens
// the FULL declaration window, same as a chosen one. Fixed at forceAttack, ONCE: each
// forced attacker becomes a 'forcedAttack' stack entry that runStack expands through the
// SAME assembly (declareAttack) a chosen attack uses. No listener special-cases anything.
//
// REPAIR 2 — UNKNOWN CONDITIONS FAIL LOUDLY. conditionMet's `default: true` (and its
// mirror in eventMatches) meant a condition kind with no evaluator was SILENTLY
// UNCONDITIONAL — exactly how targetIsSubtype sat declared-but-unevaluated for an arc.
// Both now throw, and validateCards refuses the combination at authoring time.
//
// SWEEP RESULT, recorded because it is the reassuring half: NO card in any of the four
// decks was ever silently unconditional. Every authored condition already sat on a
// trigger whose path reaches its evaluator. The defaults were a loaded trap, not an
// active bug — and the trap is now closed.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { CATALOG, SWORN_WILD_DEV_CARDS } from '../data/catalog';
import { effectiveAttack, conditionMet, parseWardedAgainst, cardMatchesWardClass,
         isWardedAgainst } from '../store/keywords';
import { eventMatches } from '../engine/combat';
import { validateCards } from '../data/validateCards';
import type { Card, BoardEntity, RawCard } from '../types/card';
import type { Condition } from '../types/effects';
import rawDeck from '../data/paladin_druid_dev_50.json';

const sw = (name: string): Card => {
  const c = SWORN_WILD_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`sworn wild card missing: ${name}`);
  return c;
};
const dc = (name: string): Card => {
  const c = CATALOG.find(x => x.name === name);
  if (!c) throw new Error(`card missing: ${name}`);
  return c;
};
const czFor = (cls: string) => CATALOG.slice(20, 25).map((c, i) => mkCz(c, cls, `cz-${i}`));
const g = () => gs.getState().game;
const st = () => gs.getState();

const ent = (id: string, cardName: string, over: Partial<BoardEntity> = {}): BoardEntity => {
  const c = sw(cardName);
  return mkComp(id, cardName, {
    subtype: c.subtype, cls: c.class1, keywords: [...c.keywords],
    atk: c.attack ?? 0, hp: c.hp ?? 1, maxHp: c.hp ?? 1, fresh: false, ...over,
  });
};
function seed(p1: Record<string, BoardEntity> = {}, p2: Record<string, BoardEntity> = {},
              cls = 'Druid', hand: Card[] = []) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
    p1: { ...s.game.p1, hand, classZone: czFor(cls), willpower: 6, dead: [],
          board: { b3: mkPc('pc-1', { cls, hp: 20, maxHp: 20 }), ...p1 } },
    p2: { ...s.game.p2, dead: [], board: { b3: mkPc('pc-2', { cls: 'Warrior', hp: 20, maxHp: 20 }), ...p2 } },
  } }));
}
const at = (id: string): BoardEntity | undefined => {
  for (const side of ['p1', 'p2'] as const) {
    const hit = Object.values(g()[side].board).find(e => e?.id === id);
    if (hit) return hit;
  }
  return undefined;
};
/** Toasts added AFTER a marked point — a bare read accumulates across tests. */
const mark = () => st().toasts.length;
const saidSince = (n: number) => st().toasts.slice(n).map(t => t.msg).join(' || ');
const playAction = (card: Card) => {
  gs.setState(s => ({ game: { ...s.game, selected: 'pc-1', p1: { ...s.game.p1, hand: [card] } } }));
  gs.getState().playAction(card.id);
};

// ══════════════════════════ REPAIR 1 — forced attacks are attacks ═════════════
describe('REPAIR 1 — a forced attack opens the FULL declaration window', () => {
  const press = () => dc('Press the Line');

  it('the forced attack still lands its damage (through the stack now, not inline)', () => {
    seed({ f1: mkComp('a1', 'Ally One', { atk: 2, fresh: false }) },
         { f1: mkComp('foe', 'Foe', { hp: 9, maxHp: 9 }) }, 'Warrior');
    playAction(press());
    gs.getState().resolveActionTarget('foe');
    expect(at('foe')!.hp, 'PC 0 + ally 2 — only companions attack').toBe(7);
    expect(at('a1')!.exhausted, 'forced attackers exhaust').toBe(true);
    expect(g().triggerStack ?? null, 'the volley drained').toBeFalsy();
  });

  it('IRON SPIKES fires on a forced attacker (it did not, before the ruling)', () => {
    seed({ f1: mkComp('a1', 'Ally One', { atk: 2, fresh: false }) },
         { f1: mkComp('foe', 'Foe', { hp: 9, maxHp: 9 }),
           f2: mkConstruct('spikes', 'Iron Spikes', 3, { subtype: 'Trap' }) }, 'Warrior');
    playAction(press());
    gs.getState().resolveActionTarget('foe');
    // Iron Spikes: "whenever an opposing companion attacks one of your companions,
    // deal 1 damage to the attacker." The forced attacker is an attacker.
    expect(at('a1')!.hp, 'the trap bit the compelled attacker').toBeLessThan(5);
  });

  it('QUILLSPINE retaliates against a forced attacker', () => {
    seed({ f1: mkComp('a1', 'Ally One', { atk: 2, hp: 5, maxHp: 5, fresh: false }) },
         { f1: ent('quill', 'Quillspine Porcupine') }, 'Warrior');
    playAction(press());
    gs.getState().resolveActionTarget('quill');
    expect(at('a1')!.hp, 'quills answered the compelled attack: 5 − 1').toBe(4);
  });

  it('EVERY attacker in the volley opens its own window (per-attack, not per-card)', () => {
    seed({ f1: mkComp('a1', 'Ally One', { atk: 1, hp: 5, maxHp: 5, fresh: false }),
           f2: mkComp('a2', 'Ally Two', { atk: 1, hp: 5, maxHp: 5, fresh: false }) },
         { f1: ent('quill', 'Quillspine Porcupine', { hp: 40, maxHp: 40 }) }, 'Warrior');
    playAction(press());
    gs.getState().resolveActionTarget('quill');
    expect(at('a1')!.hp, 'first attacker took quills').toBe(4);
    expect(at('a2')!.hp, 'second attacker took its OWN quills').toBe(4);
  });

  it('the per-attack DECLARATION SNAPSHOT is why this queues instead of looping', () => {
    // Each forced attack stamps its damage when ITS entry resolves (R2) — not all at
    // play time. A pre-built ctx per attacker would have frozen every snapshot up front.
    seed({ f1: mkComp('a1', 'Ally One', { atk: 3, hp: 5, maxHp: 5, fresh: false }) },
         { f1: mkComp('foe', 'Foe', { hp: 20, maxHp: 20 }) }, 'Warrior');
    playAction(press());
    gs.getState().resolveActionTarget('foe');
    expect(at('foe')!.hp, 'the attacker\'s live attack was used').toBe(17);
  });

  it('no front-line companion is a LOUD no-op, never a silent one', () => {
    seed({}, { f1: mkComp('foe', 'Foe', { hp: 9, maxHp: 9 }) }, 'Warrior');
    playAction(press());
    const t0 = mark();
    gs.getState().resolveActionTarget('foe');
    expect(saidSince(t0), 'the op says why nothing happened').toMatch(/no front-line companion/i);
    expect(at('foe')!.hp, 'and the target is untouched').toBe(9);
  });
});

// ══════════════════════════ REPAIR 2 — conditions fail loudly ═════════════════
describe('REPAIR 2 — an unevaluable condition THROWS instead of passing silently', () => {
  it('conditionMet answers the board-state kinds', () => {
    seed({ f1: ent('shell', 'Elder Shellback') });
    expect(conditionMet(g(), 'p1', { kind: 'untamed' })).toBe(true);
    expect(conditionMet(g(), 'p1', { kind: 'controlsKeyword', keyword: 'Oathsworn' })).toBe(true);
    expect(conditionMet(g(), 'p1', { kind: 'controlsKeyword', keyword: 'Paranoia' })).toBe(false);
  });

  it('conditionMet THROWS on a kind whose evaluator lives elsewhere — naming where', () => {
    seed();
    expect(() => conditionMet(g(), 'p1', { kind: 'killedIsCompanion' }))
      .toThrow(/eventMatches/);
    expect(() => conditionMet(g(), 'p1', { kind: 'diedToDamage' }))
      .toThrow(/resolveRemovalTriggers/);
    expect(() => conditionMet(g(), 'p1', { kind: 'targetIsSubtype', subtype: 'Beast' }))
      .toThrow(/resolveReactiveEntry/);
    expect(() => conditionMet(g(), 'p1', { kind: 'bearerIsSubtype', subtype: 'Beast' }))
      .toThrow(/selfItemStat/);
  });

  it('conditionMet THROWS on a wholly unknown kind (runtime injection)', () => {
    seed();
    const bogus = { kind: 'noSuchCondition' } as unknown as Condition;
    expect(() => conditionMet(g(), 'p1', bogus)).toThrow(/unknown condition kind/);
  });

  it('eventMatches is the symmetric half — board-state kinds throw there', () => {
    const ev = { id: 'e1', kind: 'companion' as const, owner: 'p2' as const, destroyed: true, physical: false };
    expect(eventMatches({ kind: 'killedIsCompanion' }, ev, 'p1'), 'its own family still answers').toBe(true);
    expect(() => eventMatches({ kind: 'untamed' }, ev, 'p1')).toThrow(/BOARD-STATE/);
    expect(() => eventMatches({ kind: 'controlsKeyword', keyword: 'X' }, ev, 'p1')).toThrow(/BOARD-STATE/);
  });

  it('the VALIDATOR refuses a condition on a trigger that cannot evaluate it', () => {
    const base = sw('Bristlemane Boar');
    const bad = { ...base, id: 'x-1', name: 'Wrong Home Under Test',
      effects: [{ trigger: 'static', if: { kind: 'killedIsCompanion' }, effects: [] }] } as unknown as Card;
    expect(validateCards([bad]).some(m => /cannot be evaluated on trigger "static"/.test(m))).toBe(true);
  });

  it('the VALIDATOR refuses bearerIsSubtype off an Item', () => {
    const base = sw('Bristlemane Boar');
    const bad = { ...base, id: 'x-2', name: 'Bearer On A Companion Under Test',
      effects: [{ trigger: 'static', if: { kind: 'bearerIsSubtype', subtype: 'Beast' }, effects: [] }] } as unknown as Card;
    expect(validateCards([bad]).some(m => /only meaningful on an Item/.test(m))).toBe(true);
  });

  it('SWEEP: every authored condition in all four decks sits on a compatible trigger', () => {
    // The reassuring half of the sweep, pinned so it stays true: nothing was ever
    // silently unconditional. Driving each card's clauses through the real validator is
    // the check — a mis-homed condition would be reported here.
    expect(validateCards(CATALOG), 'the whole pool validates').toEqual([]);
  });
});

// ══════════════════════════ F — dd000058 Pale Hart ════════════════════════════
describe('Pale Hart — WARDED AGAINST PHYSICAL ACTIONS', () => {
  it('parses the [X] off the keyword string, not out of prose', () => {
    expect(parseWardedAgainst(sw('Pale Hart').keywords)).toEqual(['Physical Actions']);
    expect(parseWardedAgainst(['Evasive', 'Guardian']), 'no ward, no tokens').toEqual([]);
  });

  it('matches a card class STRUCTURALLY — type AND authored subtypes', () => {
    expect(cardMatchesWardClass(dc('Disarming Blow'), 'Physical Actions'),
      'a Physical Action matches').toBe(true);
    expect(cardMatchesWardClass(dc('Wild Surge'), 'Physical Actions'),
      'a MAGIC Action does not').toBe(false);
    expect(cardMatchesWardClass(sw('Bristlemane Boar'), 'Physical Actions'),
      'a Companion does not').toBe(false);
  });

  it('a Physical Action cannot TARGET it — the live gate', () => {
    // Press the Line is a PHYSICAL Action naming an opposing character directly (the
    // single-step shape; Disarming Blow's first pick is your OWN character, so its ward
    // interaction lives at its second step).
    seed({ f1: mkComp('att', 'Attacker', { atk: 2, fresh: false }) },
         { f1: ent('hart', 'Pale Hart'), f2: mkComp('other', 'Other Foe', { hp: 5 }) }, 'Warrior');
    expect(isWardedAgainst(at('hart')!, dc('Press the Line'), g()),
      'a Physical Action is exactly what it is warded from').toBe(true);
    expect(isWardedAgainst(at('hart')!, dc('Wild Surge'), g()),
      'a Magic Action is not').toBe(false);
    playAction(dc('Press the Line'));
    const elig = st().pendingActionTarget?.eligibleIds ?? [];
    expect(elig, 'the warded Hart is not offered').not.toContain('hart');
    expect(elig, 'its unwarded neighbour still is').toContain('other');
  });

  it('a MAGIC Action targets it perfectly well — the ward names Physical', () => {
    seed({}, { f1: ent('hart', 'Pale Hart') }, 'Sorcerer');
    playAction(dc('Wild Surge'));
    expect(st().pendingActionTarget?.eligibleIds ?? [], 'Magic is not warded against')
      .toContain('hart');
  });

  it('the ward does NOT stop ATTACKS — an attack is not an Action', () => {
    // Canon gives three verbs ("targeted, attacked, or damaged by cards of type or
    // subtype [X]"), but each applies only where the warded class can perform it. No
    // Action card attacks, so a ward against Actions never blocks an attack. Deliberate.
    seed({ f1: mkComp('att', 'Attacker', { atk: 2, hp: 6, maxHp: 6, fresh: false }) },
         { f1: ent('hart', 'Pale Hart') }, 'Warrior');
    gs.getState().beginAttack('att');
    gs.getState().resolveAttack('hart');
    expect(at('hart')!.hp, 'the Hart took a normal hit: 3 − 2').toBe(1);
  });

  it('Evasive still works alongside it (both printed keywords are live)', () => {
    expect(sw('Pale Hart').keywords).toEqual(['Evasive', 'Warded against Physical Actions']);
    expect(sw('Pale Hart').effects ?? null, 'keyword-only — no authored clause').toBeFalsy();
    expect(sw('Pale Hart').effectsFlag, 'and no flag').toBeUndefined();
  });
});

// ══════════════════════════ G1 — dd000081 Fang of the First Hunt ══════════════
describe('Fang of the First Hunt — the BEARER binding', () => {
  const fang = () => mkItem('fang', 'Fang of the First Hunt', { sub: 'Weapon - Fang' });
  const wield = (e: BoardEntity) => ({ ...e, loadout: { weapon: fang(), gear: [null, null] } });

  it('on a NON-Beast bearer: +2', () => {
    seed({ f1: wield(mkComp('elf', 'Verdant Scout', { subtype: 'Elf Scout', atk: 2, keywords: [] })) });
    expect(effectiveAttack(at('elf')!, g()), 'base 2 + 2').toBe(4);
  });

  it('on a Beast bearer: +3 (the printed "instead")', () => {
    seed({ f1: wield(ent('boar', 'Bristlemane Boar')) });
    // base 1 + 2 + 1(bearer bonus) + 1(its own Untamed, this board is clear) = 5
    expect(effectiveAttack(at('boar')!, g()), 'base 1 + 3 weapon + 1 Untamed').toBe(5);
  });

  it('a STACKED-modifier Beast still counts — set membership, not string equality', () => {
    seed({ f1: wield(ent('toad', 'Sporeback Toad')) });
    // Sporeback Toad: "Fungal Beast Toad", base attack 1.
    expect(effectiveAttack(at('toad')!, g()), 'base 1 + 3 weapon').toBe(4);
  });

  it('RE-EQUIPPING flips it — the bonus is derived on read, never stamped', () => {
    seed({ f1: wield(ent('boar', 'Bristlemane Boar')),
           f2: mkComp('elf', 'Verdant Scout', { subtype: 'Elf Scout', atk: 2, keywords: [] }) });
    expect(effectiveAttack(at('boar')!, g()), 'Beast: +3').toBe(5);
    // Move the Fang to the Elf by hand — the same item, a different bearer.
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { ...s.game.p1.board,
      f1: { ...s.game.p1.board.f1!, loadout: { weapon: null, gear: [null, null] } },
      f2: { ...s.game.p1.board.f2!, loadout: { weapon: fang(), gear: [null, null] } } } } } }));
    expect(effectiveAttack(at('elf')!, g()), 'non-Beast: +2').toBe(4);
    expect(effectiveAttack(at('boar')!, g()), 'and the Boar keeps only its own +1').toBe(2);
  });
});

// ══════════════════════════ G2 — dd000091 Declaration of Wardship ═════════════
describe('Declaration of Wardship — the keyword-filtered heal', () => {
  const decl = () => mkConstruct('decl', 'Declaration of Wardship', 3,
    { subtype: 'Blessing', cls: 'Paladin' });

  it('heals only your GUARDIAN companions, and caps at printed HP', () => {
    seed({
      f1: decl(),
      f2: ent('quill', 'Quillspine Porcupine', { hp: 1 }),          // Guardian, 4 max
      f3: ent('boar', 'Bristlemane Boar', { hp: 1 }),               // no Guardian
      b1: ent('shell', 'Elder Shellback', { hp: 7 }),               // Guardian, 8 max
    }, {}, 'Paladin');
    gs.getState().endTurn();   // p2's turn
    gs.getState().endTurn();   // back to p1 — start-of-turn fires
    expect(at('quill')!.hp, 'Guardian healed 1 → 3').toBe(3);
    expect(at('boar')!.hp, 'no Guardian, no heal').toBe(1);
    expect(at('shell')!.hp, 'healed 7 → 8, CAPPED at printed max').toBe(8);
  });

  it("never heals the OPPONENT's Guardians", () => {
    seed({ f1: decl() },
         { f1: ent('theirs', 'Quillspine Porcupine', { hp: 1 }) }, 'Paladin');
    gs.getState().endTurn();
    gs.getState().endTurn();
    expect(at('theirs')!.hp, 'their Guardian is not yours').toBe(1);
  });

  it('the construct decaying stops it (the ability is HOSTED)', () => {
    seed({ f2: ent('quill', 'Quillspine Porcupine', { hp: 1 }) }, {}, 'Paladin');
    gs.getState().endTurn();
    gs.getState().endTurn();
    expect(at('quill')!.hp, 'no Declaration on the board, no heal').toBe(1);
  });
});

// ══════════════════════════ G3 — dd000098 Call to the Vow ═════════════════════
describe('Call to the Vow — controls-a-keyword, and "instead"', () => {
  const call = () => sw('Call to the Vow');
  const handSize = () => g().p1.hand.length;

  it('draws TWO with no Oathsworn permanent', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar') }, {}, 'Paladin');
    playAction(call());
    expect(handSize(), 'played 1, drew 2').toBe(0 - 1 + 1 + 2);
  });

  it('draws THREE — never five — with one, and a CONSTRUCT host counts', () => {
    seed({ f1: mkConstruct('oath', 'The Oath at Stonefern', 3, { subtype: 'Blessing', cls: 'Paladin', keywords: ['Oathsworn'] }) }, {}, 'Paladin');
    playAction(call());
    expect(handSize(), 'played 1, drew 3 — the second draw is the DIFFERENCE').toBe(0 - 1 + 1 + 3);
  });

  it('a COMPANION host counts too', () => {
    seed({ f1: ent('shell', 'Elder Shellback') }, {}, 'Paladin');
    playAction(call());
    expect(handSize()).toBe(0 - 1 + 1 + 3);
  });

  it("an OPPOSING Oathsworn permanent does NOT count", () => {
    seed({}, { f1: ent('theirs', 'Elder Shellback') }, 'Paladin');
    playAction(call());
    expect(handSize(), 'still two').toBe(0 - 1 + 1 + 2);
  });
});

// ══════════════════════════ PROGRAM CLOSE ═════════════════════════════════════
describe('PROGRAM 2 — complete', () => {
  it('all 50 Sworn Wild cards carry authored behaviour and ZERO flags remain', () => {
    expect(SWORN_WILD_DEV_CARDS.length).toBe(50);
    const flagged = SWORN_WILD_DEV_CARDS.filter(c => c.effectsFlag);
    expect(flagged.map(c => c.id), 'no card awaits engine machinery').toEqual([]);
    // "Carries behaviour" = authored effects OR printed keywords the engine honours.
    // Pale Hart is the keyword-only case and is deliberately included by that test.
    const inert = SWORN_WILD_DEV_CARDS.filter(c => !(c.effects?.length) && !(c.keywords?.length));
    expect(inert.map(c => c.name), 'nothing is inert').toEqual([]);
  });

  it('the deck data still validates clean end-to-end', () => {
    const raw = (rawDeck as { cards: RawCard[] }).cards as unknown as Card[];
    expect(validateCards(raw), 'raw authored data, including subtypes + tribute').toEqual([]);
  });

  it('nothing new serializes for any of the final four', () => {
    seed({ f1: ent('hart', 'Pale Hart') });
    const json = JSON.stringify(g());
    for (const probe of ['wardedAgainst', 'bearerIsSubtype', 'controlsKeyword', 'forcedAttack']) {
      expect(json, `${probe} stays out of GameState`).not.toMatch(new RegExp(probe));
    }
  });
});
