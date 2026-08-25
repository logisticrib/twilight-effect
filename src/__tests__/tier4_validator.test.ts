// Tier 4 item 2 (test_seed_plan.md) — the deck-JSON data contract. validateCards is a
// reusable function (src/data/validateCards.ts) so it can later gate the card-generation
// pipeline (mint-gate); this test keeps the CURRENT decks inside the contract and proves
// the validator actually catches each class of authoring mistake.
import { describe, it, expect } from 'vitest';
import { validateCards } from '../data/validateCards';
import { CATALOG, SHIPPED_CATALOG, DW_ROGUE_DEV_CARDS, SWORN_WILD_DEV_CARDS, REQUIEM_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';

const base = CATALOG[0];
const clone = (over: Record<string, unknown>): Card => ({ ...base, id: 'clone-1', name: 'Clone Under Test', ...over } as unknown as Card);

describe('data contract: the shipped decks validate clean', () => {
  // The prose-completeness sweep (2026-07-08) exposed 11 authoring gaps; the owner
  // triaged all of them same-day: Bastion Wall / Watchtower / Pyre of the Unbound were
  // AUTHORED (grantKeywords aura, backLineAttack, startOfTurn modal), the other eight
  // carry dated owner-approved effectsFlags ("awaiting engine capability: …"). The
  // decks are therefore fully clean again — a NEW gap of either kind fails here.
  it('validateCards(CATALOG) reports zero problems (all former gaps authored or owner-flagged)', () => {
    expect(validateCards(CATALOG)).toEqual([]);
  });
  // 2026-07-12 (trap reactive-trigger arc): Tripwire Snare / Pit Trap / Iron Spikes
  // were AUTHORED against the new trigger stack and dropped their flags — eight
  // deferred gaps became five. 2026-07-14 (damage-prevention arc): Reflecting Pool
  // authored — five became four. 2026-07-15 (restriction-aura arc): Crystalline
  // Sentinel + Reinforced Gate — four became two. 2026-07-15 (on-play arc):
  // Patient Conjurer — two became one. 2026-07-15 (on-sacrifice arc): Siegeworks —
  // the capability program is CLOSED: zero flags. This pin now guards the
  // convention itself: any future effectsFlag must be a deliberate, owner-dated
  // deferral that updates this list by name.
  // RETIRED + REWRITTEN dated 2026-07-22 (dev-deck program): the SHIPPED-pool
  // assertion is unchanged — zero shipped flags, capability program stays closed.
  // The owner-authored DEV deck (dw_rogue_dev_50, every card dev:true, NON-CANON)
  // is the sanctioned exception: its flags are visible machinery debt, and every
  // one must start "DEV " ("DEV NOT-IMPLEMENTED …" = debt for a named arc;
  // "DEV reminder-only …" = prose fully carried by the printed keyword).
  it('ZERO deferred gaps remain on SHIPPED cards (capability program closed 2026-07-15; dev-deck carve-out 2026-07-22)', () => {
    expect(CATALOG.filter(c => !c.dev && c.effectsFlag).map(c => c.name)).toEqual([]);
  });

  it('dev-card effectsFlags follow the DEV convention (visible debt, never silent)', () => {
    const badDevFlags = CATALOG.filter(c => c.dev && c.effectsFlag && !c.effectsFlag.startsWith('DEV '));
    expect(badDevFlags.map(c => c.name)).toEqual([]);
  });

  // RETIRED + REWRITTEN 2026-08-19: this pinned "exactly the dw_rogue_dev_50 deck" and
  // the literal 50 in two places. A SECOND dev deck landed (paladin_druid_dev_50, "Sworn
  // Wild"), so the pin now spans both decks and DERIVES the count rather than repeating
  // a magic number that has to be edited in lockstep with the data.
  // A THIRD dev deck landed 2026-08-25 (bard_necromancer_dev_50, "Requiem") — the pin
  // spans all three the same way it grew to span two.
  it('dev cards are flagged dev:true across ALL dev decks, and SHIPPED_CATALOG excludes them', () => {
    const devDecks = [...DW_ROGUE_DEV_CARDS, ...SWORN_WILD_DEV_CARDS, ...REQUIEM_DEV_CARDS];
    expect(devDecks.length, 'three 50-card dev decks').toBe(150);
    expect(devDecks.every(c => c.dev === true), 'every dev card carries dev:true').toBe(true);
    expect(CATALOG.filter(c => c.dev).length, 'CATALOG carries exactly those').toBe(devDecks.length);
    expect(SHIPPED_CATALOG.length).toBe(CATALOG.length - devDecks.length);
    expect(SHIPPED_CATALOG.some(c => c.dev)).toBe(false);
  });
});

describe('the validator catches each class of authoring mistake (mint-gate behavior)', () => {
  const expectCaught = (card: Card, why: string) => {
    const problems = validateCards([card]);
    expect(problems.length, `${why} — must be caught`).toBeGreaterThan(0);
    expect(problems.join(' | '), 'problem names the card').toContain('Clone Under Test');
  };

  it('unknown effect op', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'obliterate', target: 'anyCharacter' }] }] }), 'typo op');
  });

  it('unknown trigger', () => {
    expectCaught(clone({ effects: [{ trigger: 'onSummon', effects: [] }] }), 'typo trigger');
  });

  it('unknown TargetSpec', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'damage', amount: 1, target: 'enemyMinion' }] }] }), 'typo target');
  });

  it('bad Amount shape', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'damage', amount: { dice: 6 }, target: 'anyCharacter' }] }] }), 'unknown amount key');
  });

  it('nested branch validation (dieCheck)', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'dieCheck', threshold: 4, onPass: [{ op: 'zap', target: 'self' }], onFail: [] }] }] }), 'bad op inside a dieCheck branch');
  });

  it('preventDamage (2026-07-14): engine-supported scopes only; amount ≥ 1; where.cls non-empty', () => {
    expect(validateCards([clone({ effects: [{ trigger: 'static', effects: [{ op: 'preventDamage', amount: 1, scope: 'ownCompanions', where: { cls: 'Wizard' } }] }], text: '' })]), 'the Reflecting Pool shape validates').toEqual([]);
    expectCaught(clone({ effects: [{ trigger: 'static', effects: [{ op: 'preventDamage', amount: 0, scope: 'ownCompanions' }] }], text: '' }), 'amount must be ≥ 1');
    expectCaught(clone({ effects: [{ trigger: 'static', effects: [{ op: 'preventDamage', amount: 1, scope: 'allEnemies' }] }], text: '' }), 'unsupported scope (contract must not advertise unimplemented coverage)');
    expectCaught(clone({ effects: [{ trigger: 'static', effects: [{ op: 'preventDamage', amount: 1, scope: 'ownParty', where: { cls: '' } }] }], text: '' }), 'empty where.cls');
  });

  it('restriction auras (2026-07-15): engine-supported scope only; where.line / between domains', () => {
    expect(validateCards([clone({ effects: [{ trigger: 'static', effects: [{ op: 'restrictAttack', scope: 'oppCompanions', where: { line: 'back' } }] }], text: '' })]), 'the Sentinel shape validates').toEqual([]);
    expect(validateCards([clone({ effects: [{ trigger: 'static', effects: [{ op: 'restrictMove', scope: 'oppCompanions', between: 'lines' }] }], text: '' })]), 'the Gate shape validates').toEqual([]);
    expectCaught(clone({ effects: [{ trigger: 'static', effects: [{ op: 'restrictAttack', scope: 'ownCompanions' }] }], text: '' }), 'unsupported restrict scope (own side is never restricted)');
    expectCaught(clone({ effects: [{ trigger: 'static', effects: [{ op: 'restrictAttack', scope: 'oppCompanions', where: { line: 'middle' } }] }], text: '' }), 'bad where.line');
    expectCaught(clone({ effects: [{ trigger: 'static', effects: [{ op: 'restrictMove', scope: 'oppCompanions', between: 'zones' }] }], text: '' }), 'bad between');
  });

  it('activated ability without cost or oncePerTurn (§11 guard)', () => {
    expectCaught(clone({ effects: [{ trigger: 'activated', effects: [{ op: 'draw', count: 1 }] }] }), 'free repeatable activated');
  });

  it('bad Cost kind', () => {
    expectCaught(clone({ effects: [{ trigger: 'activated', cost: { kind: 'payMana', amount: 2 }, effects: [] }] }), 'unknown cost');
  });

  it('bad Condition kind', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'draw', count: 1, if: { kind: 'moonIsFull' } }] }] }), 'unknown condition');
  });

  it('unknown keyword (typo against the KEYWORDS registry)', () => {
    expectCaught(clone({ keywords: ['Cleeve'] }), 'typo keyword');
  });

  it("parameterized Bane — \"Goblin's Bane\" resolves to the Bane contract entry", () => {
    // text: '' — base (Ember Adept) carries a ZEALOUS reminder; swapping the declared
    // keyword away would (correctly) trip the prose-completeness check instead.
    expect(validateCards([clone({ keywords: ["Goblin's Bane"], text: '' })]), 'named Bane accepted').toEqual([]);
    expectCaught(clone({ keywords: ["Goblin's Banes"], text: '' }), 'malformed Bane suffix stays unknown');
  });

  it('bad per-type fields: Action cost domain, Item classification, Construct anchor, Companion hp, level range', () => {
    expectCaught(clone({ type: 'Action', actionPM: 'Huge' }), 'bad actionPM');
    expectCaught(clone({ type: 'Item', itemKind: '' }), 'unclassified item');
    expectCaught(clone({ type: 'Construct', anchor: 0 }), 'anchorless construct');
    expectCaught(clone({ type: 'Companion', attack: 2, hp: 0 }), '0-HP companion');
    expectCaught(clone({ level: 9 }), 'level out of range');
  });

  it('duplicate ids and names across a set', () => {
    const a = clone({ id: 'dup', name: 'Clone Under Test' });
    const b = clone({ id: 'dup', name: 'Clone Under Test' });
    const problems = validateCards([a, b]);
    expect(problems.some(x => x.includes('duplicate id')), 'duplicate id caught').toBe(true);
    expect(problems.some(x => x.includes('duplicate name')), 'duplicate name caught').toBe(true);
  });

  it('HARD BAN: any effect that increases max HP is rejected', () => {
    expectCaught(clone({ effects: [{ trigger: 'static',
      effects: [{ op: 'buff', stat: 'hp', amount: 1, scope: 'ownCompanions', duration: 'while' }] }] }), '+HP static aura');
    expectCaught(clone({ effects: [{ trigger: 'onPlay',
      effects: [{ op: 'buff', stat: 'hp', amount: 2, scope: 'ownParty', duration: 'endOfTurn' }] }] }), '+HP temp buff');
  });

  it('HARD BAN: any Initiative or Exile reference is rejected — broad sweep incl. name and flavor', () => {
    expectCaught(clone({ text: 'INITIATIVE. This character strikes first in combat.' }), 'Initiative in rules text');
    expectCaught(clone({ keywords: ['Initiative'] }), 'Initiative as a keyword');
    expectCaught(clone({ effects: [{ trigger: 'onPlay',
      effects: [{ op: 'buff', grant: ['Initiative'], scope: 'self', duration: 'endOfTurn' }] }] }), 'Initiative as a granted keyword');
    expectCaught(clone({ text: 'Exile the top card of your deck.' }), 'Exile in rules text');
    expectCaught(clone({ flavor: 'He returned from his long exile changed.' }), 'Exile in flavor (deliberately broad)');
    expectCaught(clone({ name: 'Clone Under Test, the Exiled' }), 'Exile in the card name (deliberately broad)');
  });
});

