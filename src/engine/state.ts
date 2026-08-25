// ─── Game state types ───────────────────────────────────────────────────────────
// The pure, serializable game state: players, board, and every cross-client prompt
// that lives inside `game` (synced wholesale over multiplayer). Moved verbatim from
// src/store/gameStore.ts (extraction plan, slice 2). Store-local prompt types
// (PendingAction/PendingPlay/PendingTrigger/PendingKit/…) stay in the store.
import type { BoardEntity, Card } from '../types/card';
import type { Effect, Trigger } from '../types/effects';
import type { Board, SlotId } from './geometry';

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
  /** +1 Willpower while any Inspire permanent YOU control is in play (Paladin,
   *  2026-08-18). Does not stack. The mirror of `dismayed` in both sign and
   *  direction — Dismay reads the OPPONENT's board, Inspire reads your own. Both
   *  are derived: recomputeStatics owns them, nothing else writes them.
   *  OPTIONAL and present ONLY when true (fixture-hash discipline, corrected
   *  2026-08-19): `dismayed: false` predates the committed replay fixtures and is
   *  IN their recorded states, but an unconditional `inspired: false` re-hashed
   *  every recorded snapshot from the first recomputeStatics onward — all three
   *  fixtures diverged at step 10 (placePc). Post-fixture fields stay absent when
   *  clear, the triggerStack convention. */
  inspired?: boolean;
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
  // ── Arc A prompts (2026-07-22). All three OPTIONAL and reset to `undefined` when
  //    cleared — games that never arm them keep their exact pre-arc canonical replay
  //    hash (stableStringify omits undefined-valued keys; the triggerStack discipline).
  /** Forced discard chosen by the discarding player (discard op). Routed to the
   *  victim's client; everyone else is held (see `reactiveHold`). */
  pendingDiscard?: PendingDiscard | null;
  /** Further discards queued behind the active one (e.g. one per damage event). */
  pendingDiscardQueue?: PendingDiscard[];
  /** Opponent-hand reveal (revealHand op). Routed to the LOOKER's client; the
   *  hand's owner is held (see `reactiveHold`). */
  pendingHandReveal?: PendingHandReveal | null;
  /** Mid-combat Armor choice — when an attack hits a character with 2+ armor pieces,
   *  combat PAUSES and the DEFENDER picks which piece absorbs the hit (rules: "the
   *  controlling player chooses which armor prevents the damage"). Carries the
   *  serializable resume state so combat continues after the pick. Routed to the
   *  defender; the attacker is held (see `reactiveHold`) until it resolves. */
  pendingArmor: PendingArmor | null;
  /** Pre-attack optional ability prompt (Mara: "you may pay HP from your PC: +N damage").
   *  Routed to the attacker; combat commits once they choose via `resolveAttackChoice`. */
  pendingAttackChoice: PendingAttackChoice | null;
  /** Forced-sacrifice prompt (owner rewording 2026-08-11, The Final Word —
   *  supersedes the same-session Arc H attack-toll gate): a declaration-window
   *  trigger demands that the ATTACKER's controller sacrifice a permanent of their
   *  choice (canBeSacrificed chokepoint — PC never offerable). MANDATORY — no
   *  decline exists; the stack PAUSES on it (the Arc A trap-discard pattern) and
   *  the queued attack proceeds when it resolves (fizzling at the damage step if
   *  the attacker itself was the sacrifice — the Glass Cannon precedent). Routed
   *  to the payer; everyone else is held (reactiveHold). OPTIONAL and reset to
   *  `undefined` when cleared — games that never arm it keep their exact pre-arc
   *  canonical replay hash (the triggerStack discipline). */
  pendingForcedSacrifice?: PendingForcedSacrifice | null;
  /** A combat-trigger target choice (Requiem Arc B, owner-ruled 2026-08-25 — Satyr of
   *  the Reel): the attacker's controller picks the clause's own-side target while
   *  the declared attack sits paused beneath it on the stack (the forced-sacrifice
   *  discipline exactly; resolveCombatPick resumes). Routes to `lp`; everyone else
   *  is held (reactiveHold). OPTIONAL and absent when clear — games that never arm
   *  it keep their exact pre-arc canonical replay hash. */
  pendingCombatPick?: import('./combat').CombatPickRequest | null;
  /** HAUNT returns owed but not yet resolved (Requiem Arc C, 2026-08-25). A death
   *  that passes the Haunt check (companion, effective Haunt, no Memory counters —
   *  read on the PRE-removal entity) queues here; the return arms only after the
   *  death has FULLY resolved (item transfer + poison windows clear — canon "the
   *  death fully happens first"). `lp` is the card's OWNER (stolenFrom routing).
   *  Both keys OPTIONAL and absent when clear (fixture-hash discipline). */
  pendingHauntQueue?: PendingHauntReturn[];
  /** The armed Haunt return: >1 open owner slots → the OWNER picks the slot
   *  (resolveHauntSlot, any line — the ratified wording carries no line
   *  restriction); a singleton auto-places; a full board drops the return with NO
   *  Memory counter placed (Haunt retained — the 2026-08-25 counter-rework ruling). */
  pendingHauntReturn?: (PendingHauntReturn & { eligibleSlots: string[] }) | null;
  /** Control-theft reversion slot pick (Arc I 2026-08-11, Command the Broken —
   *  owner-ratified GENERAL rule, ruling 6): a companion returning to its owner's
   *  control WITHOUT passing through their hand may be placed in ANY available
   *  slot, Front or Back (a deliberate exception to the Back-Line-only
   *  play-from-hand rule). Armed by endTurn when >1 slot is open (singleton
   *  auto-places; a FULL board sacrifices to the owner's Dead Zone — the flee
   *  OUTCOME, never the flee trigger); endTurn PAUSES (the turn has not ended)
   *  until resolveReversionSlot places the companion and re-invokes it — the
   *  reversion must complete BEFORE the next player's ready phase (the Arc I
   *  timing finding: runReadyPhase runs pre-flip). Routed to the OWNER; the
   *  caster is held (reactiveHold). OPTIONAL (hash discipline). */
  pendingReversion?: PendingReversion | null;
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
  // ── The trigger stack (reactive-trigger arc, owner-ratified 2026-07-12). Canon
  //    (Card_Design_Parameters §13/§21, quoted verbatim): "Use a stack - multiple
  //    triggers resolve in order (most recent first)"; "Resolve most recent first
  //    (last in, first out)". Playing a card puts it on the stack; it does not enter
  //    the encounter until the stack empties down to it (R1). Both fields are
  //    OPTIONAL and set back to `undefined` whenever the stack drains: games that
  //    never queue a trigger keep their exact pre-arc canonical replay hash
  //    (stableStringify omits undefined-valued keys). ────────────────────────────
  /** The LIFO trigger stack — LAST element is the top (next to resolve). Present
   *  only while non-empty. */
  triggerStack?: StackEntry[];
  /** Simultaneous-trigger ordering prompt: >1 reactive trigger queued at once — their
   *  OWNER decides the order they go on the stack (Rules Note 2026-07-22: each player
   *  orders their own simultaneous triggers; supersedes the 2026-07-12 active-player
   *  reconfirmation and Tier 5 #9 / Tier 3 #18's tiebreaker — `lp` is the batch's
   *  controller, via batchOrderer). Present only while a choice is pending. */
  pendingTriggerOrder?: PendingTriggerOrder | null;
  // ── Damage prevention (capability arc 2, owner-ratified 2026-07-14). Both fields
  //    are OPTIONAL and set back to `undefined` when drained, so games with no
  //    prevention sources keep their exact pre-arc canonical replay hash (same
  //    discipline as the trigger-stack fields above). ─────────────────────────────
  /** Prevention-ordering prompt (R3): >1 prevention effect could apply to one damage
   *  instance — the AFFECTED character's controller orders them (blind picks, the
   *  PendingTriggerOrder pattern). Present only while a choice is pending. */
  pendingPreventOrder?: PendingPreventOrder | null;
  /** Deferred non-combat prevention orderings (armorSink discipline: the HP outcome
   *  is order-independent and was applied at damage time; the queued choice decides
   *  only whether/which armor piece takes a counter). Armed at resolution boundaries
   *  via armPrompts. Present only while non-empty. */
  preventOrderQueue?: PreventOrderData[];
}

