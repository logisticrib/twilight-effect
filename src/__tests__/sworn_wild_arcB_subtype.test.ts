// SWORN WILD — ARC B: Beast-subtype reach (2026-08-19/20).
//
// OWNER RULINGS: Beast is a PRINTED modifier subtype. The engine matches printed subtype
// data ONLY — never derives Beast from an organism, never from a name. Modifiers stack
// ("Spirit Beast Deer"), so matching is SET MEMBERSHIP, not string position or equality.
//
// Representation (owner ruling 2026-08-20): `subtypes` is AUTHORED in the card data —
// not inferred at load, not split at runtime. validateCards enforces that it stays in
// sync with the display type line, which is what makes hand-authoring safe.
//
// Deliberately NOT on BoardEntity: an always-present new key on every entity would
// re-hash every recorded snapshot — the exact trap that cost fixtures t8/t9 when
// `inspired` was written unconditionally. subtypesOf reads the entity's CARD instead.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkCz } from './helpers';
import { CATALOG, SWORN_WILD_DEV_CARDS, SUBTYPES_BY_ID } from '../data/catalog';
import { hasSubtype, cardHasSubtype, subtypesOf, effectiveAttack, effectiveKeywords, isBaneTarget, parseBanes } from '../store/keywords';
import { validateCards, subtypeTokens } from '../data/validateCards';
import type { Card } from '../types/card';

const sw = (name: string): Card => SWORN_WILD_DEV_CARDS.find(c => c.name === name)!;
const czFor = (cls: string) => CATALOG.slice(20, 25).map((c, i) => mkCz(c, cls, `cz-${i}`));
const g = () => gs.getState().game;

/** A real card's entity — so matching runs against AUTHORED data, end to end. */
const ent = (id: string, cardName: string, over: Parameters<typeof mkComp>[2] = {}) => {
  const c = CATALOG.find(x => x.name === cardName)!;
  return mkComp(id, cardName, { subtype: c.subtype, cls: c.class1, ...over });
};

describe('the authored representation', () => {
  it('every card in the pool has authored tokens in sync with its type line', () => {
    // The tokens live in the LOOKUP, not on the Card — see catalog.ts. This is the real
    // guard over all 200 authored entries; the validator's object-local check covers
    // mint candidates, which are the other place drift can enter.
    const drift = CATALOG.filter(c => {
      const want = subtypeTokens(c.subtype);
      const got = SUBTYPES_BY_ID.get(c.id) ?? [];
      return got.length !== want.length || want.some((t, i) => t !== got[i]);
    });
    expect(drift.map(c => c.name), 'authored tokens match every type line').toEqual([]);
  });

  it('the runtime Card does NOT carry subtypes (nothing new serializes into recordings)', () => {
    // The standing rule, pinned: Card objects sit inside recorded snapshots, so a key
    // here re-hashes every fixture. This is what broke t3 mid-arc.
    expect(Object.prototype.hasOwnProperty.call(CATALOG[0], 'subtypes')).toBe(false);
  });

  it('the guard CATCHES a desync (authoring safety, not decoration)', () => {
    const bad = { ...CATALOG[0], id: 'desync-1', name: 'Desync Under Test',
                  subtype: 'Beast Wolf', subtypes: ['Elf', 'Scout'] } as unknown as Card;
    expect(validateCards([bad]).some(p => p.includes('do not match the type line'))).toBe(true);
  });

  it('stacked modifiers tokenize by position-independent membership', () => {
    expect(subtypeTokens('Spirit Beast Deer')).toEqual(['Spirit', 'Beast', 'Deer']);
    expect(subtypeTokens('Weapon - Sword'), 'items use the segment separator').toEqual(['Weapon', 'Sword']);
    expect(subtypeTokens('Two-Handed Weapon - Axe'), 'hyphenated tokens survive').toEqual(['Two-Handed', 'Weapon', 'Axe']);
  });
});

