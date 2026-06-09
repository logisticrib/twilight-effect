import type { Card, RawCard } from '../types/card';
import swRaw from './sorcerer_warrior_50.json';
import wbRaw from './wizard_builder_50.json';

function normalize(raw: RawCard): Card {
  return { ...raw, cls: raw.class1 || 'Classless' };
}

// sorcerer_warrior deck is a raw array; wizard_builder is { cards: [...] }
const swCards = (swRaw as RawCard[]).map(normalize);
const wbCards = ((wbRaw as { cards: RawCard[] }).cards).map(normalize);

/** Full card catalog — all unique cards across both seed decks. */
export const CATALOG: Card[] = [...swCards, ...wbCards];

/** Look up a card by id. */
export function getCard(id: string): Card | undefined {
  return CATALOG.find(c => c.id === id);
}

export const SORCERER_WARRIOR_DECK  = swCards.map(c => c.id);
export const WIZARD_BUILDER_DECK    = wbCards.map(c => c.id);
export const SORCERER_WARRIOR_CARDS = swCards;
export const WIZARD_BUILDER_CARDS   = wbCards;
