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
function normalize(raw: RawCard): Card {
  const { subtypes: _authored, ...rest } = raw;
  return { ...rest, cls: raw.class1 || 'Classless' };
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