// ─── Trigger-stack entries (R1–R4, owner-ratified 2026-07-12) ──────────────────
/** Reactive trigger windows resolvable purely from synced game state (no store-local
 *  prompt machinery). Queued above the event's subject; resolve LIFO. Once queued,
 *  a trigger resolves even if its source or subject has since died (R1). */
export type ReactiveStackEntry =
  /** A card-authored reactive clause (the trap triggers). Resolution runs the source
   *  CARD's clauses for `trigger` with the event subject bound to 'eventSubject'. */
  | { kind: 'reactive'; sourceId: string; sourceName: string; controller: 'p1' | 'p2';
      trigger: Trigger; subjectId: string; subjectName: string }
  /** A Paranoia play-window trigger: the controller peeks the placer's deck BEFORE
   *  the companion enters (R3, re-ruled 2026-07-12 — "Peek first 100%"). Resolution
   *  arms a PendingPeek owned by the controller and PAUSES the stack. */
  | { kind: 'paranoia'; sourceName: string; controller: 'p1' | 'p2'; deckSide: 'p1' | 'p2' }
  /** One of an entered permanent's OWN simultaneous enter triggers (Arc G 2026-08-04,
   *  the multi-pending enter window): a card with >1 enter trigger splits into one
   *  entry per trigger, ordered by their OWNER via the standing PendingTriggerOrder
   *  prompt (Rules Note 2026-07-22) and resolved LIFO off the stack. Each unit is
   *  evaluated FRESH at resolution (per-event state, 2026-07-21) — an earlier unit's
   *  outcome (an item taken, a card discarded) is visible to later ones. Supported
   *  units are the GAME-level prompt kinds only: 'scavenger' (the keyword's optional
   *  Dead-Zone attach), 'coercion' (the keyword's victim modal), 'structured' (the
   *  card's authored onEnter clauses, no-target ops only). entId anchors self-ish
   *  effects and the Scavenger attach; `card` carries the played card (the ownEnter
   *  discipline — read the hand card, never a catalog lookup); sourceName = card.name
   *  (labels, hold banners). */
  | { kind: 'enterUnit'; unit: 'scavenger' | 'coercion' | 'structured' | 'entomb';
      entId: string; sourceName: string; card: Card; controller: 'p1' | 'p2' };

