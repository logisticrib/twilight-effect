// ─── Entity lookup + zone movement ──────────────────────────────────────────────
// Pure helpers for finding, patching, and removing board entities, plus the
// Dead-Zone card bookkeeping an exit produces. Moved verbatim from
// src/store/gameStore.ts (extraction plan, slice 3). destroyEntity — the shared
// exit path — follows in slice 5: it fires removal triggers, whose machinery
// (combat.ts) is part of the same mutually-recursive group.
import type { BoardEntity, Card } from '../types/card';
import { CATALOG } from '../data/catalog';
import { isFront, type SlotId } from './geometry';
import type { GameState, PendingItemTransfer, PendingDeadPick, ArmorChoiceData } from './state';
import { isCharacter, canHoldItem, isPhysicalConstruct } from './stats';
// Function-level cycle with combat.ts (destroyEntity fires removal triggers; the
// trigger machinery damages/destroys entities). Safe: hoisted functions, called
// only at runtime — no module-eval-time cross-references.
import { hasRemovalTrigger, resolveRemovalTriggers } from './combat';

export function findEntityAnywhere(game: GameState, entityId: string): { player: 'p1' | 'p2'; slot: SlotId; ent: BoardEntity } | null {
  for (const player of ['p1', 'p2'] as const) {
    for (const [slot, ent] of Object.entries(game[player].board)) {
      if (ent?.id === entityId) return { player, slot: slot as SlotId, ent };
    }
  }
  return null;
}

export function updateEntity(game: GameState, entityId: string, patch: Partial<BoardEntity>): GameState {
  const loc = findEntityAnywhere(game, entityId);
  if (!loc) return game;
  return {
    ...game,
    [loc.player]: {
      ...game[loc.player],
      board: {
        ...game[loc.player].board,
        [loc.slot]: { ...loc.ent, ...patch },
      },
    },
  };
}

export function removeEntity(game: GameState, entityId: string): GameState {
  const loc = findEntityAnywhere(game, entityId);
  if (!loc) return game;
  const board = { ...game[loc.player].board };
  delete board[loc.slot];
  return {
    ...game,
    [loc.player]: { ...game[loc.player], board },
  };
}

/** The catalog cards a destroyed/sacrificed entity carries to its owner's Dead Zone:
 *  its own card plus any equipped items' (deduped by item id — a heavy item occupies
 *  both gear slots but is one card). */
export function deadCardsOf(ent: BoardEntity): Card[] {
  const names: string[] = [ent.name];
  const seen = new Set<string>();
  for (const it of [ent.loadout?.weapon, ...(ent.loadout?.gear ?? [])]) {
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    names.push(it.name);
  }
  return names.map(n => CATALOG.find(c => c.name === n)).filter((c): c is Card => !!c);
}

/** The catalog cards of an entity's equipped items (deduped — a heavy item is one card). */
export function itemCardsOf(ent: BoardEntity): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const it of [ent.loadout?.weapon, ...(ent.loadout?.gear ?? [])]) {
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    const c = CATALOG.find(x => x.name === it.name);
    if (c) out.push(c);
  }
  return out;
}

/** The Item Transfer window a departing character opens for its controller, or null
 *  (no items, or not a character — constructs can't carry items, PC exits end the game). */
export function itemTransferOf(ent: BoardEntity, controller: 'p1' | 'p2'): PendingItemTransfer | null {
  if (!isCharacter(ent)) return null;
  const items = itemCardsOf(ent).map(c => ({ id: c.id, name: c.name }));
  return items.length ? { lp: controller, sourceName: ent.name, items, usedIds: [] } : null;
}

/** Weapon/heavy classification for a hand item (drives slot placement + the capacity
 *  gate in equipItem). Sniffed from itemKind/subtype/text — the deck data has no
 *  structured field for it yet. */
