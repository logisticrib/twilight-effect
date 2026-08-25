// ─── Entity lookup + zone movement ──────────────────────────────────────────────
// Pure helpers for finding, patching, and removing board entities, plus the
// Dead-Zone card bookkeeping an exit produces. Moved verbatim from
// src/store/gameStore.ts (extraction plan, slice 3). destroyEntity — the shared
// exit path — follows in slice 5: it fires removal triggers, whose machinery
// (combat.ts) is part of the same mutually-recursive group.
import type { BoardEntity, Card } from '../types/card';
import { CATALOG } from '../data/catalog';
import { isFront, FRONT_SLOTS, BACK_SLOTS, type Board, type SlotId } from './geometry';
import type { GameState, PendingItemTransfer, PendingDeadPick, ArmorChoiceData } from './state';
import { isCharacter, canHoldItem, isPhysicalConstruct, gearItemsOf, hasSubtype, effectiveKeywords } from './stats';
// Function-level cycle with combat.ts (destroyEntity fires removal triggers; the
// trigger machinery damages/destroys entities) and interpreter.ts (on-sacrifice
// listeners resolve card effects). Safe: hoisted functions, called only at
// runtime — no module-eval-time cross-references.
import { hasRemovalTrigger, resolveRemovalTriggers } from './combat';
import { effectsOfCard, resolveActionEffects, conditionMet } from './interpreter';

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

/** RETIRED FROM THIS FILE 2026-08-23 (Arc C) — `gearItemsOf` MOVED to engine/stats.ts
 *  and is re-exported here so every existing import keeps working. It had to move down
 *  to the leaf module because `isUntamedEncounter` reads the Gear universe and stats.ts
 *  is upstream of this file; the alternative was a second Gear scan, which is precisely
 *  the drift Arc A's extraction removed. Definition and doc comment live at the new
 *  site — do not re-add a copy here. */
export { gearItemsOf } from './stats';

/** Destroy one equipped Gear item: strip it from its bearer's loadout and put its CARD
 *  in the OWNER's Dead Zone (recoverable). Extracted from the inline disarm path so the
 *  two removals cannot drift. A heavy piece occupying both slots clears from both.
 *  (Arc A, 2026-08-19.) */
export function destroyItemById(game: GameState, itemId: string): { game: GameState; msgs: string[]; destroyed: boolean } {
  for (const side of ['p1', 'p2'] as const) {
    for (const ent of Object.values(game[side].board)) {
      const lo = ent?.loadout;
      if (!ent || !lo) continue;
      const hit = lo.gear.find(gi => gi?.id === itemId);
      if (!hit) continue;
      const newLo = { ...lo, gear: lo.gear.map(gi => gi?.id === itemId ? null : gi) };
      let g = updateEntity(game, ent.id, { loadout: newLo });
      const owner: 'p1' | 'p2' = ent.stolenFrom ?? side;
      const card = CATALOG.find(c => c.name === hit.name);
      if (card) g = { ...g, [owner]: { ...g[owner], dead: [...g[owner].dead, card] } };
      return { game: g, msgs: [`${hit.name} is destroyed (from ${ent.name})`], destroyed: true };
    }
  }
  return { game, msgs: [], destroyed: false };
}

/** One row of the target-pick modal (Arc A follow-up, owner ruling 2026-08-20).
 *  Gear is not rendered on the board, so a Gear pick is made in a dedicated picker —
 *  and the owner's explicit requirement is that every entry names the character the
 *  Gear is attached to. Described here rather than in the component so the requirement
 *  is testable without a screenshot. */
export interface PickEntry {
  id: string;
  kind: 'gear' | 'construct';
  name: string;
  /** Gear only: the character wearing it. The owner requirement. */
  bearerName?: string;
  /** Perspective-relative, like the synced player names: never a raw side id. */
  ownerLabel: 'You' | 'Opponent';
  /** Armor pieces only: counters REMAINING (they count DOWN post-inversion), and the
   *  printed X, so a chooser can tell a nearly-spent piece from a fresh one. */
  counters?: number;
  armor?: number;
  /** Any non-Armor-clause sentence the item prints (e.g. "Equipped character has +1 attack."). */
  rider?: string;
}

