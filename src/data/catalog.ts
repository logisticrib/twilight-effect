import type { Card, RawCard } from '../types/card';
import swRaw from './sorcerer_warrior_50.json';
import wbRaw from './wizard_builder_50.json';
import devRaw from './dw_rogue_dev_50.json';
import swornRaw from './paladin_druid_dev_50.json';

function normalize(raw: RawCard): Card {
  return { ...raw, cls: raw.class1 || 'Classless' };
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