export type StackEntry =
  /** The played card itself, waiting on the stack (R1): resolving it ENTERS the
   *  entity, then queues the enter-event triggers (own on-enter first, reactive
   *  triggers above — ruled sequence for Tripwire, 2026-07-12). Carries the played
   *  CARD: the on-enter machinery reads the hand card, not a CATALOG lookup. */
  | { kind: 'enter'; ent: BoardEntity; card: Card; slot: SlotId; controller: 'p1' | 'p2' }
  /** The entered permanent's own on-enter ability. Resolves via the store's on-enter
   *  machinery (may arm store-local prompts, so in multiplayer only the controller's
   *  client may resolve it — others hold). Still resolves if the entity died to a
   *  trap that resolved above it (R1: queued triggers survive death). */
  | { kind: 'ownEnter'; entId: string; card: Card; slot: SlotId; controller: 'p1' | 'p2' }
  /** The attacker's own declaration-window ("when this attacks") triggers — resolve
   *  during the attack step BEFORE damage is queued (R2). Carries a snapshot so the
   *  clauses still resolve if the attacker dies to a trap queued above. */
  | { kind: 'ownAttack'; attacker: BoardEntity; side: 'p1' | 'p2' }
  /** The attack's damage step (R2: declaration and damage are separate steps).
   *  Resolving it drives the hit queue — unless the attacker is dead by then, in
   *  which case damage is never queued and the attack fizzles. */
  | { kind: 'attackDamage'; ctx: AttackCtx }
  /** ONE forced attack, not yet declared (FINAL SWEEP, owner ruling 2026-08-21:
   *  FORCED ATTACKS ARE ATTACKS). Press the Line makes each front-line companion
   *  attack, and each of those is a real attack that opens the FULL declaration
   *  window — Iron Spikes, The Final Word, Quillspine and every other member of the
   *  family fire exactly as they would on a chosen attack.
   *
   *  It is an ENTRY rather than inline damage for two reasons that both matter:
   *  · SEQUENCING. The window can PAUSE (an ordering prompt, an armor choice, a
   *    Final Word demand). The stack already knows how to pause and resume; a loop
   *    inside the interpreter does not.
   *  · PER-ATTACK DECLARATION SNAPSHOT (R2). Each attack's damage and keywords are
   *    stamped when ITS OWN declaration resolves, not when the card was played — so
   *    a first attacker that kills a buff source correctly lowers the second
   *    attacker's damage. Pushing a pre-built AttackCtx per attacker would have
   *    frozen all N snapshots at play time, which is the bug this shape avoids.
   *
   *  Pushed in REVERSE by the interpreter so slot-scan order resolves first (LIFO).
   *  Expanded by runStack through the SAME assembly a chosen attack uses. */
  | { kind: 'forcedAttack'; attackerId: string; targetId: string; side: 'p1' | 'p2'; sourceName: string }
  | ReactiveStackEntry;

