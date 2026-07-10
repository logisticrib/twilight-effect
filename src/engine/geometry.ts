// ─── Board geometry ─────────────────────────────────────────────────────────────
// Slot layout, adjacency, and slot/board lookups. Moved verbatim from
// src/store/gameStore.ts (extraction plan, slice 1).
import type { BoardEntity } from '../types/card';

export type SlotId = 'f1' | 'f2' | 'f3' | 'b1' | 'b2' | 'b3';
export type Board = Partial<Record<SlotId, BoardEntity>>;

// ─── Adjacency map ────────────────────────────────────────────────────────────
export const ADJ: Record<SlotId, SlotId[]> = {
  f1: ['f2', 'b1'],
  f2: ['f1', 'f3', 'b2'],
  f3: ['f2', 'b3'],
  b1: ['b2', 'f1'],
  b2: ['b1', 'b3', 'f2'],
  b3: ['b2', 'f3'],
};

export const FRONT_SLOTS: SlotId[] = ['f1', 'f2', 'f3'];
export const BACK_SLOTS:  SlotId[] = ['b1', 'b2', 'b3'];
export function isFront(slot: SlotId): boolean { return FRONT_SLOTS.includes(slot); }

export function findSlot(board: Board, entityId: string): SlotId | null {
  for (const [slot, ent] of Object.entries(board)) {
    if (ent?.id === entityId) return slot as SlotId;
  }
  return null;
}