export function itemProfileOf(card: Card): { isWeapon: boolean; isHeavy: boolean } {
  const isWeapon = card.itemKind?.toLowerCase().includes('weapon') ||
                   (card.type === 'Item' && (card.subtype?.toLowerCase().includes('weapon') || card.subtype?.toLowerCase().includes('sword') || card.subtype?.toLowerCase().includes('bow') || card.subtype?.toLowerCase().includes('staff') || card.subtype?.toLowerCase().includes('dagger') || card.subtype?.toLowerCase().includes('axe') || card.subtype?.toLowerCase().includes('mace') || card.subtype?.toLowerCase().includes('wand')));
  return { isWeapon: !!isWeapon, isHeavy: !!card.text?.toLowerCase().includes('heavy') };
}

/** Remove a destroyed/sacrificed entity from the board AND move its card (plus its
 *  equipped items') to its owner's Dead Zone; a tucked Oathsworn card returns to its
 *  owner's hand. Every destruction path must use this — bare `removeEntity` loses the
 *  cards from the game. (Bounce and cost-sacrifice paths do their own zone moves.)
 *  A departing character with items also QUEUES an Item Transfer window (rules §Items,
 *  ruled 2026-07-08: all exits) — queued here, ARMED later at a resolution boundary
 *  (`armNextItemTransfer` via armPrompts / prompt resolvers), so mid-combat kills
 *  defer the window until the attack completes (owner ruling 2026-07-08). */
export function destroyEntity(game: GameState, entityId: string, sink?: PendingDeadPick[], armorSink?: ArmorChoiceData[]): { game: GameState; msgs: string[] } {
  const loc = findEntityAnywhere(game, entityId);
  if (!loc) return { game, msgs: [] };
  const dead = deadCardsOf(loc.ent);
  const sworn = loc.ent.sworn;
  const transfer = itemTransferOf(loc.ent, loc.player);
  const removed = removeEntity(game, entityId);
  let g: GameState = { ...removed,
    pendingItemTransferQueue: transfer ? [...removed.pendingItemTransferQueue, transfer] : removed.pendingItemTransferQueue,
    [loc.player]: {
      ...removed[loc.player],
      dead: dead.length ? [...removed[loc.player].dead, ...dead] : removed[loc.player].dead,
      hand: sworn ? [...removed[loc.player].hand, sworn] : removed[loc.player].hand,
    } };
  const msgs: string[] = [];
  // Death triggers fire HERE, for every removal path uniformly. RULED 2026-07-08:
  // a SACRIFICE is a death — it fires death/destroy triggers (Memory Stone included)
  // exactly like dying to damage. Centralizing in the shared exit path covers ability
  // costs, Coercion, Dismantle/anchor-loss, Manifest leave-sacrifice and the sandbox
  // sacrifice without per-caller wiring. (Ready-phase decay is ALSO worded as a
  // sacrifice but runs inside readyPlayer — no shipped construct carries a death
  // trigger, so wiring it there is deferred and FLAGGED, not silently skipped.)
  if (hasRemovalTrigger(loc.ent)) {
    const rt = resolveRemovalTriggers(g, loc.ent, loc.player, sink, armorSink);
    g = rt.game;
    msgs.push(...rt.msgs);
  }
  return { game: g, msgs };
}

/** Eligible rescuers for one item of a transfer window, re-derived LIVE: ready
 *  characters (not exhausted / major-tapped) in the controller's party, not already
 *  exhausted this event, with an open slot of the appropriate type. Exported for the
 *  ItemTransferModal. */
export function itemTransferCandidates(game: GameState, it: PendingItemTransfer, itemId: string): string[] {
  const card = CATALOG.find(c => c.id === itemId);
  if (!card) return [];
  const { isWeapon, isHeavy } = itemProfileOf(card);
  return (Object.values(game[it.lp].board) as (BoardEntity | undefined)[])
    .filter((e): e is BoardEntity => !!e && isCharacter(e)
      && !(e.tapped === 'major' || e.exhausted)
      && !it.usedIds.includes(e.id)
      && canHoldItem(e, isWeapon, isHeavy))
    .map(e => e.id);
}