describe('matching is printed, never derived', () => {
  it('POSITIVE: a plain Beast and a STACKED Beast both match', () => {
    expect(hasSubtype(ent('a', 'Bristlemane Boar'), 'Beast'), 'Beast Boar').toBe(true);
    expect(hasSubtype(ent('b', 'Pale Hart'), 'Beast'), 'Spirit Beast Deer — modifier in the middle').toBe(true);
    expect(hasSubtype(ent('c', 'Sporeback Toad'), 'Beast'), 'Fungal Beast Toad').toBe(true);
  });

  it('NEGATIVE: sapient organisms and Angels are never Beasts', () => {
    expect(hasSubtype(ent('d', 'Verdant Scout'), 'Beast'), 'Elf Scout').toBe(false);
    expect(hasSubtype(ent('e', 'The Pale Ascendant'), 'Beast'), 'Angel — owner: sapient, never a Beast').toBe(false);
  });

  it('NAME means nothing — only the printed type line counts', () => {
    // The owner's explicit example. No card is named this; the point is that the matcher
    // reads `subtypes`, so a name could say anything at all.
    const shadowbeast = { ...CATALOG[0], id: 'nm-1', name: 'Shadowbeast',
                          subtype: 'Shade', subtypes: ['Shade'] } as unknown as Card;
    expect(cardHasSubtype(shadowbeast, 'Beast'), 'named Shadowbeast, typed Shade').toBe(false);
  });

  it('NO DERIVATION: an organism that "sounds like" an animal is not matched without the print', () => {
    // Guards against a future "helpful" Wolf-implies-Beast shortcut creeping in.
    const wolfish = { ...CATALOG[0], id: 'nd-1', name: 'Direwolf Rider',
                      subtype: 'Human Wolf-Rider', subtypes: ['Human', 'Wolf-Rider'] } as unknown as Card;
    expect(cardHasSubtype(wolfish, 'Beast')).toBe(false);
    expect(cardHasSubtype(wolfish, 'Wolf'), 'and not by substring either — Wolf-Rider is one token').toBe(false);
  });

  it('a type-changing effect’s live subtype wins and stands alone (Manifest)', () => {
    const manifest = mkComp('mf', 'Bristlemane Boar', { subtype: 'Manifest' });
    expect(subtypesOf(manifest), 'no longer its printed line').toEqual(['Manifest']);
    expect(hasSubtype(manifest, 'Beast'), 'animated away from Beast').toBe(false);
  });
});

describe('subtype + controller compose (targeted picks)', () => {
  function seedWith(card: Card, cls: string, p1: Record<string, ReturnType<typeof mkComp>>, p2: Record<string, ReturnType<typeof mkComp>> = {}) {
    freshGame();
    gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
      p1: { ...s.game.p1, hand: [card], classZone: czFor(cls), willpower: 5, dead: [],
            board: { b3: mkPc('pc-1', { cls, hp: 10, maxHp: 20 }), ...p1 } },
      p2: { ...s.game.p2, dead: [], board: p2 },
    } }));
  }

  it('"target Beast you control" offers own Beasts ONLY — not own non-Beasts, not enemy Beasts', () => {
    seedWith(sw('Wild Growth'), 'Druid',
      { f1: ent('my-beast', 'Bristlemane Boar'), f2: ent('my-elf', 'Verdant Scout') },
      { f1: ent('their-beast', 'Cairn Elk') });
    gs.getState().playAction(sw('Wild Growth').id);
    expect(gs.getState().pendingActionTarget!.eligibleIds, 'controller AND subtype compose').toEqual(['my-beast']);
  });

  it('Wild Growth grants +3 attack until end of turn through the existing timed-buff path', () => {
    seedWith(sw('Wild Growth'), 'Druid', { f1: ent('my-beast', 'Bristlemane Boar', { atk: 1 }) });
    gs.getState().playAction(sw('Wild Growth').id);
    gs.getState().resolveActionTarget('my-beast');
    expect(effectiveAttack(g().p1.board.f1!, g()), '1 + 3').toBe(4);
  });

  it('Instinct grants Zealous until end of turn — the same buff.grant path, no new engine', () => {
    seedWith(sw('Instinct'), 'Druid', { f1: ent('my-beast', 'Bristlemane Boar') });
    gs.getState().playAction(sw('Instinct').id);
    gs.getState().resolveActionTarget('my-beast');
    expect(effectiveKeywords(g().p1.board.f1!, g())).toContain('Zealous');
  });

  it('Greywind Courser READIES a Beast on entry — and does NOT clear its entry-turn gate', () => {
    freshGame();
    const spent = ent('my-beast', 'Bristlemane Boar', { exhausted: true, tapped: 'major', fresh: true });
    gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
      p1: { ...s.game.p1, hand: [sw('Greywind Courser')], classZone: czFor('Druid'), willpower: 5,
            board: { b3: mkPc('pc-1', { cls: 'Druid' }), f1: spent } },
    } }));
    gs.getState().beginPlay(sw('Greywind Courser').id);
    gs.getState().placeCard('b1');   // canon: Companions enter the Back Line only
    gs.getState().resolveActionTarget('my-beast');
    const b = g().p1.board.f1!;
    expect(b.exhausted, 'readied').toBe(false);
    expect(b.tapped).toBe('none');
    expect(b.fresh, 'entry-turn gate UNTOUCHED — readying restores state, it grants no permission').toBe(true);
  });
});

