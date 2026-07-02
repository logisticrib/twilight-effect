import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { BoardEntity, Card, TapState, Acts, EquippedItem } from '../types/card';
import type { Effect, Amount, Condition, TargetSpec, Trigger, Cost } from '../types/effects';
import { CATALOG, SORCERER_WARRIOR_CARDS, WIZARD_BUILDER_CARDS } from '../data/catalog';
import { recomputeStatics, isImmuneToSplash, grantHitRun, HIT_RUN_STATUS,
         isPhysicalConstruct, parseEnterTrigger, type EnterTriggerKind,
         isCharacter, firstItemOf, allItemsOf, canHoldItem, effectiveAttack, effectiveKeywords, hasModifier, effectiveMaxHp, wardedLines,
         canPlayActionCard, actionTypeOf, playWillpower } from './keywords';

export type Phase = 'ready' | 'draw' | 'cz' | 'action' | 'end';
export type PlayPhase = 'lobby' | 'setup' | 'game';
/** 'placing-pc' = waiting for the local player to choose a Back Line slot */
export type SetupStep = 'mulligan' | 'classbonus' | 'placing-pc' | 'done';
export type SlotId = 'f1' | 'f2' | 'f3' | 'b1' | 'b2' | 'b3';
export type Board = Partial<Record<SlotId, BoardEntity>>;

export interface ClassZoneCard {
  id: string;
  cls: string;
  name: string;
  faceDown?: boolean;
  /** Full card data — used for hover preview. */
  cardData?: Card;
}

export interface PlayerState {
  name: string;
  hp: number;
  maxHp: number;
  /** Ordered draw pile — top of deck is index 0. */
  deck: Card[];
  dead: Card[];
  /** Computed from face-up Class Zone cards. */
  willpower: number;
  classZone: ClassZoneCard[];
  board: Board;
  hand: Card[];
  /** -1 Willpower while any opponent Dismay permanent is in play. Does not stack. */
  dismayed: boolean;
  /** For opponent display when hand is hidden (multiplayer). */
  handCount?: number;
  /** PC entity stashed until the player places it (setup step 8). */
  _pc?: BoardEntity;
}

export interface GameState {
  turn: number;
  activePlayer: 'p1' | 'p2';
  currentPhase: Phase;
  p1: PlayerState;
  p2: PlayerState;
  selected: string | null;
  /** True once the active player uses the once-per-turn Class Zone exchange. */
  czExchangeUsed: boolean;
  /** Atomic activation: the character currently mid-activation (has taken ≥1 action
   *  this turn). When a *different* character acts, this one is sealed. */
  currentActor: string | null;
  /** Characters whose activation is sealed for the turn — cannot act again even with
   *  unused budget. Reset each turn. */
  finishedActors: string[];
  /** Set to the winner's name when the game ends; null while the game is ongoing. */
  /** The winning SIDE once the game has ended (render via `seatName` — never store
   *  or display a name here; names are perspective placeholders). */
  gameOver: 'p1' | 'p2' | null;
  // ── Cross-client prompts (live in `game` so they sync over multiplayer and route
  //    to the owning player). Active-player-only prompts (targeting/trigger/kit/equip)
  //    stay store-local. Each modal renders only when `localPlayer === <prompt>.lp`
  //    (the gate is bypassed in solo/sandbox). ───────────────────────────────────
  /** Deck-peek (scry) prompt — Patient Study, Tower Apprentice, start-of-turn scryers. */
  pendingPeek: PendingPeek | null;
  /** Further start-of-turn peeks queued behind the active one. */
  pendingPeekQueue: PeekRequest[];
  /** Dead-Zone recovery prompt — Library of Memory, Memory Stone. */
  pendingDeadPick: PendingDeadPick | null;
  /** Further Dead-Zone prompts queued behind the active one (e.g. a Cleave that
   *  destroys two Memory-Stone bearers at once). */
  pendingDeadPickQueue: PendingDeadPick[];
  /** The player who must resolve a start-of-turn Poison check, or null. Routed to
   *  that player's client (the modal renders only when localPlayer === pendingPoison). */
  pendingPoison: 'p1' | 'p2' | null;
  /** Mid-combat Armor choice — when an attack hits a character with 2+ armor pieces,
   *  combat PAUSES and the DEFENDER picks which piece absorbs the hit (rules: "the
   *  controlling player chooses which armor prevents the damage"). Carries the
   *  serializable resume state so combat continues after the pick. Routed to the
   *  defender; the attacker is held (see `reactiveHold`) until it resolves. */
  pendingArmor: PendingArmor | null;
  /** Pre-attack optional ability prompt (Mara: "you may pay HP from your PC: +N damage").
   *  Routed to the attacker; combat commits once they choose via `resolveAttackChoice`. */
  pendingAttackChoice: PendingAttackChoice | null;
  /** Remaining setup steps as `"<step>:<player>"`, e.g. "mulligan:p1". Synced so MP
   *  setup is SERIALIZED — only the head step's owner acts (turn-like, so the wholesale
   *  state-sync stays correct even for cross-half class bonuses); the other peer waits.
   *  Empty once setup is complete. */
  setupQueue: string[];
}

/** The ordered setup sequence both players walk through before turn 1. */
const SETUP_SEQUENCE = [
  'mulligan:p1', 'mulligan:p2',
  'classbonus:p1', 'classbonus:p2',
  'place-pc:p1', 'place-pc:p2',
];

export interface ConnState {
  mode: 'solo' | 'host' | 'join';
  code: string;
  latency: number | null;
  opponentName: string;
  opponentAvatar: string;
  opponentStatus: 'waiting' | 'connecting' | 'ready';
}

export interface PendingAction {
  action: 'move' | 'attack';
  charId: string;
}

export interface PendingPlay {
  cardId: string;
  /** The character whose activation is playing this card (captured at arm time, so
   *  it survives selection being cleared). Used to charge the action economy. */
  actorId?: string | null;
}

export interface OathContext {
  permanentId: string;
  name: string;
}

/** An on-enter keyword (Reinforce/Dismantle) waiting for the player to pick a
 *  target Physical Construct from the board. `eligibleIds` are the clickable
 *  entity ids; the board highlights exactly these. */
export interface PendingTrigger {
  kind: EnterTriggerKind;
  n: number;
  sourceName: string;
  eligibleIds: string[];
}

/** Effects awaiting a single board target before resolving — from a played
 *  Action card (`source:'action'`, `card` moved to Dead Zone after) or a
 *  companion's on-enter effects (`source:'enter'`, `sourceId` is the entrant). */
export interface PendingActionTarget {
  source: 'action' | 'enter' | 'ability';
  sourceName: string;
  lp: 'p1' | 'p2';
  effects: Effect[];
  eligibleIds: string[];
  card?: Card;       // present when source === 'action'
  sourceId?: string; // present when source === 'enter' (for 'self' targeting)
  // Two-step (Tactical Reposition: char→slot; Disarming Blow: attacker→enemy;
  // Field Engineer: Physical Construct → Physical Construct anchor move).
  twoStep?: 'reposition' | 'disarm' | 'moveAnchor';
  firstId?: string;            // the first chosen entity (set on step 2)
  eligibleSlots?: SlotId[];    // clickable empty slots when step 2 is a slot pick
}

/** A deck-peek (scry) awaiting the player to assign each looked-at card a
 *  destination (hand/top/bottom). */
export interface PendingPeek {
  source: string;
  lp: 'p1' | 'p2';
  deckSide: 'p1' | 'p2';        // which deck was looked at
  cards: Card[];                // the looked-at cards (top first)
  dests: ('hand' | 'top' | 'bottom')[];
  maxHand?: number;
}

/** A queued start-of-turn peek (deck not yet sliced — re-sliced when it becomes
 *  active so an earlier peek's reorder of the same deck can't stale the snapshot). */
export interface PeekRequest {
  source: string;
  lp: 'p1' | 'p2';
  deckSide: 'p1' | 'p2';
  look: number;
  dests: ('hand' | 'top' | 'bottom')[];
  maxHand?: number;
}

/** Equip-from-hand prompt (Veteran of the Ashgrove): pick an item to equip to `targetId`. */
export interface PendingEquipPick {
  source: string;
  lp: 'p1' | 'p2';
  targetId: string;   // the entity that will wear the item
  items: Card[];      // the equippable items in hand
}

/** A Dead-Zone recovery prompt: pick one of `options` to return to hand (or skip if
 *  optional). `postEffects` run only if a card is taken (e.g. Library's self-exhaust). */
export interface PendingDeadPick {
  source: string;
  lp: 'p1' | 'p2';                       // whose Dead Zone + hand
  sourceId?: string;                     // the permanent to bind `postEffects` to (self)
  options: { card: Card; idx: number }[]; // eligible dead cards + their index in the dead array
  postEffects: Effect[];
  optional: boolean;
}

/** Kit-Master's targeting: pick a source character holding an item; if it holds
 *  2+ items, pick which one ('item' step, via KitItemModal); then pick a different
 *  destination character to receive it. `eligibleIds` lists the entities clickable
 *  in the current board step (empty during the modal-driven 'item' step). */
export interface PendingKit {
  sourceName: string;          // the Kit-Master companion's name
  step: 'source' | 'item' | 'dest';
  eligibleIds: string[];
  fromId?: string;             // chosen source character (set from 'item'/'dest' step)
  itemId?: string;             // chosen item id (set in 'dest' step)
  itemName?: string;
  items?: { id: string; name: string }[]; // candidate items to pick ('item' step)
}

/** Serializable resume state for a paused attack. An attack is a queue of damage
 *  hits (primary target + Cleave line-mates) followed by an after-phase (combat
 *  triggers, Reckless, Hit & Run). When a hit lands on a 2+armor character the
 *  driver pauses; this captures everything needed to continue. No closures (so it
 *  syncs over multiplayer and survives across reducer calls). */
export interface AttackCtx {
  charId: string;              // attacker entity (for Reckless / Hit & Run)
  attackerName: string;
  attackerPlayer: 'p1' | 'p2';
  dmg: number;                 // per-hit damage (same for primary + every Cleave hit)
  hitQueue: string[];          // entity ids still to be damaged (head = current)
  phase: 'damage' | 'after';
  reckless: boolean;
  hitRun: boolean;
  msgs: string[];
  events: DamageEvent[];       // damage events for combat triggers (blocked hits excluded)
  deadSink: PendingDeadPick[]; // deferred onDestroy Dead-Zone picks
  armorSink: ArmorChoiceData[];// deferred Armor choices from combat triggers (armed at finalize)
}

/** One deferred Armor choice: a hit landed on a character with 2+ armor pieces and
 *  the defender must pick which absorbs it. Used both for the active prompt and the
 *  queue of pending ones (non-combat damage defers them; combat hits pause instead). */
export interface ArmorChoiceData {
  defender: 'p1' | 'p2';       // who chooses (the hit character's controller)
  entityId: string;            // the character being hit
  entityName: string;
  candidates: { id: string; name: string; counters: number; armor: number }[];
}

/** Armor choice prompt. `ctx` present → a paused mid-combat hit (resume on resolve).
 *  `queue` present → deferred non-combat choices resolved one after another. */
export interface PendingArmor extends ArmorChoiceData {
  ctx?: AttackCtx;
  queue?: ArmorChoiceData[];
}

/** A pre-attack "you may pay HP: +N damage" prompt (Mara). Captures the attack so it
 *  can be committed (with or without the bonus) once the attacker decides. */
export interface PendingAttackChoice {
  lp: 'p1' | 'p2';       // the attacking player (who chooses)
  charId: string;        // the attacker
  targetId: string;      // the attack's target
  sourceName: string;    // the ability's source (for the prompt)
  payHP: number;
  bonus: number;
}

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

/** Display label for a player seat from the local viewer's perspective. Stored
 *  player names are perspective placeholders ('You'/'Opponent'), and the whole
 *  GameState is broadcast wholesale in multiplayer, so each peer must derive the
 *  label from the seat vs its own `localPlayer` — never read `game[side].name`. */
export function seatName(side: 'p1' | 'p2', localPlayer: 'p1' | 'p2'): string {
  return side === localPlayer ? 'You' : 'Opponent';
}

/** Store-local (unsynced) prompt state, nulled whenever a new game starts, control
 *  changes hands, or a save resumes — stale prompts from a previous game reference
 *  dead entity ids. Game-level synced prompts live in GameState (reset by makeNewGame). */