/** Arm the next Item Transfer window from the queue. Held back while the Poison check
 *  or an earlier forced prompt (peek / dead-pick / armor) is up — start-of-turn prompts
 *  resolve in canonical Ready Phase step order, Poison BEFORE transfer windows (Rules
 *  Note 2026-07-08) — every such resolver calls this again when it drains. Items whose
 *  eligible-rescuer pool is empty simply stay in the Dead Zone (canon's default), so a
 *  window with nothing claimable evaporates without a prompt. */
export function armNextItemTransfer(game: GameState): GameState {
  if (game.pendingItemTransfer) return game;
  if (game.pendingPoison || game.pendingPeek || game.pendingDeadPick || game.pendingArmor || game.pendingModalChoice || game.pendingPreventOrder) return game;
  const queue = [...game.pendingItemTransferQueue];
  while (queue.length) {
    const req = queue.shift()!;
    const items = req.items.filter(x => itemTransferCandidates(game, req, x.id).length > 0);
    if (!items.length) continue; // nothing claimable — items rest in the Dead Zone
    return { ...game, pendingItemTransfer: { ...req, items }, pendingItemTransferQueue: queue };
  }
  // Fell through the whole queue — every window evaporated (or it was empty).
  return game.pendingItemTransferQueue.length ? { ...game, pendingItemTransferQueue: [] } : game;
}

/** Set a Player Character's HP. The PC board entity is the single source of truth,
 *  mirrored to the PlayerState headline; at 0 HP the game ends — `gameOver` gets the
 *  winning SIDE (`winnerIfDead` when the caller knows who takes credit, else the PC
 *  owner's opponent). */
export function setPcHp(game: GameState, side: 'p1' | 'p2', pcEntityId: string, newHp: number, winnerIfDead?: 'p1' | 'p2'): GameState {
  let g = updateEntity(game, pcEntityId, { hp: newHp });
  g = { ...g, [side]: { ...g[side], hp: newHp } };
  if (newHp <= 0 && !g.gameOver) g = { ...g, gameOver: winnerIfDead ?? (side === 'p1' ? 'p2' : 'p1') };
  return g;
}

/** Pay HP directly from a player's PC (a cost, not damage — armor/replacement don't apply). */
export function payPcHp(game: GameState, side: 'p1' | 'p2', amount: number): GameState {
  const pcId = pcIdOf(game, side);
  const loc = pcId ? findEntityAnywhere(game, pcId) : null;
  if (!loc) return game;
  return setPcHp(game, side, loc.ent.id, Math.max(0, loc.ent.hp - amount));
}

export function pcIdOf(game: GameState, side: 'p1' | 'p2'): string | null {
  const pc = Object.values(game[side].board).find(e => e?.kind === 'pc');
  return pc ? pc.id : null;
}

export function companionIds(game: GameState, side: 'p1' | 'p2'): string[] {
  return Object.values(game[side].board).filter((e): e is BoardEntity => !!e && e.kind === 'companion').map(e => e.id);
}

export function constructIds(game: GameState, pred: (e: BoardEntity) => boolean): string[] {
  const out: string[] = [];
  for (const side of ['p1', 'p2'] as const)
    for (const e of Object.values(game[side].board))
      if (e && e.kind === 'construct' && pred(e)) out.push(e.id);
  return out;
}

/** Characters (companion or PC) on a player's board, optionally filtered to a row. */
export function charsOf(game: GameState, side: 'p1' | 'p2', row?: 'front' | 'back'): string[] {
  return (Object.entries(game[side].board) as [SlotId, BoardEntity | undefined][])
    .filter(([slot, e]) => e && (e.kind === 'companion' || e.kind === 'pc')
      && (row === undefined || (row === 'front') === isFront(slot)))
    .map(([, e]) => e!.id);
}

/** Ids of the Physical Constructs a player controls (Field Engineer's endpoints). */
export function ownPhysicalConstructIds(game: GameState, lp: 'p1' | 'p2'): string[] {
  return (Object.values(game[lp].board) as (BoardEntity | undefined)[])
    .filter((e): e is BoardEntity => !!e && isPhysicalConstruct(e)).map(e => e.id);
}