describe('group scope: "Beasts you control"', () => {
  it('Rootbind Ritual buffs own Beasts only — not own non-Beasts, not opposing Beasts', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: {
        f1: ent('my-beast', 'Bristlemane Boar', { atk: 1 }),
        f2: ent('my-elf', 'Verdant Scout', { atk: 2 }),
        b1: mkConstruct('ritual', 'Rootbind Ritual', 3, { subtype: 'Incantation' }),
      } },
      p2: { ...s.game.p2, board: { f1: ent('their-beast', 'Cairn Elk', { atk: 3 }) } },
    } }));
    expect(effectiveAttack(g().p1.board.f1!, g()), 'own Beast: 1 + 1').toBe(2);
    expect(effectiveAttack(g().p1.board.f2!, g()), 'own non-Beast: unchanged').toBe(2);
    expect(effectiveAttack(g().p2.board.f1!, g()), 'opposing Beast: unchanged').toBe(3);
  });

  it('the aura is LIVE: it covers a Beast that arrives later, and dies with its source', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { b1: mkConstruct('ritual', 'Rootbind Ritual', 3, { subtype: 'Incantation' }) } },
    } }));
    // Arrives AFTER the construct is already in play.
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { ...s.game.p1.board, f1: ent('late', 'Bristlemane Boar', { atk: 1 }) } },
    } }));
    expect(effectiveAttack(g().p1.board.f1!, g()), 'covered on arrival — the scan re-derives every read').toBe(2);

    // And the construct leaving takes the bonus with it (nothing was stamped).
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: s.game.p1.board.f1! } },
    } }));
    expect(effectiveAttack(g().p1.board.f1!, g()), 'aura gone with its source').toBe(1);
  });
});

describe('Deep Roots — subtype filter on Dead Zone recovery', () => {
  it('offers only BEASTS from YOUR OWN Dead Zone', () => {
    freshGame();
    const boar = CATALOG.find(c => c.name === 'Bristlemane Boar')!;
    const elf = CATALOG.find(c => c.name === 'Verdant Scout')!;
    gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
      p1: { ...s.game.p1, hand: [sw('Deep Roots')], classZone: czFor('Druid'), willpower: 5,
            dead: [elf, boar], board: { b3: mkPc('pc-1', { cls: 'Druid' }) } },
      p2: { ...s.game.p2, dead: [boar] },   // opposing Dead Zone is never reachable
    } }));
    const before = g().p1.hand.length;
    gs.getState().playAction(sw('Deep Roots').id);
    const dp = g().pendingDeadPick;
    expect(dp, 'a Dead-Zone pick armed').toBeTruthy();
    expect(dp!.options.map(o => o.card.name), 'the Elf is filtered out; the opponent’s Beast is unreachable')
      .toEqual(['Bristlemane Boar']);
    expect(g().p1.hand.length, 'and the rider drew two').toBe(before - 1 + 2);
  });

  it('with no Beast in your Dead Zone it fizzles — the card is spent (INTERIM: see the 2026-08-20 cast-gate note)', () => {
    // INTERIM per Game_Rules_Updated §Action Supertypes: fizzle-at-zero is current
    // behaviour awaiting the cast-time UNCASTABLE gate. This pin is expected to be
    // retired when that lands.
    freshGame();
    const elf = CATALOG.find(c => c.name === 'Verdant Scout')!;
    gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
      p1: { ...s.game.p1, hand: [sw('Deep Roots')], classZone: czFor('Druid'), willpower: 5,
            dead: [elf], board: { b3: mkPc('pc-1', { cls: 'Druid' }) } },
    } }));
    gs.getState().playAction(sw('Deep Roots').id);
    expect(g().pendingDeadPick ?? null, 'no eligible Beast — nothing armed').toBeNull();
  });
});

