// ─── Game state types ───────────────────────────────────────────────────────────
// The pure, serializable game state: players, board, and every cross-client prompt
// that lives inside `game` (synced wholesale over multiplayer). Moved verbatim from
// src/store/gameStore.ts (extraction plan, slice 2). Store-local prompt types
// (PendingAction/PendingPlay/PendingTrigger/PendingKit/…) stay in the store.
import type { BoardEntity, Card } from '../types/card';
import type { Effect } from '../types/effects';
import type { Board } from './geometry';

export type Phase = 'ready' | 'draw' | 'cz' | 'action' | 'end';

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
  /** Coercion prompt: an opposing Coercion companion entered — the VICTIM chooses to
   *  discard a card or sacrifice a permanent. Routed to the victim's client; the
   *  acting player is held (see `reactiveHold`) until it resolves. */
  pendingCoercion: PendingCoercion | null;
  /** Mid-combat Armor choice — when an attack hits a character with 2+ armor pieces,
   *  combat PAUSES and the DEFENDER picks which piece absorbs the hit (rules: "the
   *  controlling player chooses which armor prevents the damage"). Carries the
   *  serializable resume state so combat continues after the pick. Routed to the
   *  defender; the attacker is held (see `reactiveHold`) until it resolves. */
  pendingArmor: PendingArmor | null;
  /** Pre-attack optional ability prompt (Mara: "you may pay HP from your PC: +N damage").
   *  Routed to the attacker; combat commits once they choose via `resolveAttackChoice`. */
  pendingAttackChoice: PendingAttackChoice | null;
  /** Deferred start-of-turn modal choice (Pyre) — the controller picks a mode (or
   *  declines, for "you may" clauses); the clause cost is paid at resolution. */
  pendingModalChoice: PendingModalChoice | null;
  /** Further modal choices queued behind the active one. */
  pendingModalChoiceQueue: PendingModalChoice[];
  /** Item Transfer on Character Exit window (rules §Items; ruled 2026-07-08: applies to
   *  ALL exits, death included). The departed character's item cards are ALREADY in the
   *  owner's Dead Zone — claiming one removes it from there, so nothing sits in limbo
   *  and an abandoned prompt just leaves them dead (canon's default). Routed to the
   *  departed character's controller; the other player is held (see `reactiveHold`). */
  pendingItemTransfer: PendingItemTransfer | null;
  /** Further transfer windows queued behind the active one (one per departing
   *  character — e.g. a Cleave that kills two item-bearers). Held back until the
   *  Poison check / earlier forced prompts resolve (Rules Note 2026-07-08). */
  pendingItemTransferQueue: PendingItemTransfer[];
  /** Remaining setup steps as `"<step>:<player>"`, e.g. "mulligan:p1". Synced so MP
   *  setup is SERIALIZED — only the head step's owner acts (turn-like, so the wholesale
   *  state-sync stays correct even for cross-half class bonuses); the other peer waits.
   *  Empty once setup is complete. */
  setupQueue: string[];
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

/** Coercion (on-enter keyword): the opponent of the entering companion must discard
 *  a card or sacrifice a permanent — the VICTIM makes the choice (Game Rules,
 *  "Inactive Player Restrictions"). Their PC is not a legal sacrifice: a forced
 *  game loss is not a cost, so only companions/constructs qualify. */
export interface PendingCoercion {
  source: string;       // the Coercion companion's name
  victim: 'p1' | 'p2';  // who chooses and pays
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
  /** Scavenger: the recovered ITEM is attached to this entity instead of going to hand. */
  attachTo?: { id: string; name: string };
}

/** One record of damage the attacker dealt this combat (used to fire combat triggers). */
export interface DamageEvent {
  id: string;
  kind: BoardEntity['kind'];
  owner: 'p1' | 'p2';
  physical: boolean;   // construct that is a Physical Construct
  destroyed: boolean;  // removed from the board by this damage
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
  banes: string[];             // "X's Bane" subjects — hits double vs matching companions
  poison: boolean;             // attacker has Poison — damaged characters are exhausted + countered
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

/** One Item Transfer on Character Exit window (rules §Items): "When a character leaves
 *  the encounter with one or more items attached, the controlling player may exhaust a
 *  ready character in their party with an open slot of the appropriate type to
 *  immediately equip one of those items." Ruled 2026-07-08: applies to ALL exits —
 *  death, fleeing, bounce, sacrifice. Items resolve head-first; `usedIds` enforces
 *  "each character can only be exhausted once in this way per triggering event"
 *  (one event per departing character). The item cards already sit in the owner's
 *  Dead Zone; claiming removes them (save-safe — no limbo zone). Constructs cannot
 *  carry items, so no window ever opens for them (ruled N/A 2026-07-08). */
export interface PendingItemTransfer {
  lp: 'p1' | 'p2';                        // departed character's controller — the chooser
  sourceName: string;                     // the departed character (prompt title)
  items: { id: string; name: string }[];  // unclaimed item cards (ids = Dead-Zone card ids)
  usedIds: string[];                      // characters already exhausted this event
}

/** A deferred start-of-turn MODAL choice (Pyre of the Unbound: "you may sacrifice this
 *  construct: deal 4 damage to target character OR 2 damage to each opposing
 *  character"). The clause-level cost is paid at RESOLUTION — declining (optional
 *  clauses) pays nothing. A chosen option that needs a target chains into
 *  pendingActionTarget. Synced + recorded like every game-level prompt. */
export interface PendingModalChoice {
  lp: 'p1' | 'p2';                                   // the option chooser (controller)
  sourceName: string;
  sourceId: string;                                  // the source permanent
  options: { label: string; effects: Effect[] }[];
  cost?: 'sacrificeSelf';                            // paid when an option is chosen
  optional: boolean;                                 // "you may" — decline allowed
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