/** The rider of an item's printed text: everything that is NOT the canonical Armor
 *  clause or its "ARMOR N." label. Parenthetical restrictions are kept — they matter
 *  to the chooser (the Magic Actions clause on Plate of the Standing Wall). */
export function itemRiderText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const rest = text.split(/(?<=[.!?])\s+/)
    .filter(sen => !/^ARMOR\s+\d+\.?$/i.test(sen.trim()))
    .filter(sen => !/armor counter/i.test(sen))
    .join(' ')
    .trim();
  return rest.length ? rest : undefined;
}

/** Describe an interactive pick's eligible ids for the picker modal. `viewer` is the
 *  local player, so ownership reads "You" / "Opponent" from their seat. Ids that match
 *  neither a Gear item nor a board entity are dropped rather than rendered blank. */
export function describePickTargets(game: GameState, ids: string[], viewer: 'p1' | 'p2'): PickEntry[] {
  const gearById = new Map(gearItemsOf(game).map(x => [x.itemId, x]));
  const out: PickEntry[] = [];
  for (const id of ids) {
    const gi = gearById.get(id);
    if (gi) {
      const bearer = findEntityAnywhere(game, gi.bearerId)?.ent;
      const piece = bearer?.loadout?.gear.find(x => x?.id === id) ?? null;
      out.push({
        id, kind: 'gear', name: gi.name,
        bearerName: bearer?.name ?? 'unknown',
        ownerLabel: gi.owner === viewer ? 'You' : 'Opponent',
        ...(piece?.armor !== undefined ? { counters: piece.counters ?? 0, armor: piece.armor } : {}),
        ...(itemRiderText(piece?.text) ? { rider: itemRiderText(piece?.text) } : {}),
      });
      continue;
    }
    const loc = findEntityAnywhere(game, id);
    if (!loc) continue;
    out.push({
      id, kind: 'construct', name: loc.ent.name,
      ownerLabel: (loc.ent.stolenFrom ?? loc.player) === viewer ? 'You' : 'Opponent',
    });
  }
  return out;
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
 *  structured field for it yet.
 *
 *  HEAVY (fixed 2026-08-18, owner ruling): read from the SUBTYPE — canon names the
 *  subtype "Heavy Armor" and makes 2 slots an inherent rule of it
 *  (Card_Design_Parameters §Type Line Format). This previously sniffed the literal
 *  word "heavy" out of printed prose, which no shipped card carries, so the heavy
 *  path had never once fired. The prose check is kept only as a fallback. */
export function itemProfileOf(card: Card): { isWeapon: boolean; isHeavy: boolean } {
  const isWeapon = card.itemKind?.toLowerCase().includes('weapon') ||
                   (card.type === 'Item' && (card.subtype?.toLowerCase().includes('weapon') || card.subtype?.toLowerCase().includes('sword') || card.subtype?.toLowerCase().includes('bow') || card.subtype?.toLowerCase().includes('staff') || card.subtype?.toLowerCase().includes('dagger') || card.subtype?.toLowerCase().includes('axe') || card.subtype?.toLowerCase().includes('mace') || card.subtype?.toLowerCase().includes('wand')));
  const isHeavy = card.subtype?.toLowerCase().includes('heavy') ||
                  card.text?.toLowerCase().includes('heavy');
  return { isWeapon: !!isWeapon, isHeavy: !!isHeavy };
}

/**
 * Fire "when one of your Physical Constructs is sacrificed" listeners (arc 5,
 * owner-ratified 2026-07-15) for one sacrifice event. `eventBoard` is the
 * controller's board AS OF the event (pre-removal), so the sacrificed permanent's
 * OWN listener fires too (R3) — resolution happens after it left play, which the
 * queued-trigger canon (2026-07-12) already permits. Listeners resolve in
 * deterministic slot-scan order; mandatory, no choices (no holds). Only events
 * canon words as SACRIFICE reach this (destroyEntity threads the cause) — a
 * Physical Construct destroyed by damage or a non-sacrifice removal never does.
 */
export function fireSacrificeTriggers(
  game: GameState, dying: Pick<BoardEntity, 'id' | 'name' | 'kind' | 'subtype'>,
  controller: 'p1' | 'p2', eventBoard: Board,
  sink?: PendingDeadPick[], armorSink?: ArmorChoiceData[],
): { game: GameState; msgs: string[] } {
  if (dying.kind !== 'construct' || !isPhysicalConstruct(dying as BoardEntity)) return { game, msgs: [] };
  let g = game;
  const msgs: string[] = [];
  for (const slot of [...FRONT_SLOTS, ...BACK_SLOTS]) {
    const listener = eventBoard[slot];
    if (!listener) continue;
    for (const clause of effectsOfCard(listener.name)) {
      if (clause.trigger !== 'ownPhysicalConstructSacrificed') continue;
      if (clause.if && !conditionMet(g, controller, clause.if)) continue;
      const r = resolveActionEffects(g, controller, listener.name, clause.effects,
        undefined, listener.id, { subjectId: dying.id }, sink, armorSink);
      g = r.game;
      msgs.push(`${listener.name} triggers${r.msgs.length ? `: ${r.msgs.join(' | ')}` : ''}`);
    }
  }
  return { game: g, msgs };
}

/** THE sacrifice-legality chokepoint (owner-ruled 2026-07-24; GRU §Game Zones, Dead
 *  Zone Rules Notes): the Player Character can NEVER be chosen as a sacrifice to
 *  ANY effect — an ability cost, a forced choice (Coercion, "each player
 *  sacrifices…"), anything. PC death is the loss condition; offering it is a trap
 *  option, not agency. Promotes the Coercion-specific 2026-07-04 ruling to the
 *  general rule. Every site that enumerates sacrifice-legal permanents routes
 *  through HERE — no per-effect copies. */
export function canBeSacrificed(ent: BoardEntity): boolean {
  return ent.kind !== 'pc';
}

/**
 * TRIBUTE (Arc E, 2026-08-23) -- which permanents can pay `lp`'s Tribute cost, as
 * {id, slot}. Canon (Master_Keyword_List.md:64): "As an additional cost to play this
 * Angel companion, pay its Tribute cost"; the per-card cost names a subtype.
 *
 * CONTROLLER-SCOPED, and not by fiat: a cost is paid by the player paying it, and every
 * sacrifice path in this engine enumerates the payer's OWN board before reaching
 * canBeSacrificed (forcedSacrifice, Coercion, eachPlayerSacrificesOrDiscards). An
 * opposing Beast is therefore never payment -- the scan simply never leaves `lp`'s board.
 *
 * Subtype matching is the Arc B shared matcher (SET MEMBERSHIP over authored tokens), so
 * a "Spirit Beast Deer" pays a Beast tribute and the engine never parses a type line.
 *
 * The card being played is in HAND, not on the board, so it cannot appear here -- which
 * is why an Angel can never pay its own Tribute even before Angel-is-not-a-Beast is
 * considered. Both facts are pinned; neither is relied on alone.
 *
 * Slots come back with the ids because the play target may BE one of these slots: a
 * Back-Line slot held by a payable Beast is a legal place-target (owner ruling
 * 2026-08-23, "the offering makes room"), and clicking it forces that Beast as payment.
 */
export function tributePayable(game: GameState, lp: 'p1' | 'p2', sacrificeSubtype: string):
  { id: string; slot: SlotId; name: string }[] {
  const out: { id: string; slot: SlotId; name: string }[] = [];
  for (const [slot, ent] of Object.entries(game[lp].board) as [SlotId, BoardEntity | undefined][]) {
    if (!ent || !canBeSacrificed(ent)) continue;
    if (!hasSubtype(ent, sacrificeSubtype)) continue;
    out.push({ id: ent.id, slot, name: ent.name });
  }
  return out;
}

/** Remove a destroyed/sacrificed entity from the board AND move its card (plus its
 *  equipped items') to its owner's Dead Zone; a tucked Oathsworn card returns to its
 *  owner's hand. Every destruction path must use this — bare `removeEntity` loses the
 *  cards from the game. (Bounce and cost-sacrifice paths do their own zone moves.)
 *  A departing character with items also QUEUES an Item Transfer window (rules §Items,
 *  ruled 2026-07-08: all exits) — queued here, ARMED later at a resolution boundary
 *  (`armNextItemTransfer` via armPrompts / prompt resolvers), so mid-combat kills
 *  defer the window until the attack completes (owner ruling 2026-07-08).
 *  CAUSE IS REQUIRED (Arc C, 2026-07-23): every death names its cause — 'damage'
 *  (the applyDamage destroy branch) or 'sacrifice' (every cost/effect/ready-phase
 *  exit; arc 5, 2026-07-15). 'sacrifice' additionally fires on-sacrifice listeners,
 *  and death-cause-conditional removal triggers ("if it died to damage" — Cult
 *  Fanatic) gate on it in resolveRemovalTriggers. An unknowable cause is a BUG:
 *  the required parameter makes a new call site without one fail to compile. */
export function destroyEntity(game: GameState, entityId: string, sink: PendingDeadPick[] | undefined, armorSink: ArmorChoiceData[] | undefined, cause: 'damage' | 'sacrifice' | 'destroy'): { game: GameState; msgs: string[] } {
  const loc = findEntityAnywhere(game, entityId);
  if (!loc) return { game, msgs: [] };
  // Arc I (2026-08-11, ruling 4): OWNERSHIP routes zones. A stolen companion
  // (stolenFrom set) that dies on its CONTROLLER's board sends its card, its item
  // cards, its sworn card, and its Item Transfer window to the ORIGINAL OWNER —
  // zone ownership never moved. Every un-stolen entity: owner === loc.player,
  // byte-identical to the pre-arc path. (RATIFIED owner 2026-08-17 — GRU §Items
  // Rules Note: when controller and owner differ, the Item Transfer window belongs
  // to the OWNER; rescue and burial stay on the same side. Formerly a flagged
  // deviation; the shipped owner-routing was confirmed correct, no change.)
  const owner: 'p1' | 'p2' = loc.ent.stolenFrom ?? loc.player;
  const dead = deadCardsOf(loc.ent);
  const sworn = loc.ent.sworn;
  const transfer = itemTransferOf(loc.ent, owner);
  // HAUNT (Requiem Arc C, 2026-08-25) — the check reads the PRE-removal entity: a
  // companion whose EFFECTIVE keywords include Haunt (the Crown's item grant is
  // visible — it is still equipped at this moment; an opposing suppression aura
  // suppresses Haunt like any keyword) and which carries NO Memory counters. The
  // RETURN is deferred: canon has the death fully happen first, so the owed return
  // rides pendingHauntQueue and arms only after the transfer/poison windows drain
  // (armNextHaunt). Owner-routed like the zones above.
  const haunts = loc.ent.kind === 'companion'
    && (loc.ent.memoryCounters ?? 0) === 0
    && effectiveKeywords(loc.ent, game).includes('Haunt');
  const hauntCard = haunts ? CATALOG.find(c => c.name === loc.ent.name) ?? null : null;
  // On-sacrifice listeners gather from the board AS OF the event (pre-removal) —
  // the dying permanent's own listener is included (R3, owner 2026-07-15). The
  // event stays on the CONTROLLER's board (where it died); only ZONES follow owner.
  const eventBoard = cause === 'sacrifice' ? game[loc.player].board : null;
  const removed = removeEntity(game, entityId);
  let g: GameState = { ...removed,
    pendingItemTransferQueue: transfer ? [...removed.pendingItemTransferQueue, transfer] : removed.pendingItemTransferQueue,
    // The owed Haunt return (Arc C): queued, never resolved here — armNextHaunt
    // arms it after the death's windows drain.
    ...(hauntCard ? { pendingHauntQueue: [...(removed.pendingHauntQueue ?? []),
      { lp: owner, cardId: hauntCard.id, cardName: hauntCard.name }] } : {}),
    [owner]: {
      ...removed[owner],
      dead: dead.length ? [...removed[owner].dead, ...dead] : removed[owner].dead,
      hand: sworn ? [...removed[owner].hand, sworn] : removed[owner].hand,
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
    // Removal triggers run for the OWNER's side (Arc I): a stolen Memory Stone
    // bearer's recovery pick reads the owner's Dead Zone — where the card just
    // went. Un-stolen: owner === loc.player, unchanged.
    const rt = resolveRemovalTriggers(g, loc.ent, owner, sink, armorSink, cause);
    g = rt.game;
    msgs.push(...rt.msgs);
  }
  // On-sacrifice listeners (arc 5, 2026-07-15): only when the caller threaded the
  // SACRIFICE cause — a damage death never fires them. Engine default: the dying
  // card's own removal triggers resolve first, then the listeners in slot order.
  if (eventBoard) {
    const st = fireSacrificeTriggers(g, loc.ent, loc.player, eventBoard, sink, armorSink);
    g = st.game;
    msgs.push(...st.msgs);
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

// ─── Deck movement (Requiem Arc A, 2026-08-25) ────────────────────────────────

/** Move the top `count` cards of `player`'s deck into their own Dead Zone (self-mill:
 *  the `mill` op and the ENTOMB keyword). Mills all remaining when short. Milling an
 *  EMPTY deck is NOT a loss — canon ties the empty-deck loss to DRAWS, never mills
 *  (GRU §Win Conditions / CDP §6; the loss lives in `drawCards` below). */
export function millCards(game: GameState, player: 'p1' | 'p2', count: number): { game: GameState; milled: Card[] } {
  const ps = game[player];
  const n = Math.min(count, ps.deck.length);
  if (n === 0) return { game, milled: [] };
  const milled = ps.deck.slice(0, n);
  return { game: { ...game, [player]: { ...ps, deck: ps.deck.slice(n), dead: [...ps.dead, ...milled] } }, milled };
}

/** Draw up to `count` cards for `player` — THE deck-out chokepoint (owner-ruled
 *  2026-08-25): a MANDATORY draw attempted while the deck is empty LOSES the game,
 *  and the ruling covers ANY mandatory draw — effect draws included, not only the
 *  Draw Phase ("When deck is empty and player must draw, player loses", GRU:158;
 *  "lose immediately", CDP §6). Every draw in the game today is mandatory ("you may
 *  draw" exists on no op or card); if an optional draw ever ships, route its decline
 *  path around this helper, never through it. Partial draws happen first: "draw 2"
 *  with 1 card left draws that card, THEN the second attempt hits the empty deck and
 *  loses. `gameOver` gets the winning side (the setPcHp shape — an existing key, so
 *  nothing new serializes into recordings). */
export function drawCards(game: GameState, player: 'p1' | 'p2', count: number): { game: GameState; drawn: number; lost: boolean } {
  let g = game;
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const ps = g[player];
    if (ps.deck.length === 0) {
      if (!g.gameOver) g = { ...g, gameOver: player === 'p1' ? 'p2' : 'p1' };
      return { game: g, drawn, lost: true };
    }
    const [top, ...rest] = ps.deck;
    g = { ...g, [player]: { ...ps, deck: rest, hand: [...ps.hand, top] } };
    drawn++;
  }
  return { game: g, drawn, lost: false };
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