/** Write the stack back, keeping the OPTIONAL-field invariant: `undefined` (not `[]`)
 *  when empty, so games that never queue a trigger — and games after every stack
 *  drains — hash identically to pre-arc state (stableStringify omits undefined keys;
 *  committed replay fixtures must not all retire over a phantom field).
 *  MOVED HERE from engine/stack.ts 2026-08-21 (re-exported there) — see the note at
 *  the old site: the interpreter must push, and stack.ts imports the interpreter. */
export function setStack(game: GameState, stack: StackEntry[]): GameState {
  return { ...game, triggerStack: stack.length ? stack : undefined };
}

/** Push entries onto the stack (later elements end up nearer the top). */
export function pushStack(game: GameState, entries: StackEntry[]): GameState {
  if (!entries.length) return game;
  return setStack(game, [...(game.triggerStack ?? []), ...entries]);
}

/** Simultaneous-trigger ordering prompt. `items` are the reactive triggers that
 *  queued at once; their OWNER (`lp` = the batch's controller — Rules Note
 *  2026-07-22) picks resolution order BLIND (nothing resolves between picks — the
 *  order is decided at queue time, then they go on the stack). `picked` accumulates
 *  item indices in RESOLUTION order; when one unpicked item remains the order is
 *  complete and the stack runs. */
export interface PendingTriggerOrder {
  lp: 'p1' | 'p2';
  items: ReactiveStackEntry[];
  picked: number[];
  /** Arc G (2026-08-04, mixed-owner play window): the OTHER owner's segment of a
   *  structurally-queued batch, awaiting its own ordering AFTER this one completes
   *  (Rules Note 2026-07-22: the active player's triggers queue first, the
   *  non-active player's above — so the active segment is ordered/pushed first and
   *  `next` holds the non-active one). Serialized per-owner prompts, never dual-hold
   *  (the Arc F discipline). OPTIONAL — absent for every single-owner batch (hash
   *  discipline). */
  next?: { lp: 'p1' | 'p2'; items: ReactiveStackEntry[] };
}

// ─── Damage prevention (arc 2, owner-ratified 2026-07-14) ──────────────────────
/** One orderable prevention item on a single damage instance. Armor is a member of
 *  the prevention family (canon ARMOR X, re-cut 2026-08-18: "This item enters the
 *  encounter with X armor counters. If the equipped character would be dealt damage,
 *  prevent all of that damage and remove an armor counter from this item.") — each
 *  equipped piece is its own item, so ordering a piece first both engages armor AND
 *  picks the piece. An armor item reached when the running damage is already 0 never
 *  engages: no counter is spent (R3's canonical consequence).
 *  `counters` is the number REMAINING on the piece (inverted 2026-08-18). */
export type PreventItem =
  | { kind: 'prevent'; sourceId: string; sourceName: string; amount: number }
  | { kind: 'armor'; pieceId: string; pieceName: string; counters: number; armor: number };

/** A damage instance whose prevention ordering awaits the affected character's
 *  controller (R3). `dmg` is the FORMED dealt amount — deal-side modifiers (Bane
 *  doubling, magic damage bonuses) are already applied (R1). */
export interface PreventOrderData {
  chooser: 'p1' | 'p2';        // the affected character's controller (R3)
  entityId: string;
  entityName: string;
  dmg: number;
  sourceName: string;          // what dealt the damage (modal title / toasts)
}
export interface PendingPreventOrder extends PreventOrderData {
  items: PreventItem[];
  /** Blind picks in RESOLUTION order (PendingTriggerOrder pattern): when one unpicked
   *  item remains the order is complete and the damage instance resolves. */
  picked: number[];
  /** Present = a PAUSED combat hit (resolvePreventOrder replays it with the chosen
   *  order and resumes the attack). Absent = a deferred non-combat ordering: the HP
   *  outcome already landed at damage time; resolution only places armor counters. */
  ctx?: AttackCtx;
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
  /** "Any deck" choice phase (2026-07-16): the controller picks WHICH deck before
   *  it is sliced (cards is empty until then; `look` carries the slice size).
   *  OPTIONAL fields — absent for ordinary peeks, so pre-mechanic games hash
   *  identically. resolvePeekDeck completes the phase. */
  chooseDeck?: true;
  look?: number;
  /** Reorder peek (Arc A, 2026-07-22): "put them back in any order" — the looker
   *  returns ALL looked-at cards to the top in a chosen sequence via
   *  resolvePeekOrder (a permutation), instead of per-card dest assignment.
   *  OPTIONAL — absent for ordinary peeks (hash discipline as above). */
  reorder?: true;
}

