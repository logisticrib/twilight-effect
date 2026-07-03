// Shared fixtures for store-level tests. Tests import the REAL store directly —
// no window.__gs dev hook, no ssrLoadModule scratchpad: Vitest runs the Vite
// pipeline natively. CONVENTION (tasks/test_seed_plan.md Phase 0): every future
// slice's verification script gets committed here as a test, never run-and-discarded.
import { useGameStore } from '../store/gameStore';
import type { BoardEntity, Card, EquippedItem } from '../types/card';
import { CATALOG } from '../data/catalog';

export const gs = useGameStore;
export const deckCards: Card[] = CATALOG.slice(0, 50);

export const mkComp = (id: string, name: string, over: Partial<BoardEntity> = {}): BoardEntity => ({
  id, kind: 'companion', name, cls: 'Warrior', level: 1, atk: 3, hp: 5, maxHp: 5,
  keywords: [], statuses: [], text: '', tapped: 'none', exhausted: false,
  acts: { move: false, minor: false, major: false }, loadout: { weapon: null, gear: [] },
  ...over,
});

export const mkPc = (id: string, over: Partial<BoardEntity> = {}): BoardEntity => ({
  id, kind: 'pc', name: 'PC', cls: 'Warrior', level: 1, hp: 20, maxHp: 20,
  keywords: [], statuses: [], text: '', tapped: 'none', exhausted: false,
  acts: { move: false, minor: false, major: false }, loadout: { weapon: null, gear: [] },
  ...over,
});

export const mkConstruct = (id: string, name: string, anchors: number, over: Partial<BoardEntity> = {}): BoardEntity => ({
  id, kind: 'construct', name, cls: 'Builder', level: 1, hp: 3, maxHp: 3, anchors,
  keywords: [], statuses: [], text: '', tapped: 'none', exhausted: false,
  acts: { move: false, minor: false, major: false },
  ...over,
});

export const mkItem = (id: string, name: string, over: Partial<EquippedItem> = {}): EquippedItem =>
  ({ id, name, sub: '', hands: 1, counters: 0, text: '', ...over });

/** Fresh solo game fast-forwarded past setup: action phase, p1 active. */
export function freshGame() {
  gs.getState().startSolo(deckCards, deckCards);
  gs.setState(s => ({ game: { ...s.game, setupQueue: [], currentPhase: 'action' as const, activePlayer: 'p1' as const } }));
}