// ── Bane: "subtype is [NAME]" is TOKEN MEMBERSHIP (owner ruling 2026-08-20) ──────
// Modifiers stack onto an organism WITHOUT erasing it. Master_Keyword_List §BANE now
// carries the dated Rules Note. Before this, isBaneTarget compared the WHOLE display
// string, so a subtype-keyed Bane silently missed every modifier-carrying organism —
// latent since the Beast re-cut, invisible only because both shipped carriers key a CLASS.
describe('Bane matches the type line by token membership', () => {
  const bane = (b: string, defender: ReturnType<typeof mkComp>) => isBaneTarget([b], defender);

  it('ZERO live behaviour change: both shipped carriers key a CLASS, and the class leg is untouched', () => {
    const carriers = CATALOG.filter(c => (c.keywords ?? []).some(k => /'s Bane$/.test(k)));
    expect(carriers.map(c => c.name).sort()).toEqual(['Faithless Assassin', 'Wolfsbane Knife']);
    expect(carriers.flatMap(c => c.keywords.filter(k => /'s Bane$/.test(k))).sort())
      .toEqual(["Druid's Bane", "Paladin's Bane"]);
    // Both name CLASSES, so they still resolve through the unchanged class leg.
    // parseBanes strips the possessive: "Druid's Bane" reaches the matcher as "Druid".
    expect(parseBanes(["Druid's Bane"]), 'the printed keyword parses to the bare name').toEqual(['Druid']);
    const druidBeast = ent('db', 'Bristlemane Boar');           // cls Druid, Beast Boar
    expect(bane('Druid', druidBeast), 'class leg, exactly as before').toBe(true);
  });

  it('FORWARD: a subtype-keyed Bane hits a Beast Crow AND a stacked Spirit Beast Crow', () => {
    expect(bane("Crow", ent('c1', 'Gallowsnest Crow')), 'Beast Crow IS a Crow').toBe(true);
    // A stacked three-token line, built from a real card's shape.
    const spiritBeastCrow = mkComp('c2', 'Gallowsnest Crow', { subtype: 'Spirit Beast Crow' });
    expect(subtypesOf(spiritBeastCrow), 'live subtype differs from print → stands alone').toEqual(['Spirit Beast Crow']);
    // With the tokens authored (the real path), membership reaches the organism:
    expect(cardHasSubtype({ ...CATALOG[0], id: 'sbc', name: 'Stormcrow Revenant',
      subtype: 'Spirit Beast Crow', subtypes: ['Spirit', 'Beast', 'Crow'] } as unknown as Card, 'Crow')).toBe(true);
  });

  it('NEGATIVE: it does not reach an Elf Scout, nor a card merely NAMED for the organism', () => {
    expect(bane("Crow", ent('e1', 'Verdant Scout')), 'Elf Scout is no Crow').toBe(false);
    const namedOnly = { ...CATALOG[0], id: 'no-1', name: 'Crowfeather Duelist',
                        subtype: 'Human Duelist', subtypes: ['Human', 'Duelist'] } as unknown as Card;
    expect(cardHasSubtype(namedOnly, 'Crow'), 'the NAME is never read').toBe(false);
  });
});
