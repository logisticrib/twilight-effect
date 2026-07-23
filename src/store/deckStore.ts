import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SORCERER_WARRIOR_DECK, WIZARD_BUILDER_DECK, DW_ROGUE_DEV_DECK } from '../data/catalog';

export interface Deck {
  id: string;
  name: string;
  /** Presence map — cardId → true. Singleton: one copy each. */
  cards: Record<string, true>;
}

function makeDeck(id: string, name: string, cardIds: string[]): Deck {
  const cards: Record<string, true> = {};
  cardIds.forEach(id => { cards[id] = true; });
  return { id, name, cards };
}

interface DeckState {
  decks: Deck[];
  activeDeckId: string;
  setActiveDeck: (id: string) => void;
  newDeck: () => void;
  renameDeck: (id: string, name: string) => void;
  toggleCard: (deckId: string, cardId: string) => void;
  removeCard: (deckId: string, cardId: string) => void;
}

const SEED: Deck[] = [
  makeDeck('sw', 'Sorcerer / Warrior', SORCERER_WARRIOR_DECK),
  makeDeck('wb', 'Wizard / Builder',   WIZARD_BUILDER_DECK),
  // DEV deck (2026-07-22): owner-authored, non-canon — clearly marked in the name.
  makeDeck('dwr-dev', 'DW / Rogue (DEV)', DW_ROGUE_DEV_DECK),
];

export const useDeckStore = create<DeckState>()(
  persist(
    (set) => ({
      decks: SEED,
      activeDeckId: SEED[0].id,

      setActiveDeck: (id) => set({ activeDeckId: id }),

      newDeck: () => {
        const id = `deck-${Date.now()}`;
        set(s => ({
          decks: [...s.decks, { id, name: 'New Deck', cards: {} }],
          activeDeckId: id,
        }));
      },

      renameDeck: (id, name) =>
        set(s => ({ decks: s.decks.map(d => d.id === id ? { ...d, name } : d) })),

      toggleCard: (deckId, cardId) =>
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== deckId) return d;
            const cards = { ...d.cards };
            if (cards[cardId]) delete cards[cardId];
            else cards[cardId] = true;
            return { ...d, cards };
          }),
        })),

      removeCard: (deckId, cardId) =>
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== deckId) return d;
            const cards = { ...d.cards };
            delete cards[cardId];
            return { ...d, cards };
          }),
        })),
    }),
    {
      name: 'twilight-decks',
      // The store persists; without this a returning browser would keep its stored
      // deck list and never see newly seeded decks (the DEV deck, 2026-07-22).
      // Inject any seed deck whose id is missing; user-made decks are untouched.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DeckState>;
        const decks = [...(p.decks ?? current.decks)];
        for (const seed of SEED) {
          if (!decks.some(d => d.id === seed.id)) decks.push(seed);
        }
        return { ...current, ...p, decks };
      },
    }
  )
);

export function deckCount(deck: Deck) {
  return Object.keys(deck.cards).length;
}