const LOCAL_PROMPTS_CLEARED = {
  pending: null, pendingPlay: null, pendingTrigger: null, pendingKit: null,
  pendingActionTarget: null, pendingEquipPick: null, pileView: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function freshActs(): Acts { return { move: false, minor: false, major: false }; }

/** Atomic activation: a character whose activation is sealed cannot act again this
 *  turn (you moved on to another character). */
export function isSealed(game: GameState, id: string): boolean {
  return game.finishedActors.includes(id);
}
/** The activation-field patch to merge into a game when character `id` takes an
 *  action: seal the previous actor (if a *different* character was mid-activation),
 *  then make `id` the current actor. */
function activationPatch(game: GameState, id: string): { currentActor: string; finishedActors: string[] } {
  const cur = game.currentActor;
  if (cur && cur !== id && !game.finishedActors.includes(cur)) {
    return { currentActor: id, finishedActors: [...game.finishedActors, cur] };
  }
  return { currentActor: id, finishedActors: game.finishedActors };
}

function findSlot(board: Board, entityId: string): SlotId | null {
  for (const [slot, ent] of Object.entries(board)) {
    if (ent?.id === entityId) return slot as SlotId;
  }
  return null;
}

function findEntityAnywhere(game: GameState, entityId: string): { player: 'p1' | 'p2'; slot: SlotId; ent: BoardEntity } | null {
  for (const player of ['p1', 'p2'] as const) {
    for (const [slot, ent] of Object.entries(game[player].board)) {
      if (ent?.id === entityId) return { player, slot: slot as SlotId, ent };
    }
  }
  return null;
}

function updateEntity(game: GameState, entityId: string, patch: Partial<BoardEntity>): GameState {
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

function removeEntity(game: GameState, entityId: string): GameState {
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
function deadCardsOf(ent: BoardEntity): Card[] {
  const names: string[] = [ent.name];
  const seen = new Set<string>();
  for (const it of [ent.loadout?.weapon, ...(ent.loadout?.gear ?? [])]) {
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    names.push(it.name);
  }
  return names.map(n => CATALOG.find(c => c.name === n)).filter((c): c is Card => !!c);
}

/** Remove a destroyed/sacrificed entity from the board AND move its card (plus its
 *  equipped items') to its owner's Dead Zone; a tucked Oathsworn card returns to its
 *  owner's hand. Every destruction path must use this — bare `removeEntity` loses the
 *  cards from the game. (Bounce and cost-sacrifice paths do their own zone moves.) */
function destroyEntity(game: GameState, entityId: string): GameState {
  const loc = findEntityAnywhere(game, entityId);
  if (!loc) return game;
  const dead = deadCardsOf(loc.ent);
  const sworn = loc.ent.sworn;
  const g = removeEntity(game, entityId);
  return { ...g, [loc.player]: {
    ...g[loc.player],
    dead: dead.length ? [...g[loc.player].dead, ...dead] : g[loc.player].dead,
    hand: sworn ? [...g[loc.player].hand, sworn] : g[loc.player].hand,
  } };
}

/** Set a Player Character's HP. The PC board entity is the single source of truth,
 *  mirrored to the PlayerState headline; at 0 HP the game ends — `gameOver` gets the
 *  winning SIDE (`winnerIfDead` when the caller knows who takes credit, else the PC
 *  owner's opponent). */
function setPcHp(game: GameState, side: 'p1' | 'p2', pcEntityId: string, newHp: number, winnerIfDead?: 'p1' | 'p2'): GameState {
  let g = updateEntity(game, pcEntityId, { hp: newHp });
  g = { ...g, [side]: { ...g[side], hp: newHp } };
  if (newHp <= 0 && !g.gameOver) g = { ...g, gameOver: winnerIfDead ?? (side === 'p1' ? 'p2' : 'p1') };
  return g;
}

// ─── Damage + effect interpreter (shared by combat and Action cards) ───────────

/**
 * Apply `dmg` to one entity: Armor first, then the hpFloor1 modifier, then HP
 * reduction / removal / PC-defeat. Returns the new game and log lines. Reused by
 * resolveAttack and Action-card damage so the rules live in one place.
 *
 * Armor: a hit is fully prevented while any armor piece remains (one counter per
 * hit, on one piece). When the character has 2+ pieces the controlling player
 * chooses which absorbs — the combat driver pauses for that and replays this with
 * `armorPieceId` set. Without a forced id (non-attack damage, or a single piece)
 * the most-worn piece is consumed (spends nearly-sacrificed armor first).
 */
function armorPiecesOf(ent: BoardEntity): EquippedItem[] {
  return (ent.loadout?.gear.filter((gi): gi is EquippedItem => !!gi && gi.armor !== undefined)) ?? [];
}
/** Default armor choice when the player doesn't pick: the most-worn piece (highest counters). */
function pickDefaultArmor(pieces: EquippedItem[]): EquippedItem {
  return pieces.reduce((best, p) => ((p.counters ?? 0) > (best.counters ?? 0) ? p : best), pieces[0]);
}
/** Put one armor counter on `pieceId` (sacrifice it at its limit). Shared by the
 *  in-line block in applyDamage and the deferred non-combat choice in resolveArmor. */
function applyArmorCounter(game: GameState, entityId: string, pieceId: string): { game: GameState; msgs: string[] } {
  const loc = findEntityAnywhere(game, entityId);
  const piece = loc?.ent.loadout?.gear.find(gi => gi?.id === pieceId);
  if (!loc || !piece) return { game, msgs: [] };
  const msgs: string[] = [];
  const newCounters = (piece.counters ?? 0) + 1;
  msgs.push(`${piece.name} blocks! (${newCounters}/${piece.armor} counters)`);
  let gear = loc.ent.loadout!.gear.map(gi => gi?.id === pieceId ? { ...gi, counters: newCounters } : gi);
  if (newCounters >= (piece.armor ?? 0)) {
    gear = gear.map(gi => gi?.id === pieceId ? null : gi);
    msgs.push(`${piece.name} is destroyed!`);
  }
  return { game: updateEntity(game, entityId, { loadout: { ...loc.ent.loadout!, gear } }), msgs };
}
function applyDamage(game: GameState, entityId: string, dmg: number, sourceName: string, sourcePlayer: 'p1' | 'p2', sink?: PendingDeadPick[], armorPieceId?: string, armorSink?: ArmorChoiceData[]): { game: GameState; msgs: string[] } {
  const loc = findEntityAnywhere(game, entityId);
  if (!loc) return { game, msgs: [] };
  const ent = loc.ent;
  const msgs: string[] = [];

  const armorPieces = armorPiecesOf(ent);
  if (armorPieces.length) {
    // 2+ pieces with no forced choice and a sink to defer into → the defender picks
    // which absorbs (armed after this resolution). Damage is fully prevented either way.
    if (armorPieces.length >= 2 && armorSink && !armorPieceId) {
      armorSink.push({ defender: loc.player, entityId, entityName: ent.name,
        candidates: armorPieces.map(p => ({ id: p.id, name: p.name, counters: p.counters ?? 0, armor: p.armor ?? 0 })) });
      msgs.push(`${ent.name}'s armor blocks! (choose which)`);
      return { game, msgs };
    }
    // Single piece, or a forced/auto choice → apply the counter now.
    const piece = armorPieceId ? armorPieces.find(p => p.id === armorPieceId) ?? pickDefaultArmor(armorPieces) : pickDefaultArmor(armorPieces);
    const r = applyArmorCounter(game, entityId, piece.id);
    return { game: r.game, msgs: [...msgs, ...r.msgs] };
  }

  const floor = hasModifier(ent, 'hpFloor1') ? 1 : 0;
  const newHp = Math.max(floor, ent.hp - dmg);

  // The Player Character's HP is the single source of truth, mirrored to the
  // PlayerState headline HP (stats pane) so combat and the display stay married.
  if (ent.kind === 'pc') {
    const g = setPcHp(game, loc.player, entityId, newHp, sourcePlayer);
    msgs.push(newHp <= 0
      ? `💀 ${ent.name} (PC) is defeated!`
      : `${sourceName} hits ${ent.name} for ${dmg} (${newHp} HP left)`);
    return { game: g, msgs };
  }

  if (newHp <= 0) {
    msgs.push(`${sourceName} destroys ${ent.name}!`);
    let g = destroyEntity(game, entityId);
    if (hasRemovalTrigger(ent)) {
      const rt = resolveRemovalTriggers(g, ent, loc.player, sink, armorSink);
      g = rt.game; msgs.push(...rt.msgs);
    }
    return { game: g, msgs };
  }
  msgs.push(`${sourceName} hits ${ent.name} for ${dmg} (${newHp} HP left)`);
  return { game: updateEntity(game, entityId, { hp: newHp }), msgs };
}

/** Apply one queued combat hit to `ctx.hitQueue[0]`, recording a DamageEvent for
 *  combat triggers (armor-blocked hits are excluded — they deal no HP damage). */
function applyCombatHit(game: GameState, ctx: AttackCtx, armorPieceId?: string): GameState {
  const entityId = ctx.hitQueue[0];
  const beforeLoc = findEntityAnywhere(game, entityId);
  if (!beforeLoc) { ctx.hitQueue.shift(); return game; }
  const before = beforeLoc.ent;
  const r = applyDamage(game, entityId, ctx.dmg, ctx.attackerName, ctx.attackerPlayer, ctx.deadSink, armorPieceId);
  ctx.msgs.push(...r.msgs);
  const after = findEntityAnywhere(r.game, entityId);
  const tookDamage = !after || after.ent.hp < before.hp; // armor-blocked hits don't count
  if (ctx.dmg > 0 && tookDamage) ctx.events.push({
    id: entityId, kind: before.kind, owner: beforeLoc.player,
    physical: before.kind === 'construct' && isPhysicalConstruct(before),
    destroyed: !after,
  });
  ctx.hitQueue.shift();
  return r.game;
}

/** Drive a (possibly resumed) attack to completion, or pause for an Armor choice.
 *  `ctx` is mutated in place — callers pass a fresh/cloned ctx. Returns either the
 *  finished game, or a `PendingArmor` to arm when a 2+armor character is hit. */
function driveAttack(game: GameState, ctx: AttackCtx):
  | { done: true; game: GameState; ctx: AttackCtx }
  | { done: false; game: GameState; pendingArmor: PendingArmor } {
  let g = game;

  if (ctx.phase === 'damage') {
    while (ctx.hitQueue.length > 0) {
      const entityId = ctx.hitQueue[0];
      const loc = findEntityAnywhere(g, entityId);
      if (!loc) { ctx.hitQueue.shift(); continue; } // already removed by an earlier hit
      const pieces = armorPiecesOf(loc.ent);
      if (pieces.length >= 2) {
        // Pause: the defender chooses which piece absorbs this hit. The head of the
        // queue stays put so the choice resolves it.
        return { done: false, game: g, pendingArmor: {
          defender: loc.player, entityId, entityName: loc.ent.name,
          candidates: pieces.map(p => ({ id: p.id, name: p.name, counters: p.counters ?? 0, armor: p.armor ?? 0 })),
          ctx,
        } };
      }
      g = applyCombatHit(g, ctx); // 0 or 1 armor → resolve immediately
    }
    ctx.phase = 'after';
  }

  // After-phase (runs once, never pauses): combat triggers, Reckless, Hit & Run.
  const attLoc = findEntityAnywhere(g, ctx.charId);
  if (attLoc) {
    const attacker = attLoc.ent;
    if (combatTriggerEffects(attacker, 'onAttack').length || combatTriggerEffects(attacker, 'onDealDamage').length || combatTriggerEffects(attacker, 'onKill').length) {
      const ct = resolveCombatTriggers(g, attacker, ctx.attackerPlayer, ctx.events, ctx.armorSink);
      g = ct.game; ctx.msgs.push(...ct.msgs);
    }
  }
  if (ctx.reckless) {
    const aLoc = findEntityAnywhere(g, ctx.charId);
    if (aLoc) {
      const atkHp = Math.max(0, aLoc.ent.hp - 1);
      ctx.msgs.push(`${ctx.attackerName} takes 1 damage (Reckless)`);
      if (aLoc.ent.kind === 'pc') {
        g = setPcHp(g, aLoc.player, ctx.charId, atkHp); // mirrors the headline; recoil at 0 HP loses the game
      } else if (atkHp <= 0) {
        g = destroyEntity(g, ctx.charId);
        if (hasRemovalTrigger(aLoc.ent)) {
          const rt = resolveRemovalTriggers(g, aLoc.ent, aLoc.player, ctx.deadSink, ctx.armorSink);
          g = rt.game; ctx.msgs.push(...rt.msgs);
        }
      } else {
        g = updateEntity(g, ctx.charId, { hp: atkHp });
      }
    }
  }
  if (ctx.hitRun) {
    const aLoc = findEntityAnywhere(g, ctx.charId);
    if (aLoc) { g = updateEntity(g, ctx.charId, { statuses: grantHitRun(aLoc.ent) }); ctx.msgs.push(`${ctx.attackerName} may move again (Hit & Run)`); }
  }
  return { done: true, game: g, ctx };
}

/** Commit a finished attack: seal activation, clear selection, and arm any deferred
 *  Dead-Zone picks + Armor choices (the latter from combat triggers). */
function finalizeAttack(game: GameState, ctx: AttackCtx): GameState {
  return recomputeStatics({
    ...armPrompts(game, ctx.deadSink, ctx.armorSink),
    ...activationPatch(game, ctx.charId),
    selected: null,
  });
}

/** An optional "you may pay HP from your PC: +N attack damage" on-attack ability
 *  (Mara, the Sworn Sword). Returns the cost + bonus if the controller can pay, else null. */
function optionalAttackAbility(attacker: BoardEntity, game: GameState, side: 'p1' | 'p2'): { sourceName: string; payHP: number; bonus: number } | null {
  for (const clause of combatTriggerEffects(attacker, 'onAttack')) {
    if (!clause.optional || clause.cost?.kind !== 'payHP') continue;
    const bonus = clause.effects.reduce((sum, e) => e.op === 'attackBonus' ? sum + e.amount : sum, 0);
    if (bonus <= 0) continue;
    const pcLoc = pcIdOf(game, side);
    const pc = pcLoc ? findEntityAnywhere(game, pcLoc)?.ent : null;
    if (!pc || pc.hp <= clause.cost.amount) continue; // must keep ≥1 HP — never pay a lethal cost
    return { sourceName: clause.sourceName, payHP: clause.cost.amount, bonus };
  }
  return null;
}

/** Pay HP directly from a player's PC (a cost, not damage — armor/replacement don't apply). */
function payPcHp(game: GameState, side: 'p1' | 'p2', amount: number): GameState {
  const pcId = pcIdOf(game, side);
  const loc = pcId ? findEntityAnywhere(game, pcId) : null;
  if (!loc) return game;
  return setPcHp(game, side, loc.ent.id, Math.max(0, loc.ent.hp - amount));
}

/** Commit an attack: tap the attacker, build the hit queue (primary + Cleave), and drive
 *  it. `bonusDmg` is the optional on-attack bonus the player opted into (else 0). Returns
 *  the finished game (+log) or a mid-combat pause (PendingArmor already set on `game`). */
function commitAttack(game: GameState, charId: string, targetEntityId: string, bonusDmg: number):
  | { paused: true; game: GameState }
  | { paused: false; game: GameState; msg: string } {
  const attLoc = findEntityAnywhere(game, charId);
  const tgtLoc = findEntityAnywhere(game, targetEntityId);
  if (!attLoc || !tgtLoc) return { paused: false, game, msg: '' };
  const attacker = attLoc.ent;
  const oppPlayer: 'p1' | 'p2' = attLoc.player === 'p1' ? 'p2' : 'p1';

  const newGame = updateEntity(game, charId, { tapped: 'major', exhausted: true, acts: { ...attacker.acts, major: true } });
  const dmg = effectiveAttack(attacker, game) + attackDamageBonus(attacker, game, attLoc.player) + bonusDmg;
  const hitQueue = [targetEntityId];
  const acroMsgs: string[] = [];
  if (effectiveKeywords(attacker, game).includes('Cleave')) {
    const tgtSlot = findSlot(game[oppPlayer].board, targetEntityId);
    if (tgtSlot) for (const ls of (isFront(tgtSlot as SlotId) ? FRONT_SLOTS : BACK_SLOTS)) {
      const lineEnt = newGame[oppPlayer].board[ls];
      if (!lineEnt || lineEnt.id === targetEntityId) continue;
      if (isImmuneToSplash(lineEnt, game)) { acroMsgs.push(`${lineEnt.name} evades the Cleave (Acrobatics)`); continue; }
      hitQueue.push(lineEnt.id);
    }
  }
  const ctx: AttackCtx = {
    charId, attackerName: attacker.name, attackerPlayer: attLoc.player, dmg, hitQueue, phase: 'damage',
    reckless: effectiveKeywords(attacker, game).includes('Reckless'),
    hitRun: effectiveKeywords(attacker, game).includes('Hit & Run'),
    msgs: acroMsgs, events: [], deadSink: [], armorSink: [],
  };
  const res = driveAttack(newGame, ctx);
  if (!res.done) return { paused: true, game: { ...res.game, pendingArmor: res.pendingArmor } };
  return { paused: false, game: finalizeAttack(res.game, res.ctx), msg: res.ctx.msgs.join(' | ') };
}

function rollD6(): number { return 1 + Math.floor(Math.random() * 6); }

function amountValue(a: Amount, die: number, controlled: number): number {
  if (typeof a === 'number') return a;
  if ('die' in a) return die;
  if ('halfDie' in a) return Math.floor(die / 2);
  if ('halfDieUp' in a) return Math.ceil(die / 2);
  if ('perControlled' in a) return controlled;
  return 0;
}

/** Characters (companion or PC) on a player's board, optionally filtered to a row. */
function charsOf(game: GameState, side: 'p1' | 'p2', row?: 'front' | 'back'): string[] {
  return (Object.entries(game[side].board) as [SlotId, BoardEntity | undefined][])
    .filter(([slot, e]) => e && (e.kind === 'companion' || e.kind === 'pc')
      && (row === undefined || (row === 'front') === isFront(slot)))
    .map(([, e]) => e!.id);
}

function pcIdOf(game: GameState, side: 'p1' | 'p2'): string | null {
  const pc = Object.values(game[side].board).find(e => e?.kind === 'pc');
  return pc ? pc.id : null;
}

function companionIds(game: GameState, side: 'p1' | 'p2'): string[] {
  return Object.values(game[side].board).filter((e): e is BoardEntity => !!e && e.kind === 'companion').map(e => e.id);
}

function constructIds(game: GameState, pred: (e: BoardEntity) => boolean): string[] {
  const out: string[] = [];
  for (const side of ['p1', 'p2'] as const)
    for (const e of Object.values(game[side].board))
      if (e && e.kind === 'construct' && pred(e)) out.push(e.id);
  return out;
}

/** Target specs that require clicking a single board entity. */
const INTERACTIVE_SPECS: TargetSpec[] = [
  'anyCharacter', 'enemyCharacter', 'ownCharacter', 'otherCharacter',
  'anyCompanion', 'enemyCompanion', 'ownCompanion',
  'anyConstruct', 'physicalConstruct', 'magicalConstruct',
];
function isInteractiveSpec(spec: TargetSpec): boolean { return INTERACTIVE_SPECS.includes(spec); }

/** Eligible target ids for an interactive TargetSpec (used to highlight the board). */
function eligibleTargets(game: GameState, lp: 'p1' | 'p2', spec: TargetSpec): string[] {
  const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
  switch (spec) {
    case 'anyCharacter':   return [...charsOf(game, lp), ...charsOf(game, opp)];
    case 'enemyCharacter': return charsOf(game, opp);
    case 'ownCharacter':   return charsOf(game, lp);
    case 'anyCompanion':   return [...companionIds(game, lp), ...companionIds(game, opp)];
    case 'enemyCompanion': return companionIds(game, opp);
    case 'ownCompanion':   return companionIds(game, lp);
    case 'physicalConstruct': return constructIds(game, isPhysicalConstruct);
    case 'magicalConstruct':  return constructIds(game, e => e.subtype === 'Incantation');
    case 'anyConstruct':      return constructIds(game, () => true);
    default: return [];
  }
}

function conditionMet(game: GameState, lp: 'p1' | 'p2', cond: Condition): boolean {
  switch (cond.kind) {
    case 'controlsType': {
      return Object.values(game[lp].board).some(e => {
        if (!e) return false;
        const typeOk = cond.cardType === 'Construct' ? e.kind === 'construct' : e.kind === 'companion';
        return typeOk && (!cond.subtype || e.subtype === cond.subtype);
      });
    }
    case 'controlsCount': {
      const n = Object.values(game[lp].board).filter(e => e && (cond.of === 'companions' ? e.kind === 'companion' : e.kind === 'construct')).length;
      return n >= cond.min;
    }
    case 'willpowerAtLeast': return game[lp].willpower >= cond.value;
    default: return true;
  }
}

/**
 * Resolve a list of onPlay effects. `targetId` (if present) binds the single
 * interactive target. A single d6 is rolled per card and shared across die/halfDie
 * effects (e.g. Wrath of the Untamed Sky). Returns the new game + log lines.
 */
function resolveActionEffects(game: GameState, lp: 'p1' | 'p2', sourceName: string, effects: Effect[], targetId?: string, sourceId?: string, ctx?: EffectCtx, sink?: PendingDeadPick[], armorSink?: ArmorChoiceData[]): { game: GameState; msgs: string[] } {
  const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
  const die = rollD6();
  const usesDie = effects.some(e => (e.op === 'damage' || e.op === 'damageSelfPC') && typeof e.amount === 'object' && ('die' in e.amount || 'halfDie' in e.amount));
  const controlledCompanions = Object.values(game[lp].board).filter(e => e?.kind === 'companion').length;
  const msgs: string[] = [];
  if (usesDie) msgs.push(`Rolled ${die}`);
  let g = game;

  for (const e of effects) {
    switch (e.op) {
      case 'buff': {
        if (e.duration !== 'endOfTurn') break;
        const board = { ...g[lp].board };
        let touched = 0;
        for (const [slot, ent] of Object.entries(board) as [SlotId, BoardEntity | undefined][]) {
          if (!ent) continue;
          const inScope = e.scope === 'ownParty' ? (ent.kind === 'companion' || ent.kind === 'pc')
            : e.scope === 'ownCompanions' ? ent.kind === 'companion' : false;
          if (!inScope) continue;
          board[slot] = { ...ent, buffs: [...(ent.buffs ?? []), {
            ...(e.stat === 'atk' && e.amount != null ? { atk: e.amount } : {}),
            ...(e.grant ? { grant: e.grant } : {}),
            ...(e.modifiers ? { modifiers: e.modifiers } : {}),
            until: 'endOfTurn' as const, source: sourceName,
          }] };
          touched++;
        }
        g = { ...g, [lp]: { ...g[lp], board } };
        if (touched) {
          const parts = [e.stat === 'atk' && e.amount != null ? `+${e.amount} attack` : null, ...(e.grant ?? []), ...(e.modifiers ?? [])].filter(Boolean);
          msgs.push(`${parts.join(', ')} to ${touched} ${e.scope === 'ownParty' ? 'characters' : 'companions'} (until end of turn)`);
        }
        break;
      }
      case 'damage': {
        let amt = amountValue(e.amount, die, controlledCompanions);
        // Magic-Action damage modifiers (Burning Eye/Wildfire Sigil/Heart of the
        // Convergence): +N to each enemy character this action would damage.
        if (amt > 0 && e.target !== 'self') amt += ctx?.damageBonus ?? 0;
        let targets: string[] = [];
        if (e.splash === 'board' || e.target === 'allEnemies') targets = charsOf(g, opp);
        else if (e.target === 'frontLineEnemy') targets = charsOf(g, opp, 'front');
        else if (e.target === 'backLineEnemy') targets = charsOf(g, opp, 'back');
        else if (e.target === 'self') { if (sourceId) targets = [sourceId]; }
        else if (e.target === 'damagedController') { if (ctx?.damagedOwner) { const pid = pcIdOf(g, ctx.damagedOwner); if (pid) targets = [pid]; } }
        else if (e.splash === 'line' && targetId) {
          const slot = findEntityAnywhere(g, targetId)?.slot;
          if (slot) targets = charsOf(g, opp, isFront(slot) ? 'front' : 'back');
        } else if (targetId) targets = [targetId];
        for (const tid of targets) {
          const r = applyDamage(g, tid, amt, sourceName, lp, sink, undefined, armorSink);
          g = r.game; msgs.push(...r.msgs);
        }
        break;
      }
      case 'damageSelfPC': {
        const amt = amountValue(e.amount, die, controlledCompanions);
        const pcId = pcIdOf(g, lp);
        if (pcId && amt > 0) { const r = applyDamage(g, pcId, amt, sourceName, opp, sink, undefined, armorSink); g = r.game; msgs.push(...r.msgs); }
        break;
      }
      case 'heal': {
        const amt = amountValue(e.amount, die, controlledCompanions);
        let ids: string[] = [];
        if (e.target === 'self') { if (sourceId) ids = [sourceId]; }
        else if (e.target === 'ownParty') ids = charsOf(g, lp);
        else if (isInteractiveSpec(e.target) && targetId) ids = [targetId];
        for (const id of ids) {
          const loc = findEntityAnywhere(g, id);
          if (!loc) continue;
          const healed = Math.min(effectiveMaxHp(loc.ent, g), loc.ent.hp + amt);
          if (healed !== loc.ent.hp) {
            // A healed PC mirrors to the headline HP (PC entity = source of truth).
            g = loc.ent.kind === 'pc' ? setPcHp(g, loc.player, id, healed) : updateEntity(g, id, { hp: healed });
            msgs.push(`${loc.ent.name} heals to ${healed} HP`);
          }
        }
        break;
      }
      case 'draw': {
        if (e.if && !conditionMet(g, lp, e.if)) break;
        let drawn = 0;
        for (let i = 0; i < e.count; i++) {
          const ps = g[lp];
          if (ps.deck.length === 0) break;
          const [d, ...rest] = ps.deck;
          g = { ...g, [lp]: { ...ps, deck: rest, hand: [...ps.hand, d] } };
          drawn++;
        }
        if (drawn) msgs.push(`Draw ${drawn}`);
        break;
      }
      case 'shuffleHandRedraw': {
        // "Target opponent shuffles their hand into their deck and draws that many
        //  cards minus one." (Convergence Sigil — offset -1.)
        const ops = g[opp];
        const n = ops.hand.length;
        const drawN = Math.max(0, n + (e.offset ?? 0));
        const reshuffled = shuffle([...ops.deck, ...ops.hand]);
        g = { ...g, [opp]: { ...ops, hand: reshuffled.slice(0, drawN), deck: reshuffled.slice(drawN) } };
        msgs.push(`Opponent shuffles ${n} card${n !== 1 ? 's' : ''} away, draws ${drawN}`);
        break;
      }
      case 'bounce': {
        // Return permanents (companions or constructs) to their owner's hand: a
        // single clicked target, or a group scope.
        let ids: string[] = [];
        if (isInteractiveSpec(e.target)) { if (targetId) ids = [targetId]; }
        else if (e.target === 'ownCompanions') ids = companionIds(g, lp);
        else if (e.target === 'allEnemyCompanions') ids = companionIds(g, opp);
        for (const id of ids) {
          const loc = findEntityAnywhere(g, id);
          if (!loc || loc.ent.kind === 'pc') continue; // can't bounce the Player Character
          const owner = loc.player;
          // Manifest (animated construct): sacrificed instead of returning to hand.
          if (loc.ent.statuses.includes('manifest')) {
            const mc = CATALOG.find(c => c.name === loc.ent.name);
            g = removeEntity(g, id);
            if (mc) g = { ...g, [owner]: { ...g[owner], dead: [...g[owner].dead, mc] } };
            msgs.push(`${loc.ent.name} is sacrificed (Manifest)`);
            continue;
          }
          const cardObj = CATALOG.find(c => c.name === loc.ent.name);
          // Companions drop their items to the Dead Zone; constructs have none.
          const items = [loc.ent.loadout?.weapon, ...(loc.ent.loadout?.gear ?? [])]
            .filter((it): it is EquippedItem => !!it)
            .map(it => CATALOG.find(c => c.name === it.name))
            .filter((c): c is Card => !!c);
          g = removeEntity(g, id);
          g = { ...g, [owner]: { ...g[owner],
            hand: cardObj ? [...g[owner].hand, cardObj] : g[owner].hand,
            dead: items.length ? [...g[owner].dead, ...items] : g[owner].dead,
          } };
          msgs.push(`${loc.ent.name} returns to ${owner === lp ? 'your' : "owner's"} hand`);
        }
        break;
      }
      case 'extraAttack': {
        if (!targetId) break;
        const loc = findEntityAnywhere(g, targetId);
        if (!loc) break;
        g = updateEntity(g, targetId, { acts: { ...loc.ent.acts, major: false }, exhausted: false, tapped: 'none' });
        msgs.push(`${loc.ent.name} may attack an additional time`);
        break;
      }
      case 'forceAttack': {
        if (!targetId) break;
        const attackers = charsOf(g, lp, 'front').filter(id => findEntityAnywhere(g, id)?.ent.kind === 'companion');
        for (const aid of attackers) {
          if (!findEntityAnywhere(g, targetId)) break; // target already removed
          const aloc = findEntityAnywhere(g, aid);
          if (!aloc) continue;
          const dmg = effectiveAttack(aloc.ent, g);
          const r = applyDamage(g, targetId, dmg, aloc.ent.name, lp, sink, undefined, armorSink);
          g = r.game; msgs.push(...r.msgs);
          g = updateEntity(g, aid, { acts: { ...aloc.ent.acts, major: true }, exhausted: true, tapped: 'major' });
        }
        break;
      }
      case 'anchor': {
        // Group: add/remove anchors on every Physical Construct you control (Grudrik).
        if (e.target === 'ownPhysicalConstructs') {
          const ids = (Object.values(g[lp].board) as (BoardEntity | undefined)[])
            .filter((x): x is BoardEntity => !!x && isPhysicalConstruct(x)).map(x => x.id);
          let touched = 0;
          for (const id of ids) {
            const loc = findEntityAnywhere(g, id);
            if (!loc) continue;
            const next = Math.max(0, (loc.ent.anchors ?? 0) + e.delta);
            if (e.delta < 0 && next <= 0) g = removeEntity(g, id);
            else g = updateEntity(g, id, { anchors: next });
            touched++;
          }
          if (touched) msgs.push(`${e.delta > 0 ? '+' : ''}${e.delta} anchor to ${touched} Physical Construct${touched > 1 ? 's' : ''}`);
          break;
        }
        if (!targetId) break;
        const loc = findEntityAnywhere(g, targetId);
        if (!loc) break;
        const cur = loc.ent.anchors ?? 0;
        const next = Math.max(0, cur + e.delta);
        if (e.delta < 0 && next <= 0) { g = destroyEntity(g, targetId); msgs.push(`${loc.ent.name} loses its last anchor — sacrificed!`); }
        else { g = updateEntity(g, targetId, { anchors: next }); msgs.push(`${loc.ent.name} anchors ${cur} → ${next}`); }
        break;
      }
      case 'animate': {
        // Animate Magic X: a Magical (Incantation) Construct you control becomes an X/X
        // Manifest companion, retaining its text and Anchor counters. (Leave-sacrifice
        // handled via the 'manifest' status in bounce.) Target is either a single clicked
        // construct, or the group 'ownMagicalConstructs' (up to `max`, excluding the
        // source — e.g. The Verdant Still animates up to two; interim auto-picks).
        let ids: string[] = [];
        if (e.target === 'ownMagicalConstructs') {
          ids = (Object.values(g[lp].board) as (BoardEntity | undefined)[])
            .filter((x): x is BoardEntity => !!x && x.kind === 'construct' && x.subtype === 'Incantation' && x.id !== sourceId)
            .map(x => x.id);
          if (e.max != null) ids = ids.slice(0, e.max);
        } else if (targetId) {
          ids = [targetId];
        }
        for (const id of ids) {
          const loc = findEntityAnywhere(g, id);
          if (!loc || loc.ent.kind !== 'construct' || loc.ent.subtype !== 'Incantation') continue;
          g = updateEntity(g, id, {
            kind: 'companion', atk: e.atk, hp: e.hp, maxHp: e.hp, subtype: 'Manifest',
            fresh: true, statuses: [...loc.ent.statuses, 'manifest'],
          });
          msgs.push(`${loc.ent.name} animates as a ${e.atk}/${e.hp} Manifest`);
        }
        break;
      }
      case 'dieCheck': {
        const roll = rollD6();
        const pass = roll >= e.threshold;
        msgs.push(`Rolled ${roll} — ${pass ? 'success' : 'fail'}`);
        const r = resolveActionEffects(g, lp, sourceName, pass ? e.onPass : e.onFail, targetId, sourceId, ctx, sink, armorSink);
        g = r.game; msgs.push(...r.msgs);
        break;
      }
      case 'returnFromDead': {
        // Recover a card from the controller's Dead Zone (Memory Stone onDestroy). If a
        // `sink` was supplied, defer to a player-facing picker (the calling reducer arms
        // `pendingDeadPick`); otherwise auto-pick the most-recent eligible card.
        if (e.to !== 'hand') break;
        const dead = g[lp].dead;
        const options = dead.map((card, idx) => ({ card, idx })).filter(o => !e.cardType || o.card.type === e.cardType);
        if (options.length === 0) { msgs.push('Dead Zone has no eligible card'); break; }
        if (sink) {
          sink.push({ source: sourceName, lp, sourceId, options, postEffects: [], optional: false });
          msgs.push('Choose a card to return from the Dead Zone');
          break;
        }
        const pick = options[options.length - 1].idx;
        const card = dead[pick];
        g = { ...g, [lp]: { ...g[lp], dead: dead.filter((_, i) => i !== pick), hand: [...g[lp].hand, card] } };
        msgs.push(`Returned ${card.name} from the Dead Zone to hand`);
        break;
      }
      case 'exhaustSelf': {
        if (!sourceId) break;
        const loc = findEntityAnywhere(g, sourceId);
        if (!loc) break;
        g = updateEntity(g, sourceId, { exhausted: true, tapped: 'major' });
        msgs.push(`${loc.ent.name} is exhausted`);
        break;
      }
      // Remaining ops (move slot-pick, two-target attacks, sacrificeItem, deckPeek…) — later slices.
    }
  }
  return { game: g, msgs };
}

/** The interactive target an effect needs (the single board pick), or null. */
function effectTargetSpec(e: Effect): TargetSpec | null {
  switch (e.op) {
    case 'damage': return e.splash === 'board' ? null : (isInteractiveSpec(e.target) ? e.target : null);
    case 'heal':
    case 'bounce':
    case 'extraAttack':
    case 'anchor':
    case 'sacrificeItem':
    case 'animate':
    case 'forceAttack': return isInteractiveSpec(e.target) ? e.target : null;
    case 'dieCheck': {
      // The branch effects choose the target up-front (declared before the roll).
      for (const sub of [...e.onPass, ...e.onFail]) { const t = effectTargetSpec(sub); if (t) return t; }
      return null;
    }
    default: return null;
  }
}

// ─── Attacker-side combat triggers (onAttack / onDealDamage / onKill) ──────────
/** Extra context threaded into the interpreter (combat triggers, Magic-Action mods). */
interface EffectCtx {
  damagedOwner?: 'p1' | 'p2';   // for target:'damagedController'
  damageBonus?: number;         // +dmg per enemy character a Magic Action damages
}

/** One record of damage the attacker dealt this combat (used to fire combat triggers). */
interface DamageEvent {
  id: string;
  kind: BoardEntity['kind'];
  owner: 'p1' | 'p2';
  physical: boolean;   // construct that is a Physical Construct
  destroyed: boolean;  // removed from the board by this damage
}

/** A clause (effects + gate + label) drawn from an entity's combat triggers. */
interface CombatClause { effects: Effect[]; if?: Condition; sourceName: string; optional?: boolean; cost?: Cost }

/** Combat-trigger clauses from an entity's own card AND its equipped items. */
function combatTriggerEffects(ent: BoardEntity, trigger: Trigger): CombatClause[] {
  const out: CombatClause[] = [];
  const collect = (name: string) => {
    const card = CATALOG.find(c => c.name === name);
    for (const ce of card?.effects ?? [])
      if (ce.trigger === trigger) out.push({ effects: ce.effects, if: ce.if, sourceName: name, optional: ce.optional, cost: ce.cost });
  };
  collect(ent.name);
  const lo = ent.loadout;
  if (lo) for (const it of [lo.weapon, ...lo.gear]) if (it) collect(it.name);
  return out;
}

/** Does a combat-trigger event satisfy a clause's `if` gate? */
function eventMatches(cond: Condition | undefined, ev: DamageEvent, attackerOwner: 'p1' | 'p2'): boolean {
  if (!cond) return true;
  switch (cond.kind) {
    case 'damagedIsEnemyCompanion': return ev.kind === 'companion' && ev.owner !== attackerOwner;
    case 'killedIsCompanion': return ev.kind === 'companion';
    case 'killedIsPhysicalConstruct': return ev.kind === 'construct' && ev.physical;
    default: return true; // board-state conditions don't gate combat events
  }
}

/**
 * Fire an attacker's onAttack/onDealDamage/onKill triggers after combat damage.
 * onAttack fires once; the per-target triggers fire once per matching damage event.
 * Interactive targets are auto-picked to the attacker's own side (no mid-combat prompt).
 */
function resolveCombatTriggers(game: GameState, attacker: BoardEntity, attackerOwner: 'p1' | 'p2', events: DamageEvent[], armorSink?: ArmorChoiceData[]): { game: GameState; msgs: string[] } {
  let g = game;
  const msgs: string[] = [];
  const run = (clause: CombatClause, ctx?: EffectCtx) => {
    let targetId: string | undefined;
    const spec = actionTargetSpec(clause.effects);
    if (spec) {
      const elig = eligibleTargets(g, attackerOwner, spec).filter(id => findEntityAnywhere(g, id)?.player === attackerOwner);
      if (elig.length === 0) return; // no own target — fizzle
      targetId = elig[0];
    }
    const r = resolveActionEffects(g, attackerOwner, clause.sourceName, clause.effects, targetId, attacker.id, ctx, undefined, armorSink);
    g = r.game;
    if (r.msgs.length) msgs.push(`${clause.sourceName}: ${r.msgs.join(' | ')}`);
  };

  for (const clause of combatTriggerEffects(attacker, 'onAttack'))
    if (!clause.if || conditionMet(g, attackerOwner, clause.if)) run(clause);
  for (const clause of combatTriggerEffects(attacker, 'onDealDamage'))
    for (const ev of events) if (eventMatches(clause.if, ev, attackerOwner)) run(clause, { damagedOwner: ev.owner });
  for (const clause of combatTriggerEffects(attacker, 'onKill'))
    for (const ev of events) if (ev.destroyed && eventMatches(clause.if, ev, attackerOwner)) run(clause);

  return { game: g, msgs };
}

/**
 * Fire an entity's onDestroy/onLeave triggers (its own card + equipped items, e.g.
 * Memory Stone) as it is removed. Resolved for the entity's controller; interactive
 * targets auto-pick the first own-side eligible. Called from applyDamage's destroy
 * branch (other removal paths — bounce/sacrifice — are not yet hooked).
 */
function resolveRemovalTriggers(game: GameState, ent: BoardEntity, controller: 'p1' | 'p2', sink?: PendingDeadPick[], armorSink?: ArmorChoiceData[]): { game: GameState; msgs: string[] } {
  let g = game;
  const msgs: string[] = [];
  for (const trig of ['onDestroy', 'onLeave'] as const) {
    for (const clause of combatTriggerEffects(ent, trig)) {
      if (clause.if && !conditionMet(g, controller, clause.if)) continue;
      let targetId: string | undefined;
      const spec = actionTargetSpec(clause.effects);
      if (spec) {
        const elig = eligibleTargets(g, controller, spec).filter(id => findEntityAnywhere(g, id)?.player === controller);
        if (elig.length === 0) continue;
        targetId = elig[0];
      }
      const r = resolveActionEffects(g, controller, clause.sourceName, clause.effects, targetId, ent.id, undefined, sink, armorSink);
      g = r.game;
      if (r.msgs.length) msgs.push(`${clause.sourceName}: ${r.msgs.join(' | ')}`);
    }
  }
  return { game: g, msgs };
}

/** Does this entity have any removal trigger (onDestroy/onLeave) on its card or items? */
function hasRemovalTrigger(ent: BoardEntity): boolean {
  return combatTriggerEffects(ent, 'onDestroy').length > 0 || combatTriggerEffects(ent, 'onLeave').length > 0;
}

/** Turn a sink of deferred Dead-Zone picks into a store patch: arm the first, queue the
 *  rest. Returns `{}` when empty so spreading it never clobbers an existing prompt. */
function armDeadPicks(sink: PendingDeadPick[]): { pendingDeadPick?: PendingDeadPick; pendingDeadPickQueue?: PendingDeadPick[] } {
  return sink.length ? { pendingDeadPick: sink[0], pendingDeadPickQueue: sink.slice(1) } : {};
}

/** Arm the next deferred non-combat Armor choice, re-deriving candidates against the
 *  current board (a piece sacrificed by an earlier choice drops out; a lone remaining
 *  piece auto-absorbs with no prompt). Returns the updated game + the PendingArmor to
 *  show, or null when the queue is exhausted. */
function armNextArmorChoice(game: GameState, queue: ArmorChoiceData[]): { game: GameState; pendingArmor: PendingArmor | null } {
  let g = game;
  const rest = [...queue];
  while (rest.length) {
    const c = rest.shift()!;
    const loc = findEntityAnywhere(g, c.entityId);
    if (!loc) continue; // entity gone since
    const pieces = armorPiecesOf(loc.ent);
    if (pieces.length >= 2) {
      return { game: g, pendingArmor: {
        defender: c.defender, entityId: c.entityId, entityName: loc.ent.name,
        candidates: pieces.map(p => ({ id: p.id, name: p.name, counters: p.counters ?? 0, armor: p.armor ?? 0 })),
        queue: rest,
      } };
    }
    if (pieces.length === 1) g = applyArmorCounter(g, c.entityId, pieces[0].id).game; // no choice left
    // 0 pieces → nothing to absorb with; skip
  }
  return { game: g, pendingArmor: null };
}

/** End-of-resolution patch arming any deferred Dead-Zone + Armor prompts. */
function armPrompts(game: GameState, deadSink: PendingDeadPick[], armorSink: ArmorChoiceData[]): GameState {
  const a = armNextArmorChoice(game, armorSink);
  return { ...a.game, ...armDeadPicks(deadSink), pendingArmor: a.pendingArmor };
}

/**
 * A reactive Dead-Zone prompt owned by the OTHER player (e.g. the defender's Memory
 * Stone, fired by the attacker's kill) HOLDS the active player until it resolves —
 * otherwise the active player's continued actions would broadcast wholesale and clobber
 * the owner's resolution (the owner's modal already serializes their own side).
 * Returns the blocking source name, or null. The owner is never held by their own pick.
 */
export function reactiveHold(game: GameState, localPlayer: 'p1' | 'p2'): string | null {
  const dp = game.pendingDeadPick;
  if (dp && dp.lp !== localPlayer) return dp.source;
  // A mid-combat Armor choice owned by the opponent (defender) holds the attacker
  // until it resolves, so the attacker's broadcasts don't clobber the resolution.
  const pa = game.pendingArmor;
  if (pa && pa.defender !== localPlayer) return `${pa.entityName}'s armor`;
  // The opponent's pre-attack pay-HP choice (Mara) — same clobber risk.
  const pac = game.pendingAttackChoice;
  if (pac && pac.lp !== localPlayer) return `${pac.sourceName} (attack choice)`;
  return null;
}

// ─── Damage modifiers (passive, consulted by the damage pipeline) ──────────────
/** Sum of static `magicDamageBonus` from an entity's own card + its equipped items. */
function staticMagicBonusOf(ent: BoardEntity): number {
  let sum = 0;
  const names = [ent.name];
  const lo = ent.loadout;
  if (lo) for (const it of [lo.weapon, ...lo.gear]) if (it) names.push(it.name);
  for (const name of names)
    for (const ce of CATALOG.find(c => c.name === name)?.effects ?? [])
      if (ce.trigger === 'static') for (const e of ce.effects) if (e.op === 'magicDamageBonus') sum += e.amount;
  return sum;
}

/** Total Magic-Action damage bonus a player's board projects (Burning Eye etc.). */
function magicActionDamageBonus(game: GameState, lp: 'p1' | 'p2'): number {
  let sum = 0;
  for (const ent of Object.values(game[lp].board)) if (ent) sum += staticMagicBonusOf(ent);
  return sum;
}

/** Does any permanent (card or item) this player controls project `preventAnchorDecay`
 *  (Master of Foundations)? Their Physical Constructs then skip start-of-turn decay. */
function controlsPreventAnchorDecay(ps: PlayerState): boolean {
  for (const ent of Object.values(ps.board)) {
    if (!ent) continue;
    const names = [ent.name];
    const lo = ent.loadout;
    if (lo) for (const it of [lo.weapon, ...lo.gear]) if (it) names.push(it.name);
    for (const name of names)
      for (const ce of CATALOG.find(c => c.name === name)?.effects ?? [])
        if (ce.trigger === 'static') for (const e of ce.effects) if (e.op === 'preventAnchorDecay') return true;
  }
  return false;
}

/** EffectCtx carrying a Magic-Action damage bonus, when the source is a Magic Action. */
function magicCtx(game: GameState, lp: 'p1' | 'p2', card?: Card): EffectCtx | undefined {
  if (!card || card.subtype !== 'Magic') return undefined;
  const b = magicActionDamageBonus(game, lp);
  return b > 0 ? { damageBonus: b } : undefined;
}

/** +damage on this attacker's attacks from `attackBonus` onAttack clauses (Scorching Brand). */
function attackDamageBonus(attacker: BoardEntity, game: GameState, side: 'p1' | 'p2'): number {
  let sum = 0;
  for (const clause of combatTriggerEffects(attacker, 'onAttack')) {
    if (clause.optional) continue; // "you may pay…" bonuses are added only if the player opts in
    if (clause.if && !conditionMet(game, side, clause.if)) continue;
    for (const e of clause.effects) if (e.op === 'attackBonus') sum += e.amount;
  }
  return sum;
}

/** A permanent's structured effects for a given trigger (looked up from CATALOG by name). */
function permanentEffects(ent: BoardEntity, trigger: Trigger): Effect[] {
  const card = CATALOG.find(c => c.name === ent.name);
  return (card?.effects ?? []).filter(c => c.trigger === trigger).flatMap(c => c.effects);
}

export interface ActivatedAbility {
  sourceName: string;      // the card the ability comes from (entity or equipped item)
  itemId?: string;         // set when the ability is on an equipped item
  cost?: Cost;
  effects: Effect[];
  oncePerTurn?: boolean;
  label: string;           // short button label
}

/** Gather an entity's activated abilities: its own card's + its equipped items'. */
export function gatherActivated(ent: BoardEntity): ActivatedAbility[] {
  const out: ActivatedAbility[] = [];
  const push = (name: string, itemId: string | undefined, fromName: string) => {
    const card = CATALOG.find(c => c.name === name);
    for (const ce of card?.effects ?? []) {
      if (ce.trigger !== 'activated') continue;
      out.push({ sourceName: fromName, itemId, cost: ce.cost, effects: ce.effects, oncePerTurn: ce.oncePerTurn, label: fromName });
    }
  };
  push(ent.name, undefined, ent.name);
  const lo = ent.loadout;
  if (lo) for (const it of [lo.weapon, ...lo.gear]) if (it) push(it.name, it.id, it.name);
  return out;
}

/** Status marker (in ent.statuses) recording a once-per-turn ability has fired. */
export function abilityUsedTag(sourceName: string): string { return `ability-used:${sourceName}`; }

/** Slice a peek request against the current deck into a live PendingPeek (or null
 *  if that deck is now empty). Re-sliced at arm time so a prior reorder can't stale it. */
function buildPeek(game: GameState, req: PeekRequest): PendingPeek | null {
  const cards = game[req.deckSide].deck.slice(0, req.look);
  if (cards.length === 0) return null;
  return { source: req.source, lp: req.lp, deckSide: req.deckSide, cards, dests: req.dests, maxHand: req.maxHand };
}

/** Pop the next valid peek off a queue, skipping any whose deck is now empty. */
function nextPeek(game: GameState, queue: PeekRequest[]): { peek: PendingPeek | null; rest: PeekRequest[] } {
  const rest = [...queue];
  while (rest.length) {
    const p = buildPeek(game, rest.shift()!);
    if (p) return { peek: p, rest };
  }
  return { peek: null, rest: [] };
}

/**
 * Fire all start-of-turn effects for `side` (constructs and companions). A single
 * interactive enemy target is auto-picked (start of turn does not prompt — interim;
 * could become a choice later). Deck-peek and Dead-Zone-recovery ops are NOT resolved
 * here — they are collected for interactive modals queued after endTurn finishes.
 * Sources are snapshotted since the board may change.
 */
function resolveStartOfTurn(game: GameState, side: 'p1' | 'p2'): { game: GameState; msgs: string[]; peeks: PeekRequest[]; deadPicks: PendingDeadPick[]; armorChoices: ArmorChoiceData[] } {
  let g = game;
  const msgs: string[] = [];
  const peeks: PeekRequest[] = [];
  const deadPicks: PendingDeadPick[] = [];
  const armorChoices: ArmorChoiceData[] = [];
  const ids = Object.values(g[side].board).filter((e): e is BoardEntity => !!e).map(e => e.id);
  for (const id of ids) {
    const loc = findEntityAnywhere(g, id);
    if (!loc) continue; // removed by an earlier effect this step
    const allEffs = permanentEffects(loc.ent, 'startOfTurn');
    if (allEffs.length === 0) continue;
    // Defer deck-peeks to the interactive modal (own deck for now; "any deck" choice deferred).
    for (const e of allEffs)
      if (e.op === 'deckPeek') peeks.push({ source: loc.ent.name, lp: side, deckSide: side, look: e.look, dests: e.dests, maxHand: e.maxHand });
    // Defer Dead-Zone recovery (Library of Memory) to a picker; `postEffects` (e.g.
    // exhaustSelf) run only if a card is actually taken.
    const rfdIdx = allEffs.findIndex(e => e.op === 'returnFromDead');
    if (rfdIdx >= 0) {
      const rfd = allEffs[rfdIdx];
      const options = g[side].dead
        .map((card, idx) => ({ card, idx }))
        .filter(o => rfd.op === 'returnFromDead' && (!rfd.cardType || o.card.type === rfd.cardType));
      if (options.length > 0) {
        const postEffects = allEffs.slice(rfdIdx + 1).filter(e => e.op !== 'deckPeek' && e.op !== 'returnFromDead');
        deadPicks.push({ source: loc.ent.name, lp: side, sourceId: id, options, postEffects, optional: true });
      }
    }
    // Inline-resolve the remaining effects (everything before a deferred returnFromDead,
    // minus deck-peeks). Library has none here; most start-of-turn sources hit this path.
    const cutoff = rfdIdx >= 0 ? rfdIdx : allEffs.length;
    const effs = allEffs.slice(0, cutoff).filter(e => e.op !== 'deckPeek');
    if (effs.length === 0) continue;
    let targetId: string | undefined;
    const spec = actionTargetSpec(effs);
    if (spec) {
      const elig = eligibleTargets(g, side, spec).filter(t => t !== id);
      if (elig.length === 0) continue; // no legal target — fizzle this source
      targetId = elig[0];
    }
    const r = resolveActionEffects(g, side, loc.ent.name, effs, targetId, id, undefined, undefined, armorChoices);
    g = r.game;
    if (r.msgs.length) msgs.push(`${loc.ent.name}: ${r.msgs.join(' | ')}`);
  }
  return { game: g, msgs, peeks, deadPicks, armorChoices };
}

/** Does this Action need an interactive target chosen on the board before resolving? */
function actionTargetSpec(effects: Effect[]): TargetSpec | null {
  for (const e of effects) {
    const t = effectTargetSpec(e);
    if (t) return t;
  }
  return null;
}

/** A two-step action (pick own char, then a slot or an enemy), or null. */
function twoStepKind(effects: Effect[]): 'reposition' | 'disarm' | 'moveAnchor' | null {
  for (const e of effects) {
    if (e.op === 'move' && e.to === 'anySlot' && e.target === 'ownCharacter') return 'reposition';
    if (e.op === 'attackDisarm') return 'disarm';
    if (e.op === 'moveAnchor') return 'moveAnchor';
  }
  return null;
}

/** Ids of the Physical Constructs a player controls (Field Engineer's endpoints). */
function ownPhysicalConstructIds(game: GameState, lp: 'p1' | 'p2'): string[] {
  return (Object.values(game[lp].board) as (BoardEntity | undefined)[])
    .filter((e): e is BoardEntity => !!e && isPhysicalConstruct(e)).map(e => e.id);
}

/**
 * Equip a hand item `card` onto `entityId`: weapon → weapon slot (old weapon back to
 * hand), gear → first empty gear slot (heavy fills both). Removes the item from `lp`'s
 * hand. Does NOT spend an action — callers add the action cost when appropriate (the
 * normal Minor-action equip does; on-enter "equip from hand" does not).
 */
/** Weapon/heavy classification for a hand item (drives slot placement + the capacity
 *  gate in equipItem). Sniffed from itemKind/subtype/text — the deck data has no
 *  structured field for it yet. */
function itemProfileOf(card: Card): { isWeapon: boolean; isHeavy: boolean } {
  const isWeapon = card.itemKind?.toLowerCase().includes('weapon') ||
                   (card.type === 'Item' && (card.subtype?.toLowerCase().includes('weapon') || card.subtype?.toLowerCase().includes('sword') || card.subtype?.toLowerCase().includes('bow') || card.subtype?.toLowerCase().includes('staff') || card.subtype?.toLowerCase().includes('dagger') || card.subtype?.toLowerCase().includes('axe') || card.subtype?.toLowerCase().includes('mace') || card.subtype?.toLowerCase().includes('wand')));
  return { isWeapon: !!isWeapon, isHeavy: !!card.text?.toLowerCase().includes('heavy') };
}

function equipOnto(game: GameState, lp: 'p1' | 'p2', entityId: string, card: Card): GameState {
  const loc = findEntityAnywhere(game, entityId);
  if (!loc) return game;
  const loadout = loc.ent.loadout ?? { weapon: null, gear: [] };
  const { isWeapon, isHeavy } = itemProfileOf(card);
  const armorMatch = card.text?.match(/armor\s+(\d+)/i);
  const armorVal = armorMatch ? parseInt(armorMatch[1]) : undefined;
  const equippedItem = {
    id: card.id, name: card.name, sub: card.subtype ?? '',
    hands: card.text?.toLowerCase().includes('two-handed') ? 2 as const : 1 as const,
    heavy: isHeavy, armor: armorVal, counters: 0, text: card.text,
  };
  // Normalize gear to its two slots so the capacity checks see real holes.
  const newLoadout = { ...loadout, gear: [loadout.gear?.[0] ?? null, loadout.gear?.[1] ?? null] };
  let returnToHand: Card | null = null;
  if (isWeapon) {
    // Equipping over a weapon swaps the old one back to hand.
    if (newLoadout.weapon) returnToHand = CATALOG.find(c => c.name === newLoadout.weapon!.name) ?? null;
    newLoadout.weapon = equippedItem;
  } else if (isHeavy) {
    if (newLoadout.gear.some(Boolean)) return game; // heavy needs BOTH gear slots — never overwrite an item
    newLoadout.gear = [equippedItem, equippedItem];
  } else {
    const emptyIdx = newLoadout.gear.findIndex(g => !g);
    if (emptyIdx < 0) return game; // gear full — never overwrite (the displaced item would vanish)
    newLoadout.gear[emptyIdx] = equippedItem;
  }
  const g = updateEntity(game, entityId, { loadout: newLoadout });
  const newHand = g[lp].hand.filter(c => c.id !== card.id);
  const finalHand = returnToHand ? [...newHand, returnToHand] : newHand;
  return { ...g, [lp]: { ...g[lp], hand: finalHand } };
}

/** Kit-Master: the controller's other characters that have slot capacity to
 *  receive an item of the given kind (weapon vs gear, heavy needs both gear slots). */
function kitDests(game: GameState, controller: 'p1' | 'p2', exceptId: string, isWeapon: boolean, heavy: boolean): string[] {
  return (Object.values(game[controller].board) as (BoardEntity | undefined)[])
    .filter((e): e is BoardEntity => !!e && isCharacter(e) && e.id !== exceptId && canHoldItem(e, isWeapon, heavy))
    .map(e => e.id);
}

// ─── Game initialization ──────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makePc(id: string, name: string, cls: string, text: string): BoardEntity {
  return {
    id, kind: 'pc', name, cls, level: 1,
    hp: 20, maxHp: 20, keywords: [], statuses: [],   // Rules: PC starts at 20 HP (matches PlayerState)
    text, tapped: 'none', exhausted: false, acts: freshActs(),
    loadout: { weapon: null, gear: [] },
  };
}

/** Willpower = number of cards in your Class Zone. A card flipped face-down for a
 *  Special Action is just a "used this turn" marker (rendered faded) — it still counts
 *  toward Willpower, so spending a Special Action does NOT lower your Willpower stat.
 *  (Face-down cards flip back face-up at the start of your turn.) */
export function computeWillpower(classZone: ClassZoneCard[]): number {
  return classZone.length;
}

/** Effective willpower used for all checks (fleeing, level gating). Accounts for Dismayed. */
export function effectiveWillpower(ps: PlayerState): number {
  return Math.max(0, ps.willpower - (ps.dismayed ? 1 : 0));
}

/**
 * Build a fresh PlayerState from a shuffled 50-card deck.
 * Per the rules:
 *   1. Shuffle deck.
 *   2. Draw top card face-down → becomes the PC (identity hidden).
 *   3. Deal next 3 cards face-up to Class Zone.
 *   4. Deal next 5 cards to opening hand.
 *   5. Remaining 41 cards = draw pile.
 *   6. PC board slot is EMPTY until the player chooses placement (setup step 8).
 */
function dealPlayer(
  name: string,
  deckCards: Card[],
  pcId: string,
): PlayerState {
  const pile = shuffle([...deckCards]);

  // Step 2: top card = PC (face-down, identity hidden)
  const pcCard = pile.splice(0, 1)[0];
  const primaryClass = pcCard?.class1 ?? 'Classless';
  const pc = makePc(pcId, name, primaryClass, 'Your Player Character. Cannot attack unless a weapon is equipped.');
  // Store the hidden card ref on the entity (for Rogue bonus "Sleight of Hand")
  (pc as BoardEntity & { _hiddenCard?: Card })._hiddenCard = pcCard;

  // Step 3: Class Zone = next 3 cards
  const czRaw = pile.splice(0, 3);
  const classZone: ClassZoneCard[] = czRaw.map((c, i) => ({
    id: `cz-${pcId}-${i}`,
    cls: c.class1 || 'Classless',
    name: c.name,
    faceDown: false,
    cardData: c,
  }));

  // Step 4: Opening hand = next 5 cards
  const hand = pile.splice(0, 5);

  const willpower = computeWillpower(classZone);

  return {
    name,
    hp: 20, maxHp: 20,   // Rules: PC starts at 20 HP
    deck: pile,
    dead: [],
    willpower,
    classZone,
    board: {},            // PC slot is empty — player places it in setup
    hand,
    dismayed: false,
    _pc: pc,             // Stashed for placement step
  } as PlayerState & { _pc: BoardEntity };
}

/**
 * Make a fresh game state from two 50-card decks.
 * p1Cards / p2Cards are the full 50-card arrays for each player.
 */
export function makeNewGame(
  p1Name: string, p1Cards: Card[],
  p2Name: string, p2Cards: Card[],
): GameState {
  return {
    turn: 1,
    activePlayer: 'p1',
    // Start in CZ phase — setup modals (mulligan/classbonus/place-pc) run first,
    // then the CZExchangePanel enforces the mandatory exchange before P1's first actions.
    currentPhase: 'cz',
    selected: null,
    czExchangeUsed: false,
    currentActor: null,
    finishedActors: [],
    gameOver: null,
    pendingPeek: null,
    pendingPeekQueue: [],
    pendingDeadPick: null,
    pendingDeadPickQueue: [],
    pendingPoison: null,
    pendingArmor: null,
    pendingAttackChoice: null,
    setupQueue: [...SETUP_SEQUENCE],
    p1: dealPlayer(p1Name, p1Cards, 'pc-p1'),
    p2: dealPlayer(p2Name, p2Cards, 'pc-p2'),
  };
}


// ─── Store interface ──────────────────────────────────────────────────────────
interface GameStoreState {
  playPhase: PlayPhase;
  conn: ConnState;
  game: GameState;
  /** Which player the local user controls. 'p1' for host/solo, 'p2' for guest. */
  localPlayer: 'p1' | 'p2';
  hovered: { data: BoardEntity | Card; owner: string } | null;
  pending: PendingAction | null;
  pendingPlay: PendingPlay | null;
  /** On-enter keyword (Reinforce/Dismantle) awaiting a board target, or null. */
  pendingTrigger: PendingTrigger | null;
  /** Kit-Master two-step item move awaiting a board target, or null. */
  pendingKit: PendingKit | null;
  /** Action card awaiting a board target before its effects resolve, or null. */
  pendingActionTarget: PendingActionTarget | null;
  // NOTE: pendingPeek/pendingPeekQueue/pendingDeadPick/pendingDeadPickQueue moved INTO
  // `game` (see GameState) so they sync over multiplayer and route to the owning player.
  /** Equip-from-hand prompt (Veteran of the Ashgrove), or null. */
  pendingEquipPick: PendingEquipPick | null;
  toasts: { id: number; msg: string }[];
  /** Ordered queue of modal IDs to show. First item is the active modal. */
  modalQueue: string[];
  oathContext: OathContext | null;
  /** Saved in-progress game for resume. */
  savedGame: GameState | null;
  /** Set by the multiplayer hook to a no-op while connected; used purely as an
   *  "am I in multiplayer?" flag (the real sync is a store subscription → STATE_SYNC). */
  _broadcast: (() => void) | null;

  // Lobby / setup
  startSolo: (p1Cards: Card[], p2Cards: Card[], p1Name?: string, p2Name?: string) => void;
  startMultiplayer: (mode: 'host' | 'join', code: string, localPlayer: 'p1' | 'p2', p1Cards: Card[], p2Cards: Card[]) => void;
  backToLobby: () => void;
  setConn: (patch: Partial<ConnState>) => void;
  /** Place a PC on the board. targetPlayer defaults to localPlayer; during setup pass the owner. */
  placePc: (slot: SlotId, targetPlayer?: 'p1' | 'p2') => void;

  // Draw
  drawCard: (player: 'p1' | 'p2') => void;

  // Phase advancement (Draw → CZ → Action) and End Phase confirmation
  advancePhase: () => void;
  /** CZ phase → Action phase. Must be called from CZExchangePanel after a valid choice. */
  completeCzPhase: () => void;
  /** Move to End Phase (shows the phase before passing to opponent) */
  endTurnToEndPhase: () => void;

  // Sandbox: flip which side you're controlling
  switchSides: () => void;

  // Class Zone exchange (once per turn, CZ phase)
  czToHand: (czCardId: string) => void;
  handToCz: (handCardId: string) => void;

  // Equip item from hand to a character
  equipItem: (entityId: string, handCardId: string) => void;

  // Play an Action card from hand (manual playtest — moves to Dead Zone)
  playAction: (handCardId: string) => void;

  // Modals
  pushModal: (id: string) => void;
  advanceModal: () => void;
  /** Advance the serialized setup cursor (synced via game.setupQueue). */
  advanceSetup: () => void;
  setOathContext: (ctx: OathContext | null) => void;
  setGame: (updater: (g: GameState) => GameState) => void;

  // Multiplayer wiring
  setBroadcast: (fn: () => void) => void;
  clearBroadcast: () => void;

  // Persistence
  saveGame: () => void;
  resumeGame: () => void;
  clearSavedGame: () => void;

  // Selection + hover
  selectEntity: (id: string | null) => void;
  setHovered: (h: { data: BoardEntity | Card; owner: string } | null) => void;

  // Pile viewer (browse/search a dead zone)
  pileView: { player: 'p1' | 'p2'; zone: 'dead' } | null;
  openPile: (player: 'p1' | 'p2', zone: 'dead') => void;
  closePile: () => void;

  // Move
  beginMove: (charId: string) => void;
  resolveMove: (targetSlot: SlotId) => void;

  // Attack
  beginAttack: (charId: string) => void;
  resolveAttack: (targetEntityId: string) => void;
  /** Defender's mid-combat Armor pick — resolves `game.pendingArmor` and resumes the attack. */
  resolveArmor: (pieceId: string) => void;
  /** Resolve Mara's pre-attack optional ability — pay HP for +damage, or decline; commits the attack. */
  resolveAttackChoice: (accept: boolean) => void;

  // Cancel any pending action
  cancelPending: () => void;

  // Play card from hand
  beginPlay: (cardId: string) => void;
  cancelPlay: () => void;
  placeCard: (slot: SlotId) => void;

  // On-enter trigger targeting (Reinforce/Dismantle)
  resolveTrigger: (targetId: string) => void;
  cancelTrigger: () => void;

  // Kit-Master two-step item move targeting
  resolveKit: (targetId: string) => void;
  pickKitItem: (itemId: string) => void;
  cancelKit: () => void;

  // Action-card target selection
  resolveActionTarget: (targetId: string) => void;
  /** Step 2 of a two-step action when it's a slot pick (Tactical Reposition). */
  resolveActionSlot: (slot: SlotId) => void;
  cancelActionTarget: () => void;

  // Activated abilities (on companions / equipped items)
  activateAbility: (entityId: string, idx: number) => void;

  // Deck-peek (scry) resolution
  resolvePeek: (assignments: ('hand' | 'top' | 'bottom')[]) => void;
  cancelPeek: () => void;
  /** Dead-Zone recovery: take the dead card at `idx` (in the dead array) to hand. */
  resolveDeadPick: (idx: number) => void;
  cancelDeadPick: () => void;
  /** Equip-from-hand: equip the chosen item card onto the pending target. */
  resolveEquipPick: (handCardId: string) => void;
  cancelEquipPick: () => void;

  // Action bookkeeping
  markAction: (entityId: string, type: 'move' | 'minor' | 'major') => void;
  resetActions: (entityId: string) => void;

  // HP nudge (playtesting)
  adjustHp: (entityId: string, delta: number) => void;

  // Turn
  endTurn: () => void;

  // Toast
  pushToast: (msg: string) => void;
}

let toastId = 0;

const EMPTY_CONN: ConnState = {
  mode: 'solo', code: '', latency: null,
  opponentName: '', opponentAvatar: '', opponentStatus: 'waiting',
};

export const useGameStore = create<GameStoreState>()(
  subscribeWithSelector(
  persist(
  (set, get) => ({
  playPhase: 'lobby' as PlayPhase,
  conn: EMPTY_CONN,
  game: makeNewGame('You', SORCERER_WARRIOR_CARDS, 'Opponent', WIZARD_BUILDER_CARDS),
  localPlayer: 'p1' as 'p1' | 'p2',
  hovered: null,
  pending: null,
  pendingPlay: null,
  pendingTrigger: null,
  pendingKit: null,
  pendingActionTarget: null,
  pendingEquipPick: null,
  toasts: [],
  modalQueue: [],
  oathContext: null,
  savedGame: null,
  _broadcast: null,

  // ── Lobby ──────────────────────────────────────────────────────────────────
  startSolo: (p1Cards, p2Cards, p1Name = 'You', p2Name = 'Opponent') => set({
    playPhase: 'game',
    conn: { ...EMPTY_CONN, mode: 'solo', code: 'SANDBOX' },
    game: makeNewGame(p1Name, p1Cards, p2Name, p2Cards),
    localPlayer: 'p1',
    ...LOCAL_PROMPTS_CLEARED,
    // Setup is driven by the synced game.setupQueue (seeded in makeNewGame); modalQueue
    // is only for mid-game modals (oathsworn).
    modalQueue: [],
    oathContext: null, _broadcast: null,
  }),

  startMultiplayer: (mode, code, localPlayer, p1Cards, p2Cards) => {
    set({
      playPhase: 'game',
      conn: { ...EMPTY_CONN, mode, code },
      game: makeNewGame('You', p1Cards, 'Opponent', p2Cards),
      localPlayer,
      ...LOCAL_PROMPTS_CLEARED,
      // Setup is serialized via the synced game.setupQueue (seeded in makeNewGame); each
      // peer acts only on the steps it owns. modalQueue is for mid-game modals only.
      modalQueue: [],
      oathContext: null,
    });
  },

  placePc: (slot, targetPlayer) => set(s => {
    const tp = targetPlayer ?? s.localPlayer;
    // Serialized setup: only the player whose place-pc step is current may place.
    if (s.game.setupQueue[0] !== `place-pc:${tp}`) return s;
    const pc = s.game[tp]._pc;
    if (!pc) return s;
    if (!['b1','b2','b3'].includes(slot)) return s;
    if (s.game[tp].board[slot]) return s;
    const newBoard = { ...s.game[tp].board, [slot]: pc };
    const newPlayer = { ...s.game[tp], board: newBoard, _pc: undefined };
    // Advance the setup cursor past this place-pc step.
    const newSetupQueue = s.game.setupQueue.slice(1);
    const g = recomputeStatics({ ...s.game, [tp]: newPlayer, setupQueue: newSetupQueue });
    // First-player handicap: the player going first does NOT draw on Turn 1. Their turn
    // begins at the CZ phase (the draw is bundled into the prior endTurn, which never ran
    // for them) — so we deliberately do NOT add a draw here. The second player draws
    // normally via endTurn. (This is the sole first-player handicap; there is no Turn-1
    // Major-Action restriction.)
    return { game: g };
  }),

  backToLobby: () => {
    get()._broadcast && get().clearBroadcast();
    set({
      playPhase: 'lobby',
      conn: EMPTY_CONN,
      localPlayer: 'p1',
      ...LOCAL_PROMPTS_CLEARED,
      modalQueue: [], oathContext: null, _broadcast: null,
    });
  },

  setConn: (patch) => set(s => ({ conn: { ...s.conn, ...patch } })),

  // ── Modals ─────────────────────────────────────────────────────────────────
  pushModal: (id) => set(s => ({ modalQueue: [...s.modalQueue, id] })),
  advanceModal: () => set(s => ({ modalQueue: s.modalQueue.slice(1) })),
  advanceSetup: () => set(s => ({ game: { ...s.game, setupQueue: s.game.setupQueue.slice(1) } })),
  setOathContext: (ctx) => set({ oathContext: ctx }),
  setGame: (updater) => set(s => ({ game: updater(s.game) })),

  // ── Multiplayer wiring ─────────────────────────────────────────────────────
  setBroadcast: (fn) => set({ _broadcast: fn }),
  clearBroadcast: () => set({ _broadcast: null }),

  // ── Draw card ──────────────────────────────────────────────────────────────
  drawCard: (player) => set(s => {
    const ps = s.game[player];
    if (ps.deck.length === 0) return s;
    const [drawn, ...rest] = ps.deck;
    return { game: { ...s.game, [player]: { ...ps, deck: rest, hand: [...ps.hand, drawn] } } };
  }),

  // ── Switch sides (sandbox) ─────────────────────────────────────────────────
  switchSides: () => set(s => ({
    localPlayer: s.localPlayer === 'p1' ? 'p2' : 'p1',
    ...LOCAL_PROMPTS_CLEARED,
    // Cross-client prompts live in `game` and persist across a sandbox side-switch.
    game: { ...s.game, selected: null },
  })),

  // ── Phase advancement ──────────────────────────────────────────────────────
  /** Draw → CZ phase. */
  advancePhase: () => set(s => {
    const { currentPhase } = s.game;
    // Only advances draw→cz. CZ→action must go through completeCzPhase.
    const next: Phase = currentPhase === 'draw' ? 'cz' : currentPhase;
    return { game: { ...s.game, currentPhase: next } };
  }),

  /** CZ phase → Action phase. Called by CZExchangePanel after any valid choice (exchange or pass). */
  completeCzPhase: () => set(s => {
    if (s.game.currentPhase !== 'cz') return s;
    return { game: { ...s.game, currentPhase: 'action' as Phase } };
  }),

  // Move active player to End Phase (they confirm before passing the turn)
  endTurnToEndPhase: () => set(s => ({
    game: { ...s.game, currentPhase: 'end' as Phase },
  })),

  // ── Equip item ─────────────────────────────────────────────────────────────
  equipItem: (entityId, handCardId) => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
    const lp = s.localPlayer;
    const card = s.game[lp].hand.find(c => c.id === handCardId);
    if (!card || card.type !== 'Item') return s;
    const loc = findEntityAnywhere(s.game, entityId);
    if (!loc) return s;

    // Willpower requirement: must have Willpower ≥ the item's Level to play it.
    const wp = playWillpower(s.game[lp]);
    if (wp < card.level) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg: `Willpower ${wp} < level ${card.level} — can't equip ${card.name}.` }] };
    }

    // Atomic activation: can't return to a character once you've activated another.
    if (isSealed(s.game, entityId)) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg: `${loc.ent.name} has already finished its activation this turn.` }] };
    }

    // Slot capacity: 1 weapon (equipping swaps the old one back to hand) + 2 gear
    // (heavy takes both). Without this gate equipOnto no-ops and the Minor action
    // would be spent for nothing.
    const prof = itemProfileOf(card);
    if (!prof.isWeapon && !canHoldItem(loc.ent, false, prof.isHeavy)) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg: `${loc.ent.name} has no free gear slot for ${card.name}.` }] };
    }

    let g = equipOnto(s.game, lp, entityId, card);
    // Equipping as a turn action spends the equipper's Minor action.
    const e2 = findEntityAnywhere(g, entityId);
    if (e2) g = updateEntity(g, entityId, { acts: { ...e2.ent.acts, minor: true }, tapped: e2.ent.acts.major ? 'major' : 'minor' });
    return { game: { ...g, ...activationPatch(s.game, entityId) } };
  }),

  // ── Play Action card ───────────────────────────────────────────────────────
  // Interprets the card's onPlay effects. If an effect needs an interactive board
  // target, arms pendingActionTarget and waits for a click; otherwise resolves
  // immediately. Either way the card ends up in the Dead Zone.
  playAction: (handCardId) => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
    const lp = s.localPlayer;
    const card = s.game[lp].hand.find(c => c.id === handCardId);
    if (!card || card.type !== 'Action') return s;

    // ── Action economy ─────────────────────────────────────────────────────────
    // A card is played during a character's activation: the selected character
    // spends one of its available actions (Major/Minor) — or, for Special Action
    // cards, the Player Character flips a Class Zone card. The gate (class
    // requirement, Two-Handed-vs-Magic, budget, first-turn) lives in keywords.ts so
    // the store and the hand UI never disagree.
    const mkToast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
      return { id, msg };
    };
    // The activating character was captured when the card was armed (beginPlay), so
    // it survives the selection being cleared; fall back to the live selection.
    const actorId = s.pendingPlay?.actorId ?? s.game.selected;
    const actLoc = actorId ? findEntityAnywhere(s.game, actorId) : null;
    if (!actLoc || actLoc.player !== lp || !isCharacter(actLoc.ent)) {
      return { toasts: [...s.toasts, mkToast(`Select one of your characters to play ${card.name}.`)] };
    }
    const gate = canPlayActionCard(s.game, lp, actLoc.ent, card);
    if (!gate.ok) {
      return { toasts: [...s.toasts, mkToast(`Can't play ${card.name}: ${gate.reason}.`)] };
    }

    // Pay the cost up-front, before the counter check — a countered or fizzled card
    // still spent the action. All downstream branches read from this charged game.
    let g0: GameState = { ...s.game, ...activationPatch(s.game, actLoc.ent.id) };
    const cost = actionTypeOf(card);
    if (cost === 'Major') {
      g0 = updateEntity(g0, actLoc.ent.id, { acts: { ...actLoc.ent.acts, major: true }, exhausted: true, tapped: 'major' });
    } else if (cost === 'Minor') {
      g0 = updateEntity(g0, actLoc.ent.id, { acts: { ...actLoc.ent.acts, minor: true }, tapped: actLoc.ent.acts.major ? 'major' : 'minor' });
    } else { // Special — flip the first face-up Class Zone card (PC only; gated above)
      const czIdx = g0[lp].classZone.findIndex(c => !c.faceDown);
      const newCZ = g0[lp].classZone.map((c, i) => i === czIdx ? { ...c, faceDown: true } : c);
      g0 = { ...g0, [lp]: { ...g0[lp], classZone: newCZ, willpower: computeWillpower(newCZ) } };
    }

    // ── Counter check ──────────────────────────────────────────────────────────
    // If the opponent controls a counter ward and this action isn't uncounterable,
    // sacrifice the ward and send the action to the Dead Zone without resolving.
    const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
    const uncounterable = (card.effects ?? []).some(c => c.uncounterable);
    if (!uncounterable) {
      const wardEntry = (Object.entries(g0[opp].board) as [SlotId, BoardEntity | undefined][])
        .find(([, e]) => e && permanentEffects(e, 'onOpponentAction').some(ef => ef.op === 'counterAction'));
      if (wardEntry) {
        const ward = wardEntry[1]!;
        let g = removeEntity(g0, ward.id);
        const wardCard = CATALOG.find(c => c.name === ward.name);
        if (wardCard) g = { ...g, [opp]: { ...g[opp], dead: [...g[opp].dead, wardCard] } };
        g = { ...g, [lp]: { ...g[lp], hand: g[lp].hand.filter(c => c.id !== handCardId), dead: [...g[lp].dead, card] } };
        return { game: g, pendingPlay: null, toasts: [...s.toasts, mkToast(`${card.name} is countered by ${ward.name}!`)] };
      }
    }

    const onPlay = (card.effects ?? []).filter(c => c.trigger === 'onPlay').flatMap(c => c.effects);

    // Two-step action: pick one of your characters first (then a slot or an enemy).
    const ts = twoStepKind(onPlay);
    if (ts) {
      const eligibleIds = charsOf(g0, lp);
      const newHand = g0[lp].hand.filter(c => c.id !== handCardId);
      if (eligibleIds.length === 0) {
        return { game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] } }, pendingPlay: null, toasts: [...s.toasts, mkToast(`${card.name} fizzles — no character to act.`)] };
      }
      return {
        game: { ...g0, [lp]: { ...g0[lp], hand: newHand } },
        pendingPlay: null,
        pendingActionTarget: { source: 'action', sourceName: card.name, lp, effects: onPlay, eligibleIds, card, twoStep: ts },
      };
    }

    // Deck-peek action: move to Dead Zone and open the scry modal.
    const peek = onPlay.find(e => e.op === 'deckPeek');
    if (peek && peek.op === 'deckPeek') {
      const cards = g0[lp].deck.slice(0, peek.look);
      const newHand = g0[lp].hand.filter(c => c.id !== handCardId);
      if (cards.length === 0) {
        return { game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] } }, pendingPlay: null, toasts: [...s.toasts, mkToast(`${card.name} — deck is empty.`)] };
      }
      return {
        game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] },
          pendingPeek: { source: card.name, lp, deckSide: lp, cards, dests: peek.dests, maxHand: peek.maxHand } },
        pendingPlay: null,
      };
    }

    const spec = actionTargetSpec(onPlay);

    if (spec) {
      const eligibleIds = eligibleTargets(g0, lp, spec);
      const newHand = g0[lp].hand.filter(c => c.id !== handCardId);
      if (eligibleIds.length === 0) {
        // No legal target — fizzle to the Dead Zone rather than soft-lock.
        return {
          game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] } },
          pendingPlay: null,
          toasts: [...s.toasts, mkToast(`${card.name} fizzles — no legal target.`)],
        };
      }
      // Card goes on the "stack" (out of hand); resolves when a target is clicked.
      // sourceId = the acting character, so `target:'self'` ops (e.g. Conflagration's
      // "this character takes 1 damage") hit whoever played the card.
      return {
        game: { ...g0, [lp]: { ...g0[lp], hand: newHand } },
        pendingPlay: null,
        pendingActionTarget: { source: 'action', sourceName: card.name, lp, effects: onPlay, eligibleIds, card, sourceId: actLoc.ent.id },
      };
    }

    // No target needed — resolve now (buffs, board AoE, self-damage, draw).
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    const { game, msgs } = resolveActionEffects(g0, lp, card.name, onPlay, undefined, actLoc.ent.id, magicCtx(g0, lp, card), deadSink, armorSink);
    const newHand = game[lp].hand.filter(c => c.id !== handCardId);
    const finalG = { ...game, [lp]: { ...game[lp], hand: newHand, dead: [...game[lp].dead, card] } };
    return {
      game: armPrompts(finalG, deadSink, armorSink),
      pendingPlay: null,
      toasts: [...s.toasts, mkToast(msgs.length ? `${card.name}: ${msgs.join(' | ')}` : `Played: ${card.name}`)],
    };
  }),

  resolveActionTarget: (targetId) => set(s => {
    const pa = s.pendingActionTarget;
    if (!pa || !pa.eligibleIds.includes(targetId)) return s;

    // ── Two-step actions ──────────────────────────────────────────────────────
    if (pa.twoStep && !pa.firstId) {
      // Step 1: chose the first entity → arm step 2 (slot, enemy, or dest construct).
      if (pa.twoStep === 'reposition') {
        const emptySlots = [...FRONT_SLOTS, ...BACK_SLOTS].filter(sl => !s.game[pa.lp].board[sl]);
        return { pendingActionTarget: { ...pa, firstId: targetId, eligibleIds: [], eligibleSlots: emptySlots } };
      }
      if (pa.twoStep === 'moveAnchor') {
        // Step 2 picks the destination — any other own Physical Construct.
        const dests = ownPhysicalConstructIds(s.game, pa.lp).filter(id => id !== targetId);
        return { pendingActionTarget: { ...pa, firstId: targetId, eligibleIds: dests } };
      }
      const opp: 'p1' | 'p2' = pa.lp === 'p1' ? 'p2' : 'p1';
      return { pendingActionTarget: { ...pa, firstId: targetId, eligibleIds: charsOf(s.game, opp) } };
    }
    if (pa.twoStep === 'moveAnchor' && pa.firstId) {
      // Step 2: move N anchors from the source construct (firstId) to the chosen dest.
      const mv = pa.effects.find(e => e.op === 'moveAnchor');
      const count = mv && mv.op === 'moveAnchor' ? mv.count : 1;
      let g = s.game; const msgs: string[] = [];
      const srcLoc = findEntityAnywhere(g, pa.firstId);
      const dstLoc = findEntityAnywhere(g, targetId);
      if (srcLoc && dstLoc) {
        const moved = Math.min(count, srcLoc.ent.anchors ?? 0);
        g = updateEntity(g, targetId, { anchors: (dstLoc.ent.anchors ?? 0) + moved });
        const srcNext = (srcLoc.ent.anchors ?? 0) - moved;
        if (srcNext <= 0) { g = destroyEntity(g, pa.firstId); msgs.push(`${srcLoc.ent.name} loses its last anchor — sacrificed!`); }
        else g = updateEntity(g, pa.firstId, { anchors: srcNext });
        msgs.push(`Moved ${moved} anchor${moved !== 1 ? 's' : ''} ${srcLoc.ent.name} → ${dstLoc.ent.name}`);
      }
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
      return { game: recomputeStatics(g), pendingActionTarget: null, toasts: [...s.toasts, { id, msg: `${pa.sourceName}: ${msgs.join(' | ')}` }] };
    }
    if (pa.twoStep === 'disarm' && pa.firstId) {
      // Step 2: attacker (firstId) attacks the chosen enemy, then sacrifice an item on it.
      const attLoc = findEntityAnywhere(s.game, pa.firstId);
      let g = s.game; const msgs: string[] = []; const deadSink: PendingDeadPick[] = []; const armorSink: ArmorChoiceData[] = [];
      if (attLoc) {
        const dmg = effectiveAttack(attLoc.ent, g);
        const r = applyDamage(g, targetId, dmg, attLoc.ent.name, pa.lp, deadSink, undefined, armorSink); g = r.game; msgs.push(...r.msgs);
        const a2 = findEntityAnywhere(g, pa.firstId);
        if (a2) g = updateEntity(g, pa.firstId, { exhausted: true, tapped: 'major', acts: { ...a2.ent.acts, major: true } });
        const tLoc = findEntityAnywhere(g, targetId);
        const fi = tLoc ? firstItemOf(tLoc.ent) : null;
        if (tLoc && fi) {
          const lo = tLoc.ent.loadout!;
          const newLo = { weapon: lo.weapon?.id === fi.item.id ? null : lo.weapon, gear: lo.gear.map(x => x?.id === fi.item.id ? null : x) };
          g = updateEntity(g, targetId, { loadout: newLo });
          const itemCard = CATALOG.find(c => c.name === fi.item.name);
          if (itemCard) g = { ...g, [tLoc.player]: { ...g[tLoc.player], dead: [...g[tLoc.player].dead, itemCard] } };
          msgs.push(`${fi.item.name} sacrificed from ${tLoc.ent.name}`);
        } else if (tLoc) msgs.push(`${tLoc.ent.name} had no item to sacrifice`);
      }
      const finalGame = pa.card ? { ...g, [pa.lp]: { ...g[pa.lp], dead: [...g[pa.lp].dead, pa.card] } } : g;
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
      return { game: armPrompts(finalGame, deadSink, armorSink), pendingActionTarget: null, toasts: [...s.toasts, { id, msg: `${pa.sourceName}: ${msgs.join(' | ')}` }] };
    }

    // ── Single-step ───────────────────────────────────────────────────────────
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    const { game, msgs } = resolveActionEffects(s.game, pa.lp, pa.sourceName, pa.effects, targetId, pa.sourceId, magicCtx(s.game, pa.lp, pa.card), deadSink, armorSink);
    const finalGame = pa.source === 'action' && pa.card
      ? { ...game, [pa.lp]: { ...game[pa.lp], dead: [...game[pa.lp].dead, pa.card] } }
      : game;
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return {
      game: armPrompts(finalGame, deadSink, armorSink),
      pendingActionTarget: null,
      toasts: [...s.toasts, { id, msg: msgs.length ? `${pa.sourceName}: ${msgs.join(' | ')}` : pa.sourceName }],
    };
  }),

  resolveActionSlot: (slot) => set(s => {
    const pa = s.pendingActionTarget;
    if (!pa || pa.twoStep !== 'reposition' || !pa.firstId || !pa.eligibleSlots?.includes(slot)) return s;
    const loc = findEntityAnywhere(s.game, pa.firstId);
    let g = s.game; const msgs: string[] = [];
    if (loc) {
      const board = { ...g[loc.player].board };
      delete board[loc.slot];
      board[slot] = loc.ent;
      g = { ...g, [loc.player]: { ...g[loc.player], board } };
      msgs.push(`${loc.ent.name} repositions`);
    }
    // Resolve the rest of the card's effects (e.g. the draw) after the move.
    const rest = pa.effects.filter(e => e.op !== 'move');
    const r = resolveActionEffects(g, pa.lp, pa.sourceName, rest, undefined); g = r.game; msgs.push(...r.msgs);
    const finalGame = pa.card ? { ...g, [pa.lp]: { ...g[pa.lp], dead: [...g[pa.lp].dead, pa.card] } } : g;
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { game: finalGame, pendingActionTarget: null, toasts: [...s.toasts, { id, msg: `${pa.sourceName}: ${msgs.join(' | ')}` }] };
  }),

  activateAbility: (entityId, idx) => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
    const loc = findEntityAnywhere(s.game, entityId);
    if (!loc) return s;
    const ability = gatherActivated(loc.ent)[idx];
    if (!ability) return s;

    const toast = (msg: string) => {
      const tid = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== tid) })), 4000);
      return { id: tid, msg };
    };
    if (ability.oncePerTurn && loc.ent.statuses.includes(abilityUsedTag(ability.sourceName))) {
      return { toasts: [...s.toasts, toast(`${ability.sourceName} already used this turn.`)] };
    }

    const player = loc.player;

    // Activating an ability is a Major Action for a character (PC/companion):
    // gate it on the same budget rules an attack uses. Constructs are not bound by
    // character action economy — their abilities cost only what the card states.
    if (isCharacter(loc.ent)) {
      const isExhausted = loc.ent.tapped === 'major' || loc.ent.exhausted;
      const reason = isSealed(s.game, entityId) ? 'Activation already finished'
        : loc.ent.fresh ? 'No Major Actions on its entry turn'
        : loc.ent.acts.major ? 'Major action already used'
        : isExhausted ? 'Exhausted' : null;
      if (reason) return { toasts: [...s.toasts, toast(`Can't activate ${ability.sourceName}: ${reason}.`)] };
    }

    let g = s.game;
    let sacrificedSelf = false;

    // ── Pay the cost ─────────────────────────────────────────────────────────
    const cost = ability.cost;
    if (cost?.kind === 'sacrificeSelf') {
      if (ability.itemId) {
        const lo = loc.ent.loadout ?? { weapon: null, gear: [] };
        const newLo = { weapon: lo.weapon?.id === ability.itemId ? null : lo.weapon, gear: lo.gear.map(x => x?.id === ability.itemId ? null : x) };
        g = updateEntity(g, entityId, { loadout: newLo });
        const itemCard = CATALOG.find(c => c.name === ability.sourceName);
        if (itemCard) g = { ...g, [player]: { ...g[player], dead: [...g[player].dead, itemCard] } };
      } else {
        const selfCard = CATALOG.find(c => c.name === loc.ent.name);
        g = removeEntity(g, entityId);
        if (selfCard) g = { ...g, [player]: { ...g[player], dead: [...g[player].dead, selfCard] } };
        sacrificedSelf = true;
      }
    } else if (cost?.kind === 'exhaustSelf') {
      g = updateEntity(g, entityId, { exhausted: true, tapped: 'major', acts: { ...loc.ent.acts, major: true } });
    } else if (cost?.kind === 'payHP') {
      g = updateEntity(g, entityId, { hp: Math.max(0, loc.ent.hp - cost.amount) });
    } else if (cost?.kind === 'removeAnchor') {
      g = updateEntity(g, entityId, { anchors: Math.max(0, (loc.ent.anchors ?? 0) - cost.count) });
    }

    // Mark once-per-turn (only if the source is still around).
    if (ability.oncePerTurn && !sacrificedSelf) {
      const cur = findEntityAnywhere(g, entityId);
      if (cur) g = updateEntity(g, entityId, { statuses: [...cur.ent.statuses, abilityUsedTag(ability.sourceName)] });
    }

    // Consume the character's Major Action (exhaust). Skip if the entity was
    // sacrificed as the cost, if exhaustSelf already did it, or for constructs.
    if (isCharacter(loc.ent) && !sacrificedSelf && cost?.kind !== 'exhaustSelf') {
      const cur = findEntityAnywhere(g, entityId);
      if (cur) g = updateEntity(g, entityId, { acts: { ...cur.ent.acts, major: true }, exhausted: true, tapped: 'major' });
    }

    // Atomic activation: activating a character's ability seals its activation
    // (and any other character mid-activation). Constructs are exempt.
    if (isCharacter(loc.ent)) g = { ...g, ...activationPatch(s.game, entityId) };

    const selfId = sacrificedSelf ? undefined : entityId;

    // ── Resolve the effect (target or immediate) ─────────────────────────────
    const spec = actionTargetSpec(ability.effects);
    if (spec) {
      const eligibleIds = eligibleTargets(g, player, spec).filter(t => t !== entityId);
      if (eligibleIds.length === 0) {
        return { game: g, toasts: [...s.toasts, toast(`${ability.sourceName} — no legal target.`)] };
      }
      return {
        game: g,
        pendingActionTarget: { source: 'ability', sourceName: ability.sourceName, lp: player, effects: ability.effects, eligibleIds, sourceId: selfId },
      };
    }
    const armorSink: ArmorChoiceData[] = [];
    const r = resolveActionEffects(g, player, ability.sourceName, ability.effects, undefined, selfId, undefined, undefined, armorSink);
    return { game: armPrompts(r.game, [], armorSink), toasts: [...s.toasts, toast(r.msgs.length ? `${ability.sourceName}: ${r.msgs.join(' | ')}` : ability.sourceName)] };
  }),

  // Cancel a pending target. Action cards return to hand; on-enter effects just fizzle.
  cancelActionTarget: () => set(s => {
    const pa = s.pendingActionTarget;
    if (!pa) return { pendingActionTarget: null };
    if (pa.source === 'action' && pa.card) {
      return {
        pendingActionTarget: null,
        game: { ...s.game, [pa.lp]: { ...s.game[pa.lp], hand: [...s.game[pa.lp].hand, pa.card] } },
      };
    }
    return { pendingActionTarget: null };
  }),

  // ── Deck-peek (scry): apply the player's per-card destinations ─────────────
  resolvePeek: (assignments) => set(s => {
    const pk = s.game.pendingPeek;
    if (!pk) return s;
    const side = pk.deckSide;
    const ps = s.game[side];
    // The looked-at cards were the top `pk.cards.length`; the rest of the deck is below.
    const below = ps.deck.slice(pk.cards.length);
    const toHand: Card[] = [], toTop: Card[] = [], toBottom: Card[] = [];
    pk.cards.forEach((c, i) => {
      const dest = assignments[i] ?? 'top';
      (dest === 'hand' ? toHand : dest === 'bottom' ? toBottom : toTop).push(c);
    });
    const newDeck = [...toTop, ...below, ...toBottom];
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    const parts: string[] = [];
    if (toHand.length) parts.push(`${toHand.length} to hand`);
    if (toBottom.length) parts.push(`${toBottom.length} to bottom`);
    if (toTop.length) parts.push(`${toTop.length} kept on top`);
    const newGame = { ...s.game, [side]: { ...ps, deck: newDeck, hand: pk.lp === side ? [...s.game[pk.lp].hand, ...toHand] : ps.hand } };
    const { peek, rest } = nextPeek(newGame, s.game.pendingPeekQueue); // advance any queued start-of-turn peeks
    return {
      game: { ...newGame, pendingPeek: peek, pendingPeekQueue: rest },
      toasts: [...s.toasts, { id, msg: `${pk.source}: ${parts.join(', ')}` }],
    };
  }),

  cancelPeek: () => set(s => {
    const pk = s.game.pendingPeek;
    if (!pk) return s;
    // Only the scry's owner may cancel it — the global Escape handler on the OTHER
    // client used to remotely wipe the opponent's peek mid-decision. (Sandbox
    // controls both seats, so it may always cancel.)
    if (s.conn.mode !== 'solo' && pk.lp !== s.localPlayer) return s;
    const { peek, rest } = nextPeek(s.game, s.game.pendingPeekQueue);
    return { game: { ...s.game, pendingPeek: peek, pendingPeekQueue: rest } };
  }),

  // ── Dead-Zone recovery (Library of Memory) ────────────────────────────────
  resolveDeadPick: (idx) => set(s => {
    const dp = s.game.pendingDeadPick;
    if (!dp) return s;
    const ps = s.game[dp.lp];
    // Options capture their index at arm time; an earlier pick in the queue may have
    // shifted the dead array since — re-locate the chosen card by identity.
    const expected = dp.options.find(o => o.idx === idx)?.card;
    if (!expected) return s;
    const liveIdx = ps.dead[idx]?.id === expected.id ? idx : ps.dead.findIndex(c => c.id === expected.id);
    const card = liveIdx >= 0 ? ps.dead[liveIdx] : undefined;
    if (!card) { // the card is no longer in the Dead Zone — skip and advance the queue
      const [next, ...rest] = s.game.pendingDeadPickQueue;
      return { game: { ...s.game, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest } };
    }
    let g: GameState = { ...s.game, [dp.lp]: { ...ps, dead: ps.dead.filter((_, i) => i !== liveIdx), hand: [...ps.hand, card] } };
    const msgs = [`Returned ${card.name} from the Dead Zone to hand`];
    // Run "if you do" effects (e.g. exhaust the source construct) now a card was taken.
    if (dp.postEffects.length) { const r = resolveActionEffects(g, dp.lp, dp.source, dp.postEffects, undefined, dp.sourceId); g = r.game; msgs.push(...r.msgs); }
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    // Advance to the next queued prompt, if any (e.g. a Cleave that killed two bearers).
    const [next, ...rest] = s.game.pendingDeadPickQueue;
    return { game: { ...g, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest }, toasts: [...s.toasts, { id, msg: `${dp.source}: ${msgs.join(' | ')}` }] };
  }),

  cancelDeadPick: () => set(s => {
    const dp = s.game.pendingDeadPick;
    if (!dp) return s;
    // Owner-only, like cancelPeek — an Escape on the other client must not wipe the
    // opponent's recovery pick. (The owner keeps the escape-hatch cancel.)
    if (s.conn.mode !== 'solo' && dp.lp !== s.localPlayer) return s;
    const [next, ...rest] = s.game.pendingDeadPickQueue;
    return { game: { ...s.game, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest } };
  }),

  // ── Equip from hand (Veteran of the Ashgrove on-enter) ────────────────────
  resolveEquipPick: (handCardId) => set(s => {
    const ep = s.pendingEquipPick;
    if (!ep) return s;
    const card = s.game[ep.lp].hand.find(c => c.id === handCardId);
    if (!card || card.type !== 'Item') return s;
    const g = equipOnto(s.game, ep.lp, ep.targetId, card); // free — no action spent
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { pendingEquipPick: null, game: g, toasts: [...s.toasts, { id, msg: `${ep.source}: equipped ${card.name}` }] };
  }),

  cancelEquipPick: () => set({ pendingEquipPick: null }),

  // ── Class Zone exchange ─────────────────────────────────────────────────────
  czToHand: (czCardId) => set(s => {
    const lp = s.localPlayer;
    const ps = s.game[lp];
    const cz = ps.classZone.find(c => c.id === czCardId);
    if (!cz || cz.faceDown) return s;           // can't move a spent card
    if (ps.classZone.length <= 1) return s;     // can't empty the Class Zone
    // Find the card in the catalog by name to put back in hand
    const catalogCard = CATALOG.find(c => c.name === cz.name);
    if (!catalogCard) return s; // shouldn't happen
    const newCZ = ps.classZone.filter(c => c.id !== czCardId);
    const newWillpower = computeWillpower(newCZ);
    return {
      game: {
        ...s.game,
        czExchangeUsed: true,
        [lp]: { ...ps, classZone: newCZ, willpower: newWillpower, hand: [...ps.hand, catalogCard] },
      },
    };
  }),

  handToCz: (handCardId) => set(s => {
    const lp = s.localPlayer;
    const ps = s.game[lp];
    if (ps.classZone.length >= 5) return s;     // CZ at max
    const card = ps.hand.find(c => c.id === handCardId);
    if (!card) return s;
    const newCzCard = { id: `cz-${Date.now()}`, cls: card.class1 || 'Classless', name: card.name, faceDown: false, cardData: card };
    const newCZ = [...ps.classZone, newCzCard];
    const newWillpower = computeWillpower(newCZ);
    return {
      game: {
        ...s.game,
        czExchangeUsed: true,
        [lp]: { ...ps, classZone: newCZ, willpower: newWillpower, hand: ps.hand.filter(c => c.id !== handCardId) },
      },
    };
  }),

  // ── Persistence ────────────────────────────────────────────────────────────
  saveGame: () => set(s => ({ savedGame: s.game })),
  resumeGame: () => set(s => {
    if (!s.savedGame) return s;
    // Backfill activation-lock fields for saves made before they existed, and clear any
    // transient prompts (a save shouldn't resume mid-scry / mid-recovery).
    const sg = s.savedGame as Partial<GameState> & GameState;
    const game: GameState = {
      ...sg,
      currentActor: sg.currentActor ?? null, finishedActors: sg.finishedActors ?? [],
      setupQueue: sg.setupQueue ?? [],
      // Old saves stored a winner NAME in gameOver; only the side form is valid now.
      gameOver: sg.gameOver === 'p1' || sg.gameOver === 'p2' ? sg.gameOver : null,
      pendingPeek: null, pendingPeekQueue: [], pendingDeadPick: null, pendingDeadPickQueue: [], pendingPoison: null, pendingArmor: null, pendingAttackChoice: null,
    };
    return { game, playPhase: 'game', conn: { ...EMPTY_CONN, mode: 'solo', code: 'RESUMED' }, localPlayer: 'p1' as const, ...LOCAL_PROMPTS_CLEARED };
  }),
  clearSavedGame: () => set({ savedGame: null }),

  // ── Selection ──────────────────────────────────────────────────────────────
  selectEntity: (id) => set(s => ({
    game: { ...s.game, selected: s.game.selected === id ? null : id },
    pending: s.game.selected === id ? null : s.pending,
    pendingPlay: null,
  })),

  setHovered: (h) => set({ hovered: h }),

  pileView: null,
  openPile: (player, zone) => set({ pileView: { player, zone } }),
  closePile: () => set({ pileView: null }),

  // ── Move ───────────────────────────────────────────────────────────────────
  beginMove: (charId) => set({ pending: { action: 'move', charId } }),

  resolveMove: (targetSlot) => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
    const { pending, game } = s;
    if (!pending || pending.action !== 'move') return s;
    const src = findEntityAnywhere(game, pending.charId);
    if (!src) return s;

    // Atomic activation: can't return to a character once you've activated another.
    if (isSealed(game, pending.charId)) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { pending: null, toasts: [...s.toasts, { id, msg: `${src.ent.name} has already finished its activation this turn.` }] };
    }

    // Movement must be the first action — cannot move after Minor or Major action.
    // Exception: Hit & Run grants one bonus move after attacking (consumed here).
    const hitRunMove = src.ent.statuses.includes(HIT_RUN_STATUS);
    if ((src.ent.acts.minor || src.ent.acts.major) && !hitRunMove) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { pending: null, toasts: [...s.toasts, { id, msg: 'Move must be the first action — already acted this turn.' }] };
    }

    // Destination must be adjacent to current slot
    if (!ADJ[src.slot].includes(targetSlot)) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { pending: null, toasts: [...s.toasts, { id, msg: 'Target slot is not adjacent.' }] };
    }

    // Destination must be empty
    if (game[src.player].board[targetSlot]) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { pending: null, toasts: [...s.toasts, { id, msg: 'That slot is occupied.' }] };
    }

    const board = { ...game[src.player].board };
    const ent = {
      ...src.ent,
      acts: { ...src.ent.acts, move: true },
      // Consume the Hit & Run bonus-move marker if this was that move.
      statuses: hitRunMove ? src.ent.statuses.filter(st => st !== HIT_RUN_STATUS) : src.ent.statuses,
    };
    delete board[src.slot];
    board[targetSlot] = ent;

    return {
      pending: null,
      game: { ...game, ...activationPatch(game, pending.charId), [src.player]: { ...game[src.player], board } },
    };
  }),

  // ── Attack ─────────────────────────────────────────────────────────────────
  beginAttack: (charId) => set(s => {
    const attLoc = findEntityAnywhere(s.game, charId);
    if (!attLoc) return s;
    const ent = attLoc.ent;

    const toast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg }] };
    };

    // Atomic activation: can't return to a character once you've activated another.
    if (isSealed(s.game, charId)) return { ...toast(`${ent.name} has already finished its activation this turn.`) };

    // Already used major action this turn
    if (ent.acts.major) return { ...toast('Already used a Major Action this turn.') };

    // Exhausted (shouldn't happen if acts.major is tracked, but guard anyway)
    if (ent.exhausted) return { ...toast('This character is exhausted.') };

    // Summoning sickness — fresh companions cannot attack unless Zealous
    // (effectiveKeywords: item-granted Zealous counts, suppressed Zealous doesn't).
    if (ent.fresh && !effectiveKeywords(ent, s.game).includes('Zealous')) {
      return { ...toast('Just entered — cannot attack until next turn (no Zealous).') };
    }

    // Attack eligibility: must be in Front Line unless Ranged
    const hasRanged = effectiveKeywords(ent, s.game).includes('Ranged');
    if (!hasRanged && !isFront(attLoc.slot)) {
      return { ...toast('Must be in the Front Line to attack (no Ranged).') };
    }

    return { pending: { action: 'attack', charId } };
  }),

  resolveAttack: (targetEntityId) => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
    const { pending, game } = s;
    if (!pending || pending.action !== 'attack') return s;

    const attLoc = findEntityAnywhere(game, pending.charId);
    const tgtLoc = findEntityAnywhere(game, targetEntityId);
    if (!attLoc || !tgtLoc) return s;

    const attacker = attLoc.ent;
    const target   = tgtLoc.ent;

    const oppPlayer: 'p1' | 'p2' = attLoc.player === 'p1' ? 'p2' : 'p1';
    const oppBoard = game[oppPlayer].board;

    const pushToast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { id, msg };
    };

    // ── Targeting rules (only for characters, not constructs) ──────────────────
    if (target.kind !== 'construct') {
      // 1. Guardian: any ready, legal Guardian must be attacked first
      const readyGuardians = (Object.values(oppBoard) as (BoardEntity | undefined)[])
        .filter((e): e is BoardEntity => !!e && !e.exhausted && effectiveKeywords(e, game).includes('Guardian') && e.kind !== 'construct');
      if (readyGuardians.length > 0 && !readyGuardians.some(g => g.id === targetEntityId)) {
        const t = pushToast('A Guardian must be attacked first!');
        return { pending: null, toasts: [...s.toasts, t] };
      }

      // 2. Front Line priority (applies when no Guardian is forcing the choice)
      const hasEvasive = effectiveKeywords(attacker, game).includes('Evasive');
      const targetHasRanged = effectiveKeywords(target, game).includes('Ranged');
      if (!hasEvasive && !targetHasRanged) {
        const tgtSlot = findSlot(oppBoard, targetEntityId);
        const frontLineOccupied = (Object.entries(oppBoard) as [string, BoardEntity | undefined][])
          .some(([sl, e]) => e && e.kind !== 'construct' && isFront(sl as SlotId));
        if (frontLineOccupied && tgtSlot && !isFront(tgtSlot as SlotId)) {
          const t = pushToast('Must target the Front Line first (attacker has no Evasive; target has no Ranged).');
          return { pending: null, toasts: [...s.toasts, t] };
        }
      }

      // 3. Long-Quiet Wall: opposing COMPANIONS cannot attack the defender's
      //    characters on the line opposite a Fortification ward (front↔back).
      if (attacker.kind === 'companion') {
        const tgtSlot = findSlot(oppBoard, targetEntityId);
        const tgtLine: 'front' | 'back' | null = tgtSlot ? (isFront(tgtSlot as SlotId) ? 'front' : 'back') : null;
        if (tgtLine && wardedLines(oppBoard).has(tgtLine)) {
          const t = pushToast('That line is shielded by a Fortification — opposing companions cannot attack it.');
          return { pending: null, toasts: [...s.toasts, t] };
        }
      }
    }

    // Optional on-attack ability (Mara): pause to ask the attacker whether to pay HP
    // for +damage. Decided BEFORE the attack resolves (the bonus rides the attack).
    const opt = optionalAttackAbility(attacker, game, attLoc.player);
    if (opt) {
      return { pending: null, game: { ...game, pendingAttackChoice: {
        lp: attLoc.player, charId: pending.charId, targetId: targetEntityId,
        sourceName: opt.sourceName, payHP: opt.payHP, bonus: opt.bonus } } };
    }

    const r = commitAttack(game, pending.charId, targetEntityId, 0);
    if (r.paused) return { pending: null, game: r.game };
    return { pending: null, game: r.game, toasts: [...s.toasts, pushToast(r.msg)] };
  }),

  // ── Optional pre-attack ability (Mara): pay HP for +damage, or decline ─────────
  resolveAttackChoice: (accept) => set(s => {
    const pac = s.game.pendingAttackChoice;
    if (!pac) return s;
    let game: GameState = { ...s.game, pendingAttackChoice: null };
    const prefix: string[] = [];
    if (accept) {
      game = payPcHp(game, pac.lp, pac.payHP);
      prefix.push(`${pac.sourceName}: pays ${pac.payHP} HP for +${pac.bonus}`);
    }
    const r = commitAttack(game, pac.charId, pac.targetId, accept ? pac.bonus : 0);
    if (r.paused) return { game: r.game };
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
    return { game: r.game, toasts: [...s.toasts, { id, msg: [...prefix, r.msg].filter(Boolean).join(' | ') }] };
  }),

  // ── Armor choice (mid-combat): the defender picks which piece absorbs the hit ──
  resolveArmor: (pieceId) => set(s => {
    const pa = s.game.pendingArmor;
    if (!pa) return s;
    const chosen = pa.candidates.find(c => c.id === pieceId);
    if (!chosen) return s; // must pick a real candidate
    const mkToast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { id, msg };
    };

    // Non-combat deferred choice: apply the counter, then arm the next queued one.
    if (!pa.ctx) {
      const r = applyArmorCounter(s.game, pa.entityId, pieceId);
      const next = armNextArmorChoice(r.game, pa.queue ?? []);
      return { game: { ...next.game, pendingArmor: next.pendingArmor }, toasts: [...s.toasts, mkToast(r.msgs.join(' | '))] };
    }

    // Combat: resume the paused attack on a cloned ctx (the stored one is synced state).
    const ctx: AttackCtx = { ...pa.ctx, hitQueue: [...pa.ctx.hitQueue], msgs: [...pa.ctx.msgs], events: [...pa.ctx.events], deadSink: [...pa.ctx.deadSink], armorSink: [...pa.ctx.armorSink] };
    let g: GameState = { ...s.game, pendingArmor: null };
    g = applyCombatHit(g, ctx, chosen.id); // resolve the paused hit with the chosen piece
    const res = driveAttack(g, ctx);
    if (!res.done) {
      return { game: { ...res.game, pendingArmor: res.pendingArmor } };
    }
    return { game: finalizeAttack(res.game, res.ctx), toasts: [...s.toasts, mkToast(res.ctx.msgs.join(' | '))] };
  }),

  // ── Cancel ─────────────────────────────────────────────────────────────────
  cancelPending: () => set({ pending: null }),

  // ── Play card ──────────────────────────────────────────────────────────────
  beginPlay: (cardId) => set(s => ({
    // Capture the selected character as the activating actor before clearing the
    // selection (Action cards charge this character's action economy).
    pendingPlay: s.pendingPlay?.cardId === cardId ? null : { cardId, actorId: s.game.selected },
    pending: null,
    game: { ...s.game, selected: null },
  })),

  cancelPlay: () => set({ pendingPlay: null }),

  // ── On-enter trigger targeting (Reinforce / Dismantle) ─────────────────────
  resolveTrigger: (targetId) => set(s => {
    const pt = s.pendingTrigger;
    if (!pt || !pt.eligibleIds.includes(targetId)) return s;
    const loc = findEntityAnywhere(s.game, targetId);
    if (!loc) return { pendingTrigger: null };

    const cur = loc.ent.anchors ?? 0;
    let game = s.game;
    let msg: string;
    if (pt.kind === 'reinforce') {
      const next = cur + pt.n;
      game = updateEntity(game, targetId, { anchors: next });
      msg = `${pt.sourceName} reinforces ${loc.ent.name}: ${cur} → ${next} anchors.`;
    } else {
      const next = Math.max(0, cur - pt.n);
      if (next <= 0) {
        game = destroyEntity(game, targetId);
        msg = `${pt.sourceName} dismantles ${loc.ent.name} — no anchors left, sacrificed!`;
      } else {
        game = updateEntity(game, targetId, { anchors: next });
        msg = `${pt.sourceName} dismantles ${loc.ent.name}: ${cur} → ${next} anchors.`;
      }
    }
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
    return { pendingTrigger: null, game: recomputeStatics(game), toasts: [...s.toasts, { id, msg }] };
  }),

  cancelTrigger: () => set({ pendingTrigger: null }),

  // ── Kit-Master: move an item from one of your characters to another ─────────
  resolveKit: (targetId) => set(s => {
    const pk = s.pendingKit;
    if (!pk || !pk.eligibleIds.includes(targetId)) return s;

    // Step 1 — pick the source character; advance to item choice (2+ placeable
    // items) or straight to destination selection (exactly 1).
    if (pk.step === 'source') {
      const loc = findEntityAnywhere(s.game, targetId);
      const items = loc ? allItemsOf(loc.ent) : [];
      if (!loc || items.length === 0) return { pendingKit: null };
      const controller = loc.player;
      // Only items that have a capacity-eligible destination can be moved.
      const placeable = items.filter(it =>
        kitDests(s.game, controller, targetId, it.isWeapon, !!it.item.heavy).length > 0);
      if (placeable.length === 0) {
        const id = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
        return { pendingKit: null, toasts: [...s.toasts, { id, msg: 'No character has room to receive an item from there.' }] };
      }
      // 2+ placeable items → let the player choose which (KitItemModal). No board
      // click in that step, so eligibleIds is empty.
      if (placeable.length > 1) {
        return { pendingKit: { ...pk, step: 'item', fromId: targetId, eligibleIds: [],
          items: placeable.map(i => ({ id: i.item.id, name: i.item.name })) } };
      }
      const only = placeable[0];
      const dests = kitDests(s.game, controller, targetId, only.isWeapon, !!only.item.heavy);
      return { pendingKit: { ...pk, step: 'dest', fromId: targetId, itemId: only.item.id, itemName: only.item.name, eligibleIds: dests } };
    }

    // Step 2 — move the chosen item from source to the destination character.
    const from = pk.fromId ? findEntityAnywhere(s.game, pk.fromId) : null;
    const to = findEntityAnywhere(s.game, targetId);
    if (!from || !to || !pk.itemId || !from.ent.loadout) return { pendingKit: null };

    const fromLo = from.ent.loadout;
    const movedIsWeapon = fromLo.weapon?.id === pk.itemId;
    const moved = movedIsWeapon ? fromLo.weapon : fromLo.gear.find(g => g?.id === pk.itemId) ?? null;
    if (!moved) return { pendingKit: null };
    const movedIsHeavy = !!moved.heavy;

    // Capacity guard (eligibleIds is already capacity-filtered; this is defensive).
    if (!canHoldItem(to.ent, movedIsWeapon, movedIsHeavy)) return { pendingKit: null };

    // Remove from source. A heavy item lives in both gear slots, so null every match.
    const newFromLo = {
      weapon: movedIsWeapon ? null : fromLo.weapon,
      gear: movedIsWeapon ? fromLo.gear : fromLo.gear.map(g => (g?.id === pk.itemId ? null : g)),
    };
    // Place on destination in the correct slot — never grow past capacity.
    const toLo = to.ent.loadout ?? { weapon: null, gear: [] };
    let newToLo: typeof toLo;
    if (movedIsWeapon) {
      newToLo = { ...toLo, weapon: moved };
    } else if (movedIsHeavy) {
      newToLo = { ...toLo, gear: [moved, moved] };
    } else {
      const slots = [toLo.gear[0] ?? null, toLo.gear[1] ?? null];
      slots[slots.findIndex(g => !g)] = moved; // findIndex ≥ 0 by the capacity guard
      newToLo = { ...toLo, gear: slots };
    }

    let game = updateEntity(s.game, from.ent.id, { loadout: newFromLo });
    game = updateEntity(game, targetId, { loadout: newToLo });
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
    return { pendingKit: null, game, toasts: [...s.toasts, { id, msg: `${pk.sourceName} moves ${pk.itemName} from ${from.ent.name} to ${to.ent.name}.` }] };
  }),

  cancelKit: () => set({ pendingKit: null }),

  // Kit-Master: choose which item to move when the source holds 2+ (KitItemModal).
  pickKitItem: (itemId) => set(s => {
    const pk = s.pendingKit;
    if (!pk || pk.step !== 'item' || !pk.fromId) return s;
    const picked = pk.items?.find(i => i.id === itemId);
    const from = findEntityAnywhere(s.game, pk.fromId);
    if (!picked || !from || !from.ent.loadout) return { pendingKit: null };
    const lo = from.ent.loadout;
    const isWeapon = lo.weapon?.id === itemId;
    const movedItem = isWeapon ? lo.weapon : lo.gear.find(g => g?.id === itemId) ?? null;
    if (!movedItem) return { pendingKit: null };
    const dests = kitDests(s.game, from.player, pk.fromId, isWeapon, !!movedItem.heavy);
    if (dests.length === 0) return { pendingKit: null };
    return { pendingKit: { ...pk, step: 'dest', itemId: picked.id, itemName: picked.name, eligibleIds: dests } };
  }),

  placeCard: (slot) => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
    const { pendingPlay, game, localPlayer } = s;
    if (!pendingPlay) return s;

    const lp = localPlayer;
    const card = game[lp].hand.find(c => c.id === pendingPlay.cardId);
    if (!card) return s;

    // Willpower requirement: must have Willpower ≥ the card's Level to play it.
    const wp = playWillpower(game[lp]);
    if (wp < card.level) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { pendingPlay: null, toasts: [...s.toasts, { id, msg: `Willpower ${wp} < level ${card.level} — can't play ${card.name}.` }] };
    }

    const czIdx = game[lp].classZone.findIndex(c => !c.faceDown);
    if (czIdx === -1) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { pendingPlay: null, toasts: [...s.toasts, { id, msg: 'No face-up Class Zone card to spend!' }] };
    }

    // Companions enter Back Line only; Constructs may enter any empty slot
    if (card.type === 'Companion' && !['b1','b2','b3'].includes(slot)) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { pendingPlay: null, toasts: [...s.toasts, { id, msg: 'Companions must enter the Back Line!' }] };
    }

    const newCZ = game[lp].classZone.map((c, i) =>
      i === czIdx ? { ...c, faceDown: true } : c
    );
    const newWillpower = computeWillpower(newCZ);

    // Build board entity from card
    const isCompanion = card.type === 'Companion';
    const isConstruct = card.type === 'Construct';
    const newEnt: BoardEntity = {
      id: `placed-${card.id}-${Date.now()}`,
      kind: isConstruct ? 'construct' : 'companion',
      name: card.name,
      cls: card.class1,
      level: card.level,
      atk: card.attack ?? undefined,
      hp: card.hp ?? 0,
      maxHp: card.hp ?? 0,
      anchors: card.anchor ?? undefined,
      anchorsStart: card.anchor ?? undefined,
      keywords: card.keywords,
      statuses: [],
      subtype: card.subtype,
      text: card.text,
      tapped: 'none', exhausted: false,
      fresh: isCompanion, // summoning sickness
      acts: freshActs(),
      loadout: isCompanion ? { weapon: null, gear: [] } : undefined,
    };

    const newHand = game[lp].hand.filter(c => c.id !== pendingPlay.cardId);

    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);

    // Trigger Oathsworn modal if the placed card has the Oathsworn keyword
    const isOathsworn = card.keywords.includes('Oathsworn');
    const newModals = isOathsworn
      ? [...s.modalQueue, 'oathsworn']
      : s.modalQueue;
    const newOathCtx = isOathsworn
      ? { permanentId: newEnt.id, name: card.name }
      : s.oathContext;

    // On-enter targeting keyword (Reinforce / Dismantle) — Reinforce targets your
    // own Physical Constructs, Dismantle targets the opponent's. If none exist the
    // trigger fizzles with a note rather than blocking.
    const enterTrig = parseEnterTrigger(card.keywords);
    let pendingTrigger: PendingTrigger | null = null;
    let enterMsg = `${card.name} enters the field!`;
    if (enterTrig) {
      const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
      const targetBoard = enterTrig.kind === 'reinforce' ? game[lp].board : game[opp].board;
      const eligibleIds = (Object.values(targetBoard) as (BoardEntity | undefined)[])
        .filter((e): e is BoardEntity => !!e && isPhysicalConstruct(e))
        .map(e => e.id);
      const verb = enterTrig.kind === 'reinforce' ? 'Reinforce' : 'Dismantle';
      if (eligibleIds.length > 0) {
        pendingTrigger = { kind: enterTrig.kind, n: enterTrig.n, sourceName: card.name, eligibleIds };
        enterMsg = `${card.name}: choose a Physical Construct to ${verb} (${enterTrig.n}).`;
      } else {
        enterMsg = `${card.name} enters — no Physical Construct to ${verb.toLowerCase()}.`;
      }
    }

    // Kit-Master (on-enter): move an item from one of your characters to another.
    // Eligibility is computed on the post-placement board so the new companion
    // counts as a possible destination.
    let pendingKit: PendingKit | null = null;
    if (card.keywords.includes('Kit-Master')) {
      const boardAfter = { ...game[lp].board, [slot]: newEnt };
      const gameAfter = { ...game, [lp]: { ...game[lp], board: boardAfter } };
      const chars = (Object.values(boardAfter) as (BoardEntity | undefined)[])
        .filter((e): e is BoardEntity => !!e && isCharacter(e));
      // A source is eligible only if it holds an item that some OTHER character
      // has slot capacity to receive (otherwise highlighting it would dead-end).
      const sources = chars.filter(e =>
        allItemsOf(e).some(it => kitDests(gameAfter, lp, e.id, it.isWeapon, !!it.item.heavy).length > 0)
      ).map(e => e.id);
      if (sources.length > 0) {
        pendingKit = { sourceName: card.name, step: 'source', eligibleIds: sources };
        enterMsg = `${card.name}: Kit-Master — choose a character to take an item from.`;
      } else {
        enterMsg = `${card.name} enters — no item to move (Kit-Master).`;
      }
    }

    const placedGame = recomputeStatics({
      ...game,
      [lp]: {
        ...game[lp],
        hand: newHand,
        classZone: newCZ,
        willpower: newWillpower,
        board: { ...game[lp].board, [slot]: newEnt },
      },
    });

    // Structured on-enter effects (the non-keyword "When this enters, …" text).
    // Only when no keyword trigger already claimed the enter (avoids double pending).
    const onEnter = (card.effects ?? []).filter(c => c.trigger === 'onEnter').flatMap(c => c.effects);
    if (!pendingTrigger && !pendingKit && onEnter.length > 0) {
      // Equip-from-hand (Veteran of the Ashgrove): pick an item from hand for this character.
      if (onEnter.some(e => e.op === 'equipFromHand')) {
        const items = placedGame[lp].hand.filter(c => c.type === 'Item');
        if (items.length > 0) {
          return {
            pendingPlay: null, oathContext: newOathCtx, modalQueue: newModals, game: placedGame,
            pendingEquipPick: { source: card.name, lp, targetId: newEnt.id, items },
            toasts: [...s.toasts, { id, msg: `${card.name} enters — equip an item from your hand?` }],
          };
        }
        // no items in hand — fall through (nothing to equip)
      }

      // Two-step on-enter: Field Engineer moves an anchor between two Physical Constructs.
      if (twoStepKind(onEnter) === 'moveAnchor') {
        const mv = onEnter.find(e => e.op === 'moveAnchor');
        const count = mv && mv.op === 'moveAnchor' ? mv.count : 1;
        const physical = ownPhysicalConstructIds(placedGame, lp);
        const sources = physical.filter(pid => (findEntityAnywhere(placedGame, pid)?.ent.anchors ?? 0) >= count);
        if (sources.length >= 1 && physical.length >= 2) {
          return {
            pendingPlay: null, oathContext: newOathCtx, modalQueue: newModals, game: placedGame,
            pendingActionTarget: { source: 'enter', sourceName: card.name, lp, effects: onEnter, eligibleIds: sources, sourceId: newEnt.id, twoStep: 'moveAnchor' },
            toasts: [...s.toasts, { id, msg: `${card.name} enters — move an anchor: choose a source Physical Construct.` }],
          };
        }
        // not enough Physical Constructs — fall through (fizzle, it's optional)
      }

      const enterPeek = onEnter.find(e => e.op === 'deckPeek');
      if (enterPeek && enterPeek.op === 'deckPeek') {
        const cards = placedGame[lp].deck.slice(0, enterPeek.look);
        if (cards.length > 0) {
          return {
            pendingPlay: null, oathContext: newOathCtx, modalQueue: newModals,
            game: { ...placedGame, pendingPeek: { source: card.name, lp, deckSide: lp, cards, dests: enterPeek.dests, maxHand: enterPeek.maxHand } },
            toasts: [...s.toasts, { id, msg: `${card.name} enters — look at your deck.` }],
          };
        }
      }
      const spec = actionTargetSpec(onEnter);
      if (spec) {
        const eligibleIds = eligibleTargets(placedGame, lp, spec).filter(eid => eid !== newEnt.id);
        if (eligibleIds.length > 0) {
          return {
            pendingPlay: null, oathContext: newOathCtx, modalQueue: newModals, game: placedGame,
            pendingActionTarget: { source: 'enter', sourceName: card.name, lp, effects: onEnter, eligibleIds, sourceId: newEnt.id },
            toasts: [...s.toasts, { id, msg: `${card.name} enters — choose a target.` }],
          };
        }
        // No legal target — fizzle (enter without the targeted effect).
      } else {
        const armorSink: ArmorChoiceData[] = [];
        const r = resolveActionEffects(placedGame, lp, card.name, onEnter, undefined, newEnt.id, undefined, undefined, armorSink);
        return {
          pendingPlay: null, pendingTrigger, pendingKit, oathContext: newOathCtx, modalQueue: newModals,
          game: armPrompts(r.game, [], armorSink),
          toasts: [...s.toasts, { id, msg: r.msgs.length ? `${card.name} enters! ${r.msgs.join(' | ')}` : enterMsg }],
        };
      }
    }

    return {
      pendingPlay: null,
      pendingTrigger,
      pendingKit,
      oathContext: newOathCtx,
      modalQueue: newModals,
      game: placedGame,
      toasts: [...s.toasts, { id, msg: enterMsg }],
    };
  }),

  // ── Action bookkeeping ─────────────────────────────────────────────────────
  markAction: (entityId, type) => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
    const loc = findEntityAnywhere(s.game, entityId);
    if (!loc) return s;
    const ent = loc.ent;
    // Atomic activation: can't return to a character once you've activated another.
    if (isCharacter(ent) && isSealed(s.game, entityId)) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg: `${ent.name} has already finished its activation this turn.` }] };
    }
    const newActs = { ...ent.acts, [type]: true };
    const newTap: TapState = newActs.major ? 'major' : newActs.minor ? 'minor' : 'none';
    const patch = isCharacter(ent) ? activationPatch(s.game, entityId) : {};
    return {
      game: { ...updateEntity(s.game, entityId, { acts: newActs, tapped: newTap, exhausted: newActs.major }), ...patch },
    };
  }),

  resetActions: (entityId) => set(s => {
    // Playtest helper: also lift the activation lock for this character.
    const finishedActors = s.game.finishedActors.filter(x => x !== entityId);
    const currentActor = s.game.currentActor === entityId ? null : s.game.currentActor;
    return { game: { ...updateEntity(s.game, entityId, { acts: freshActs(), tapped: 'none', exhausted: false }), finishedActors, currentActor } };
  }),

  // ── HP nudge ──────────────────────────────────────────────────────────────
  adjustHp: (entityId, delta) => set(s => {
    const loc = findEntityAnywhere(s.game, entityId);
    if (!loc) return s;
    const newHp = Math.max(0, Math.min(effectiveMaxHp(loc.ent, s.game), loc.ent.hp + delta));
    // The PC entity is the HP source of truth — setPcHp mirrors the headline and ends
    // the game at 0 (GameOverScreen replaces the old winner toast).
    const newGame = loc.ent.kind === 'pc'
      ? setPcHp(s.game, loc.player, entityId, newHp)
      : updateEntity(s.game, entityId, { hp: newHp });
    return { game: newGame };
  }),

  // ── Turn end / ready phase ────────────────────────────────────────────────
  endTurn: () => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
    const g = s.game;
    const nextPlayer: 'p1' | 'p2' = g.activePlayer === 'p1' ? 'p2' : 'p1';
    const nextTurn = nextPlayer === 'p1' ? g.turn + 1 : g.turn;

    const readyPlayer = (ps: PlayerState): PlayerState => {
      // Flip CZ cards face-up → recalculate willpower
      const newCZ = ps.classZone.map(c => ({ ...c, faceDown: false }));
      const newWillpower = computeWillpower(newCZ);
      // Effective willpower for fleeing checks (accounts for Dismayed)
      const effWP = Math.max(0, newWillpower - (ps.dismayed ? 1 : 0));
      // Master of Foundations: this player's Physical Constructs skip anchor decay.
      const noPhysicalDecay = controlsPreventAnchorDecay(ps);
      const newBoard: Board = {};
      // Entities that leave during ready (decayed constructs, fleeing companions) go to
      // the Dead Zone with their items; a tucked Oathsworn card returns to hand.
      const buried: Card[] = [];
      const returnedSworn: Card[] = [];
      const bury = (ent: BoardEntity) => { buried.push(...deadCardsOf(ent)); if (ent.sworn) returnedSworn.push(ent.sworn); };
      for (const [slot, ent] of Object.entries(ps.board)) {
        if (!ent) continue;
        // Anchor decay for constructs (also ready them: clear exhaust/tap + once-per-turn
        // markers, so "exhaust until your next turn" effects like Library of Memory expire).
        if (ent.kind === 'construct') {
          const skipDecay = noPhysicalDecay && isPhysicalConstruct(ent);
          const newAnchors = skipDecay ? (ent.anchors ?? 0) : (ent.anchors ?? 0) - 1;
          if (newAnchors <= 0) { bury(ent); continue; } // last anchor decayed — sacrificed
          newBoard[slot as SlotId] = {
            ...ent, anchors: newAnchors, acts: freshActs(), tapped: 'none' as TapState, exhausted: false,
            statuses: ent.statuses.filter(st => !st.startsWith('ability-used:')),
          };
          continue;
        }
        // Companion fleeing: level > effective willpower
        if (ent.kind === 'companion' && ent.level > effWP) { bury(ent); continue; }
        // Ready the entity (drop unused Hit & Run marker + once-per-turn ability markers)
        newBoard[slot as SlotId] = {
          ...ent, tapped: 'none' as TapState, exhausted: false, fresh: false, acts: freshActs(),
          statuses: ent.statuses.filter(st => st !== HIT_RUN_STATUS && !st.startsWith('ability-used:')),
        };
      }
      return { ...ps, classZone: newCZ, willpower: newWillpower, board: newBoard,
        dead: buried.length ? [...ps.dead, ...buried] : ps.dead,
        hand: returnedSworn.length ? [...ps.hand, ...returnedSworn] : ps.hand };
    };

    const readied = readyPlayer(g[nextPlayer]);
    // Draw a card for the next player (with deck-out check)
    let drawnDeck = readied.deck;
    let drawnHand = readied.hand;
    let drawToast = '';
    let deckOutLoser = false;
    if (drawnDeck.length > 0) {
      const drawn = drawnDeck[0];
      drawnHand = [...readied.hand, drawn];
      drawnDeck = drawnDeck.slice(1);
      // Only reveal the drawn card to its owner. endTurn runs on the player ENDING their
      // turn, who draws for the NEXT player — in multiplayer that's the opponent, so naming
      // the card here would leak it. Sandbox (one controller) sees everything.
      const nextIsLocal = nextPlayer === s.localPlayer;
      const reveal = s.conn.mode === 'solo' || nextIsLocal;
      const who = nextIsLocal ? 'You' : 'Opponent';
      const verb = nextIsLocal ? 'draw' : 'draws';
      drawToast = reveal ? `${who} ${verb}: ${drawn.name}` : `${who} ${verb} a card`;
    } else {
      drawToast = `💀 ${nextPlayer === s.localPlayer ? 'You have' : 'Opponent has'} no cards to draw — deck out!`;
      deckOutLoser = true;
    }
    const nextPlayerState = { ...readied, deck: drawnDeck, hand: drawnHand };

    const winnerOnDeckOut: 'p1' | 'p2' | null = deckOutLoser
      ? (nextPlayer === 'p1' ? 'p2' : 'p1')
      : null;

    let newGame: GameState = recomputeStatics({
      ...g,
      turn: nextTurn,
      activePlayer: nextPlayer,
      currentPhase: 'draw' as Phase,   // Start at Draw, player advances → CZ → Action
      selected: null,
      czExchangeUsed: false,
      currentActor: null,       // new turn → activation lock cleared
      finishedActors: [],
      gameOver: winnerOnDeckOut,
      [nextPlayer]: nextPlayerState,
    });

    // Expire until-end-of-turn buffs on the player whose turn just ended.
    const acted = g.activePlayer;
    const actedBoard: Board = {};
    for (const [slot, ent] of Object.entries(newGame[acted].board) as [SlotId, BoardEntity | undefined][]) {
      if (!ent) continue;
      actedBoard[slot] = ent.buffs?.some(b => b.until === 'endOfTurn')
        ? { ...ent, buffs: ent.buffs.filter(b => b.until !== 'endOfTurn') }
        : ent;
    }
    newGame = { ...newGame, [acted]: { ...newGame[acted], board: actedBoard } };

    // Fire start-of-turn effects (constructs/companions) for the player starting their turn.
    const sot = resolveStartOfTurn(newGame, nextPlayer);
    newGame = sot.game;

    const drawId = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== drawId) })), 4000);
    const sotToasts = sot.msgs.map(msg => {
      const tid = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== tid) })), 4000);
      return { id: tid, msg };
    });

    // Start-of-turn Poison check belongs to the player whose turn is beginning. Route it
    // via a game-level flag (synced) so it resolves on THAT player's client, not whoever
    // happened to end the turn (the old `nextPlayer === localPlayer` gate never fired the
    // modal for the starting peer in multiplayer).
    const poisonedCount = Object.values(newGame[nextPlayer].board).filter(e => e && (e.poison ?? 0) > 0).length;
    const pendingPoison: 'p1' | 'p2' | null = poisonedCount > 0 ? nextPlayer : null;

    // Queue any start-of-turn deck-peeks as an interactive modal (re-sliced when armed).
    const { peek: firstPeek, rest: peekQueue } = nextPeek(newGame, sot.peeks);
    // Dead-Zone recovery (Library of Memory) — arm the first; it shows after peeks resolve.
    const [firstDeadPick, ...deadPickQueue] = sot.deadPicks;
    // Armor choices from start-of-turn construct damage (defender picks which piece absorbs).
    const armorRes = armNextArmorChoice(newGame, sot.armorChoices);
    newGame = armorRes.game;

    setTimeout(() => get().saveGame(), 0);
    return {
      pending: null, pendingPlay: null,
      game: { ...newGame,
        pendingPeek: firstPeek, pendingPeekQueue: peekQueue,
        pendingDeadPick: firstDeadPick ?? null, pendingDeadPickQueue: deadPickQueue,
        pendingArmor: armorRes.pendingArmor,
        pendingPoison },
      modalQueue: s.modalQueue,
      toasts: [...s.toasts, { id: drawId, msg: drawToast }, ...sotToasts],
    };
  }),

  // ── Toast ─────────────────────────────────────────────────────────────────
  pushToast: (msg) => set(s => {
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
    return { toasts: [...s.toasts, { id, msg }] };
  }),
  }),
  {
    name: 'twilight-game',
    partialize: (s) => ({ savedGame: s.savedGame }),
  }
  ))
);