/** A forced discard chosen by the DISCARDING player (owner agency — the Coercion
 *  precedent): "target opponent discards a card". One prompt per single discard;
 *  further discards queue (pendingDiscardQueue). Routed to the victim's client;
 *  everyone else is held (see reactiveHold). */
export interface PendingDiscard {
  source: string;       // the card that forced the discard
  victim: 'p1' | 'p2';  // who chooses and discards
}

/** An opponent-hand reveal (Arc A, 2026-07-22): the LOOKER (`lp`) sees `handSide`'s
 *  hand. With `pick: 'toBottomDraw'` (Mark the Pockets) the looker may choose a
 *  card — it goes to the BOTTOM of its owner's deck and that player draws a card.
 *  Both clients hold full game state (the established info model); this prompt is
 *  UI entitlement — only the looker's client renders it, the hand's owner is held. */
export interface PendingHandReveal {
  source: string;
  lp: 'p1' | 'p2';        // the looker (prompt owner)
  handSide: 'p1' | 'p2';  // whose hand is revealed
  pick?: 'toBottomDraw';
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
  deck?: 'any' | 'opp';  // 'any' (2026-07-16): controller chooses the side; 'opp' (Arc A): the opponent's deck
  reorder?: true;        // Arc A: "put them back in any order" (resolvePeekOrder)
}

/** Coercion (on-enter keyword): the opponent of the entering companion must discard
 *  a card or sacrifice a permanent — the VICTIM makes the choice (Game Rules,
 *  "Inactive Player Restrictions"). Their PC is not a legal sacrifice: a forced
 *  game loss is not a cost, so only companions/constructs qualify. */
export interface PendingCoercion {
  source: string;       // the Coercion companion's name (or the forcing Action's)
  victim: 'p1' | 'p2';  // who chooses and pays
  /** Arc F (2026-07-24, Siege Rations): a symmetric effect chains the SAME choice
   *  to the other player after this one resolves — that player's halves are
   *  evaluated FRESH at chain time (per-event state, 2026-07-21). OPTIONAL —
   *  absent for keyword Coercion (hash discipline). */
  then?: 'p1' | 'p2';
  /** Arc F: neutral modal copy for action-sourced forced choices (the shipped
   *  Coercion copy names the keyword). Absent for keyword Coercion. */
  generic?: true;
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

/** A forced-sacrifice pick (owner rewording 2026-08-11, The Final Word): the event
 *  subject's controller must sacrifice a permanent of their choice — a REAL
 *  sacrifice event (destroyEntity 'sacrifice': death triggers + on-sacrifice
 *  listeners fire, per-event) resolved while the trigger stack is paused on it.
 *  Nothing else is captured: the declared attack sits beneath it ON THE STACK and
 *  simply resumes (R1/R2 handle a vanished attacker or target natively). */
export interface PendingForcedSacrifice {
  lp: 'p1' | 'p2';       // who must sacrifice (the attacking companion's controller)
  sourceName: string;    // the demanding permanent (prompt/hold label)
}

/** One owed HAUNT return (Requiem Arc C, 2026-08-25): the dead card that returns to
 *  an empty Command Zone slot its OWNER controls, exhausted, with a Memory counter. */
export interface PendingHauntReturn {
  lp: 'p1' | 'p2';       // the card's OWNER — the return routes to their board
  cardId: string;        // the card in the owner's Dead Zone
  cardName: string;      // prompt/hold label
}

/** A control-theft reversion awaiting the OWNER's slot choice (Arc I 2026-08-11):
 *  the stolen companion (still sitting on the caster's board) returns to `lp`'s
 *  board in the slot they click — any line (ruling 6). */
export interface PendingReversion {
  lp: 'p1' | 'p2';       // the owner — who chooses the slot
  entId: string;         // the stolen companion (on the OTHER board right now)
  sourceName: string;    // the companion's name (hold/prompt label)
}
