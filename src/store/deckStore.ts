import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SORCERER_WARRIOR_DECK, WIZARD_BUILDER_DECK } from '../data/catalog';

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
    { name: 'twilight-decks' }
  )
);

export function deckCount(deck: Deck) {
  return Object.keys(deck.cards).length;
}
