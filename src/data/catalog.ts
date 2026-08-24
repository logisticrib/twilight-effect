import type { Card, RawCard } from '../types/card';
import swRaw from './sorcerer_warrior_50.json';
import wbRaw from './wizard_builder_50.json';
import devRaw from './dw_rogue_dev_50.json';
import swornRaw from './paladin_druid_dev_50.json';

/** Normalize a raw deck entry into a runtime Card.
 *
 *  `subtypes` is dropped HERE, on purpose: the authored tokens move into the lookups
 *  below rather than onto an object that gets serialized into recordings (owner ruling
 *  2026-08-20 — nothing new serializes into GameState unless a recording needs it). */
/** Fields that are AUTHORED in the deck JSON and must NOT ride onto the runtime Card:
 *  Card objects serialize into recordings, so every key here would re-hash every
 *  committed fixture (the Arc B finding). Each is read instead through a lookup below.
 *  One list, so the next authored field has an obvious home and cannot be forgotten. */
const AUTHORED_ONLY = ['subtypes', 'tribute'] as const;

function normalize(raw: RawCard): Card {
  const rest: Record<string, unknown> = { ...raw };
  for (const k of AUTHORED_ONLY) delete rest[k];
  return { ...(rest as Omit<RawCard, (typeof AUTHORED_ONLY)[number]>), cls: raw.class1 || 'Classless' };
}

// sorcerer_warrior deck is a raw array; wizard_builder is { cards: [...] }
const swCards = (swRaw as RawCard[]).map(normalize);
const wbCards = ((wbRaw as { cards: RawCard[] }).cards).map(normalize);
// dw_rogue_dev is the DEV deck (owner-authored, NON-CANON, every card dev:true).
const devCards = ((devRaw as { cards: RawCard[] }).cards).map(normalize);
// paladin_druid_dev ("Sworn Wild", 2026-08-19) is the SECOND dev deck — same
// convention: NON-CANON, every card dev:true, excluded from SHIPPED_CATALOG.
const swornCards = ((swornRaw as { cards: RawCard[] }).cards).map(normalize);

/** Full card catalog — all unique cards across the seed decks, INCLUDING dev cards
 *  (they must resolve for play/validation). Shipped-pool queries use SHIPPED_CATALOG. */
export const CATALOG: Card[] = [...swCards, ...wbCards, ...devCards, ...swornCards];

/** Shipped (canon) pool only — dev cards excluded. Coverage audits and any
 *  "shipped decks" query MUST use this, never CATALOG (dev-deck rule, 2026-07-22). */
export const SHIPPED_CATALOG: Card[] = CATALOG.filter(c => !c.dev);

// ─── Authored subtype tokens (Arc B, owner ruling 2026-08-20) ─────────────────
/** Every raw entry across all four decks — the authoring source for the lookups. */
const ALL_RAW: RawCard[] = [
  ...(swRaw as RawCard[]),
  ...((wbRaw as { cards: RawCard[] }).cards),
  ...((devRaw as { cards: RawCard[] }).cards),
  ...((swornRaw as { cards: RawCard[] }).cards),
];

/** id → the type line's AUTHORED tokens. The split happened once, in the card data;
 *  nothing parses a type line at runtime and nothing carries the tokens into game state. */
export const SUBTYPES_BY_ID: ReadonlyMap<string, readonly string[]> =
  new Map(ALL_RAW.map(r => [r.id, Object.freeze([...(r.subtypes ?? [])])]));

/** name → the same tokens. Board entities carry a NAME, not a card id, so this is the
 *  entry point `subtypesOf` uses. Names are unique catalog-wide (the identity rule,
 *  pinned in tier4_validator), so the mapping is unambiguous. */
export const SUBTYPES_BY_NAME: ReadonlyMap<string, readonly string[]> =
  new Map(ALL_RAW.map(r => [r.name, Object.freeze([...(r.subtypes ?? [])])]));

/** The authored tokens for one raw/candidate card — used by the mint gate, where the
 *  card is not in the catalog yet and carries its own authored array. */
export function authoredSubtypesOf(card: { id?: string; name?: string; subtypes?: readonly string[] }): readonly string[] {
  if (card.subtypes) return card.subtypes;
  if (card.id && SUBTYPES_BY_ID.has(card.id)) return SUBTYPES_BY_ID.get(card.id)!;
  if (card.name && SUBTYPES_BY_NAME.has(card.name)) return SUBTYPES_BY_NAME.get(card.name)!;
  return [];
}

// --- Authored TRIBUTE costs (Arc E, 2026-08-23) -------------------------------
/** name -> the play-time Tribute cost this card charges. Same discipline as the
 *  subtype lookups above: AUTHORED in the deck JSON, dropped from the runtime Card by
 *  normalize(), and read from here -- so the cost never rides into a recording and the
 *  engine never parses "sacrifice a Beast" out of printed prose. Names are unique
 *  catalog-wide (the identity rule), so the mapping is unambiguous. */
export const TRIBUTE_BY_NAME: ReadonlyMap<string, Readonly<{ sacrificeSubtype: string }>> =
  new Map(ALL_RAW.filter(r => r.tribute)
    .map(r => [r.name, Object.freeze({ ...r.tribute! })]));

/** The Tribute cost for a card, or undefined when it charges none. The KEYWORD and the
 *  cost are separate facts: a card printing TRIBUTE with no authored cost is an
 *  authoring error the validator refuses, never a free play. */
export function tributeOf(cardName: string): Readonly<{ sacrificeSubtype: string }> | undefined {
  return TRIBUTE_BY_NAME.get(cardName);
}

/** Look up a card by id. */
export function getCard(id: string): Card | undefined {
  return CATALOG.find(c => c.id === id);
}

export const SORCERER_WARRIOR_DECK  = swCards.map(c => c.id);
export const WIZARD_BUILDER_DECK    = wbCards.map(c => c.id);
export const DW_ROGUE_DEV_DECK      = devCards.map(c => c.id);
export const SWORN_WILD_DEV_DECK    = swornCards.map(c => c.id);
export const SORCERER_WARRIOR_CARDS = swCards;
export const WIZARD_BUILDER_CARDS   = wbCards;
export const DW_ROGUE_DEV_CARDS     = devCards;
export const SWORN_WILD_DEV_CARDS   = swornCards;