describe('mint-gate semantics: existing card names are a parameter', () => {
  it('a candidate whose name is already minted is rejected; repeated MECHANICS are fine', () => {
    const mintedNames = CATALOG.map(c => c.name);
    // Name collision with a previously minted card → rejected.
    const nameClash = { ...base, id: 'fresh-id-1' } as Card; // keeps base's minted name
    expect(validateCards([nameClash], mintedNames).join(' | '), 'minted name rejected')
      .toContain('already taken');
    // Identical mechanics under a NEW name → mintable.
    const retheme = { ...base, id: 'fresh-id-2', name: 'A Familiar Trick, Newly Named' } as Card;
    expect(validateCards([retheme], mintedNames), 'duplicate mechanics allowed').toEqual([]);
  });

  it('the keyword contract is injectable', () => {
    const candidate = clone({ keywords: ['Skyborne'], text: '' }); // see the Bane test note
    expect(validateCards([candidate]).join(' '), 'unknown vs the canonical registry').toContain('Skyborne');
    expect(validateCards([candidate], [], { Skyborne: true }), 'known under an extended contract').toEqual([]);
  });
});

// ─── Prose completeness (2026-07-08): text beyond keywords needs effects or a flag ──
describe('prose completeness: a prose-only card can never mint silently', () => {
  const noFx = (over: Record<string, unknown>): Card => {
    const c = { ...base, id: 'clone-1', name: 'Clone Under Test', ...over } as unknown as Card;
    delete (c as { effects?: unknown }).effects;
    return c;
  };
  const expectCaught = (card: Card, why: string) => {
    const problems = validateCards([card]);
    expect(problems.some(p => p.includes('prose-only:')), `${why} — must be caught`).toBe(true);
  };

  it('novel rules text with NO effects is rejected (the Pyre of the Unbound class)', () => {
    expectCaught(noFx({ keywords: [], text: 'At the start of your turn, you may sacrifice this construct: deal 4 damage to target character.' }),
      'unauthored prose');
  });

  it('an explicit owner-approved effectsFlag exempts the card', () => {
    expect(validateCards([noFx({ keywords: [],
      text: 'At the start of your turn, deal 4 damage to target character.',
      effectsFlag: 'owner-approved test exemption (representative of a dated ruling)' })])).toEqual([]);
  });

  it('un-parenthesized keyword REMINDER text is exempt (canon-containment against KEYWORD_DEFS)', () => {
    expect(validateCards([noFx({ keywords: ['Zealous'],
      text: 'ZEALOUS. This character may attack without needing to first pass a willpower check.' })])).toEqual([]);
    // RETIRED + REWRITTEN 2026-08-19: this pin previously quoted the PRE-INVERSION item
    // wording ("put an armor counter... when this item has 2"). It still passed on token
    // containment, which is exactly why it needed replacing rather than trusting -- a
    // pin that survives the canon it pins is not testing the canon.
    expect(validateCards([noFx({ keywords: ['Armor 2'], type: 'Item', itemKind: 'Armor',
      text: 'ARMOR 2. This item enters the encounter with 2 armor counters. If the equipped character would be dealt damage, prevent all of that damage and remove an armor counter from this item. When the last armor counter is removed, sacrifice this item.' })])).toEqual([]);
  });

  // ── Armor's two canonical wordings, keyed off host type (2026-08-19) ──────────
  // Master_Keyword_List §Item & Equipment Keywords defines ARMOR X twice: an ITEM
  // clause and a COMPANION variant. Before this, KEYWORD_DEFS carried only the item
  // clause, so every companion-armor card failed prose-completeness at 45% on its
  // third sentence — which would have blocked the first companion-armor cards
  // (Thornback Tortoise, Warden of Stonefern) on import day one.
  describe('Armor: item and companion variants both validate, on their own host type', () => {
    const ITEM_CLAUSE = 'ARMOR 2. This item enters the encounter with 2 armor counters. If the equipped character would be dealt damage, prevent all of that damage and remove an armor counter from this item. When the last armor counter is removed, sacrifice this item.';
    const COMPANION_CLAUSE = 'ARMOR 1. This companion enters the encounter with 1 armor counter. If this companion would be dealt damage, prevent all of that damage and remove an armor counter from this companion. When this companion has no armor counters, it no longer prevents damage via this ability.';

    it('an ITEM printing the item clause validates clean', () => {
      expect(validateCards([noFx({ name: 'Mailed Hauberk (pin)', keywords: ['Armor 2'],
        type: 'Item', itemKind: 'Armor', text: ITEM_CLAUSE })])).toEqual([]);
    });

    it('a COMPANION printing the companion clause validates clean', () => {
      expect(validateCards([noFx({ name: 'Thornback Tortoise (pin)', keywords: ['Armor 1'],
        type: 'Companion', text: COMPANION_CLAUSE })])).toEqual([]);
    });

    it('NEGATIVE: text matching NEITHER variant is still caught', () => {
      expectCaught(noFx({ name: 'Warden of Stonefern (bad pin)', keywords: ['Armor 1'], type: 'Companion',
        text: 'ARMOR 1. This companion enters the encounter with 1 armor counter. Whenever this companion blocks, draw a card and each opponent discards.' }),
        'a novel rider beyond either Armor wording');
    });
  });

  it('a declared keyword does NOT excuse a novel rider (the Patient Conjurer class)', () => {
    expectCaught(noFx({ keywords: ['Ranged'], text: 'RANGED. When you play a Magical Construct, this character heals 1.' }),
      'novel rider beyond the declared keyword');
  });

  it('cards WITH effects are outside this check (clause-completeness is human triage)', () => {
    expect(validateCards([{ ...noFx({ keywords: [], text: 'Deal 1 damage to target character. Draw a card.' }),
      effects: [{ trigger: 'onPlay', effects: [{ op: 'damage', amount: 1, target: 'anyCharacter' }] }] } as unknown as Card])).toEqual([]);
  });
});
