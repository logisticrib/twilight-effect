import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { recordActions } from './recordMiddleware';
import type { BoardEntity, Card, TapState } from '../types/card';
import type { Effect, TargetSpec, Condition } from '../types/effects';
import { CATALOG, SORCERER_WARRIOR_CARDS, WIZARD_BUILDER_CARDS, tributeOf } from '../data/catalog';
import { recomputeStatics, isImmuneToSplash, HIT_RUN_STATUS,
         isPhysicalConstruct, parseEnterTrigger, type EnterTriggerKind,
         isCharacter, firstItemOf, allItemsOf, canHoldItem, effectiveAttack, effectiveKeywords, effectiveMaxHp, wardedLines,
         canPlayActionCard, specialActionActor, minorActionReason, actionTypeOf, currentWillpower, parseBanes,
         POISONED_STATUS, parseAnimateMagic, parseArmorKeyword, parseEntomb,
         attackRestrictedBy, moveRestrictedBy, hasModifier,
         canAttackFromPosition, isLegalAttackTarget, bindingGuardianIds, legalAttackTargetIds,
         conditionMet } from './keywords';

// Everything relocated to the headless engine stays importable from this module —
// external import sites don't churn during the extraction (see src/engine/index.ts).
export * from '../engine';
import { ADJ, FRONT_SLOTS, BACK_SLOTS, isFront, findSlot, type SlotId, type Board,
         type Phase, type GameState,
         type PendingCoercion, type PendingDeadPick, type PendingDiscard, type PendingHauntReturn,
         type AttackCtx, type ArmorChoiceData,
         type PendingItemTransfer, type StackEntry, type ReactiveStackEntry,
         gatherParanoia, gatherReactive, gatherOwnSide, gatherEquippedAttacked, gatherSelfAttacked,
         pushStack, setStack, resolveReactiveEntry,
         orderedForStack, batchOrderer, segmentBatch, resolveCombatTriggers, combatTriggerEffects,
         findEntityAnywhere, updateEntity, removeEntity, canBeSacrificed,
         itemProfileOf, itemTransferCandidates, armNextItemTransfer,
         setPcHp, payPcHp, pcIdOf, charsOf, millCards, drawCards, type CombatPickRequest,
         ownPhysicalConstructIds,
         eligibleTargets, filterEligibleByEffects, effectsWouldAffectSomething, actionTargetSpec, twoStepKind, isInteractiveSpec,
         permanentEffects, gatherActivated, abilityUsedTag, magicCtx,
         destroyEntity, applyDamage, applyCombatHit, driveAttack, optionalAttackAbility,
         attackDamageBonus, resolveActionEffects, armPrompts, armNextArmorChoice,
         removeArmorCounter, applyPreventionOrder, armNextPreventOrder,
         freshActs, uid, computeWillpower, makeNewGame, nextPeek, buildPeek,
         equipOnto, kitDests, runReadyPhase, tributePayable } from '../engine';

export type PlayPhase = 'lobby' | 'setup' | 'game';
/** 'placing-pc' = waiting for the local player to choose a Back Line slot */
export type SetupStep = 'mulligan' | 'classbonus' | 'placing-pc' | 'done';


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

/** TRIBUTE payment awaiting the caster's pick (Arc E, 2026-08-23).
 *
 *  STORE-LOCAL, deliberately — the same contract pendingPlay and pendingActionTarget
 *  already have (verified 2026-08-21, `3a18396`): MP broadcasts GameState only and
 *  useMultiplayer suppresses broadcasts while a local pending is outstanding, so this
 *  exists solely on the acting client. No new wire shape, and NO held-client banner —
 *  the opponent never has the pending. That is the opposite of the game-state pendings
 *  (pendingArmor, pendingForcedSacrifice) which route to the OTHER player and must gate.
 *
 *  Everything needed to finish the play is captured here, because the play is suspended
 *  mid-reducer: all legality already passed (see placeCard), so resuming must not
 *  re-derive it. `pcId` is the acting Player Character captured BEFORE payment. */
export interface PendingTribute {
  cardId: string;
  slot: SlotId;                 // the already-validated destination
  lp: 'p1' | 'p2';
  sourceName: string;           // the Angel being played (prompt label)
  sacrificeSubtype: string;     // what the cost demands (prompt label)
  actorId?: string | null;
  pcId?: string | null;
  /** The legal payments. One entry when the caster clicked a slot HELD by a payable
   *  Beast — the offering makes room, and that click already chose the Beast. */
  options: { id: string; slot: SlotId; name: string }[];
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
  // Arc A (2026-08-19) adds the two destroy kinds. They differ from the others in
  // that STEP 1 mutates the board, so cancelling at step 2 commits (see
  // cancelActionTarget) instead of returning the card to hand.
  twoStep?: 'reposition' | 'disarm' | 'moveAnchor' | 'gainControl' | 'destroyThenHeal' | 'destroyUpTo' | 'readyUpTo';
  firstId?: string;            // the first chosen entity (set on step 2)
  eligibleSlots?: SlotId[];    // clickable empty slots when step 2 is a slot pick
}

/** Equip-from-hand prompt (Veteran of the Ashgrove): pick an item to equip to `targetId`. */
export interface PendingEquipPick {
  source: string;
  lp: 'p1' | 'p2';
  targetId: string;   // the entity that will wear the item
  items: Card[];      // the equippable items in hand
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

/** Store-local (unsynced) prompt state, nulled whenever a new game starts, control
 *  changes hands, or a save resumes — stale prompts from a previous game reference
 *  dead entity ids. Game-level synced prompts live in GameState (reset by makeNewGame). */
const LOCAL_PROMPTS_CLEARED = {
  pending: null, pendingPlay: null, pendingTribute: null, pendingTrigger: null, pendingKit: null,
  pendingActionTarget: null, pendingEquipPick: null, pileView: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

/** Commit a finished attack: seal activation, clear selection, and arm any deferred
 *  Dead-Zone picks + Armor choices (the latter from combat triggers). */
function finalizeAttack(game: GameState, ctx: AttackCtx): GameState {
  return recomputeStatics({
    ...armPrompts(game, ctx.deadSink, ctx.armorSink),
    ...activationPatch(game, ctx.charId),
    selected: null,
  });
}

/** Store-side toast factory (same shape/expiry as the inline reducer pattern). The
 *  timeout writes through `useGameStore.setState` — a plain state patch, not an
 *  action, so the record middleware never sees it. */
function mkToasts(msgs: string[]): { id: number; msg: string }[] {
  return msgs.filter(Boolean).map(msg => {
    const id = ++toastId;
    setTimeout(() => useGameStore.setState(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { id, msg };
  });
}

/** Held-refusal for the reactiveHold gate: a reducer refused because the opponent owns
 *  a live reactive prompt must SAY so — a silent return reads as a dead click (no-
 *  silent-outcomes convention; surfaced by the live two-peer MP pass 2026-07-21, where
 *  a held endTurn did nothing with no reason shown). Same message activateAbility's
 *  gate has always toasted; ReactiveHoldBanner derives from the same reactiveHold(). */
function heldRefusal(s: { toasts: { id: number; msg: string }[] }, hold: string) {
  return { toasts: [...s.toasts, ...mkToasts([`Waiting for the opponent to resolve ${hold}.`])] };
}

/**
 * Commit an attack (R2, owner 2026-07-12: declaration and damage are SEPARATE steps —
 * damage does not go on the stack at declaration): tap the attacker, build the hit
 * queue (primary + Cleave), queue the declaration-window triggers ("when/whenever X
 * attacks" — the attacker's own onAttack clauses first, opposing reactive traps like
 * Iron Spikes above them), then let the stack run: triggers resolve BEFORE damage is
 * ever queued, and a dead attacker fizzles the attack. Attacks with no
 * declaration-window triggers take the legacy inline drive (identical behavior).
 * `bonusDmg` is the optional on-attack bonus the player opted into (else 0).
 */
/**
 * THE DECLARATION ASSEMBLY, shared by both ways an attack can happen (extracted
 * 2026-08-21 for the forced-attacks-are-attacks ruling):
 *   · commitAttack   — a chosen attack, declared by its controller
 *   · runStack's 'forcedAttack' — a compelled attack (Press the Line)
 * Taps the attacker, stamps the AttackCtx (R2: damage and keywords are snapshotted at
 * DECLARATION), builds the Cleave hit queue, and gathers every declaration-window
 * trigger. It does NOT drive the stack — the two callers differ only in that.
 *
 * A second copy of this would be how a forced attack drifts back into being a
 * second-class attack, which is exactly what the ruling forbids.
 * Returns null when the attacker or target is gone.
 */
function declareAttack(game: GameState, charId: string, targetEntityId: string, bonusDmg: number): {
  game: GameState; ctx: AttackCtx; declReactive: ReactiveStackEntry[];
  hasOwnAttack: boolean; attacker: BoardEntity; side: 'p1' | 'p2';
} | null {
  const attLoc = findEntityAnywhere(game, charId);
  const tgtLoc = findEntityAnywhere(game, targetEntityId);
  if (!attLoc || !tgtLoc) return null;   // attacker or target gone — caller decides how loudly
  const attacker = attLoc.ent;
  const oppPlayer: 'p1' | 'p2' = attLoc.player === 'p1' ? 'p2' : 'p1';

  const newGame = updateEntity(game, charId, { tapped: 'major', exhausted: true, acts: { ...attacker.acts, major: true } });
  const dmg = effectiveAttack(attacker, game) + attackDamageBonus(attacker, game, attLoc.player) + bonusDmg;
  const attackerKws = effectiveKeywords(attacker, game);
  const hitQueue = [targetEntityId];
  const acroMsgs: string[] = [];
  if (attackerKws.includes('Cleave')) {
    const tgtSlot = findSlot(game[oppPlayer].board, targetEntityId);
    if (tgtSlot) for (const ls of (isFront(tgtSlot as SlotId) ? FRONT_SLOTS : BACK_SLOTS)) {
      const lineEnt = newGame[oppPlayer].board[ls];
      if (!lineEnt || lineEnt.id === targetEntityId) continue;
      // Cleave hits "each CHARACTER on the same line" (rules §Evergreen Keywords) —
      // constructs are not characters and cannot be attacked (§Targeting Rules).
      if (!isCharacter(lineEnt)) continue;
      if (isImmuneToSplash(lineEnt, game)) { acroMsgs.push(`${lineEnt.name} evades the Cleave (Acrobatics)`); continue; }
      hitQueue.push(lineEnt.id);
    }
  }
  const ctx: AttackCtx = {
    charId, attackerName: attacker.name, attackerPlayer: attLoc.player, dmg, hitQueue, phase: 'damage',
    banes: parseBanes(attackerKws),
    poison: attackerKws.includes('Poison'),
    reckless: attackerKws.includes('Reckless'),
    hitRun: attackerKws.includes('Hit & Run'),
    msgs: acroMsgs, events: [], deadSink: [], armorSink: [],
  };

  // Declaration-window triggers. Reactive traps (Iron Spikes) fire only when an
  // opposing COMPANION attacks one of the trap controller's COMPANIONS (R4); the
  // attacker's own onAttack clauses queue FIRST, traps above them — so the traps
  // resolve first, the attacker's clauses after. Originally the 2026-07-12 ruled
  // queue order; since the 2026-07-22 Rules Note this is DERIVED from the general
  // rule (the active player's simultaneous triggers queue first, the non-active
  // player's above — theirs resolve first). Behavior byte-identical, code unchanged.
  // Board traps keep their R4 companion-vs-companion scope; item-hosted triggers
  // (Arc E — Caltrop Pouch's 'onEquippedAttacked') gather from the ATTACKED
  // character's live loadout, any attacker, PC bearer included (text-literal).
  // Same controller (the defender) → one batch, batchOrderer's construction holds.
  const declReactive = [
    ...(attacker.kind === 'companion' && tgtLoc.ent.kind === 'companion'
      ? gatherReactive(newGame, 'oppCompanionAttacksCompanion', { id: charId, name: attacker.name, controller: attLoc.player })
      : []),
    // 'oppCompanionAttacks' (owner rewording 2026-08-11, The Final Word): ANY
    // attack by an opposing companion — PC targets included ("whenever an opposing
    // companion attacks" carries no target scope; the R4 companion-vs-companion
    // reading stays with the trap window above). Same controller as the other
    // defender-side entries — the batch construction holds.
    ...(attacker.kind === 'companion'
      ? gatherReactive(newGame, 'oppCompanionAttacks', { id: charId, name: attacker.name, controller: attLoc.player })
      : []),
    ...gatherEquippedAttacked(tgtLoc.ent, tgtLoc.player, { id: charId, name: attacker.name }),
    // SELF-hosted (Arc D, 2026-08-23 — Quillspine Porcupine): the attacked character's
    // OWN card. Same defender-side controller as every entry above, so the batch stays
    // single-controller and batchOrderer's construction holds. Gathered from the
    // PRE-DAMAGE board, so a Guardian-bound attack fires it exactly like any other —
    // being attacked BECAUSE Guardian redirected the attack is still being attacked.
    ...gatherSelfAttacked(tgtLoc.ent, tgtLoc.player, { id: charId, name: attacker.name }),
  ];
  const hasOwnAttack = combatTriggerEffects(attacker, 'onAttack').length > 0;
  return { game: newGame, ctx, declReactive, hasOwnAttack, attacker, side: attLoc.player };
}

/**
 * Commit a CHOSEN attack: declare it (above), then drive. Unchanged behavior — the
 * no-window fast path still takes the legacy inline drive byte-identically, which
 * matters because every committed replay fixture's RNG cadence depends on it.
 */
function commitAttack(s: StackRunCtx, game: GameState, charId: string, targetEntityId: string, bonusDmg: number):
  { game: GameState; local: Partial<GameStoreState>; toastMsgs: string[] } {
  const d = declareAttack(game, charId, targetEntityId, bonusDmg);
  if (!d) return { game, local: {}, toastMsgs: [] };
  const { game: newGame, ctx, declReactive, hasOwnAttack, attacker } = d;
  const attLoc = { player: d.side };

  if (!declReactive.length && !hasOwnAttack) {
    // No declaration-window triggers — legacy inline drive, byte-identical behavior.
    const res = driveAttack(newGame, ctx);
    if (!res.done) return { game: { ...res.game, pendingArmor: res.pendingArmor ?? null, pendingPreventOrder: res.pendingPreventOrder }, local: {}, toastMsgs: [] };
    return { game: finalizeAttack(res.game, res.ctx), local: {}, toastMsgs: [res.ctx.msgs.join(' | ')] };
  }

  let g = pushStack(newGame, [
    { kind: 'attackDamage', ctx },
    ...(hasOwnAttack ? [{ kind: 'ownAttack', attacker, side: attLoc.player } satisfies StackEntry] : []),
  ]);
  if (declReactive.length > 1) {
    // >1 simultaneous reactive trigger — their CONTROLLER (the defender) orders them
    // (Rules Note 2026-07-22: each player orders their own simultaneous triggers;
    // supersedes the 2026-07-12 active-player reconfirmation and Tier 5 #9 /
    // Tier 3 #18 — the once-rejected trap-controller reading is now the rule).
    g = { ...g, pendingTriggerOrder: { lp: batchOrderer(declReactive), items: declReactive, picked: [] } };
    return { game: g, local: {}, toastMsgs: [] };
  }
  const r = runStack(pushStack(g, declReactive), s);
  return { game: r.game, local: r.local, toastMsgs: r.toastMsgs };
}

/**
 * A reactive Dead-Zone prompt owned by the OTHER player (e.g. the defender's Memory
 * Stone, fired by the attacker's kill) HOLDS the active player until it resolves —
 * otherwise the active player's continued actions would broadcast wholesale and clobber
 * the owner's resolution (the owner's modal already serializes their own side).
 * Returns the blocking source name, or null. The owner is never held by their own pick.
 */
/** Arc F (2026-07-24, Siege Rations): a resolved forced choice carrying `then`
 *  chains the SAME choice to the other player — that player's halves are evaluated
 *  FRESH here (per-event state, 2026-07-21: the second resolution reads the board
 *  the first one left behind). Neither half → unaffected, loud toast, no prompt
 *  (owner ruling 2026-07-24). Keyword Coercion carries no `then` — untouched.
 *  RATIFIED (owner 2026-07-24, Arc G brief): opponent-first resolution for "one
 *  action, both players choose" is settled canon, and the degenerate handling as
 *  built (which-HALF auto-resolves when forced; which-CARD always the player's) is
 *  confirmed — both formerly ⚠ flags, closed with no engine change. */
function chainForcedChoice(g: GameState, co: PendingCoercion, msgs: string[]): { game: GameState } {
  if (!co.then) return { game: g };
  const side = co.then;
  const discard = g[side].hand.length > 0;
  const sac = (Object.values(g[side].board) as (BoardEntity | undefined)[]).some(x => !!x && canBeSacrificed(x));
  if (!discard && !sac) {
    msgs.push(`${g[side].name} is unaffected — nothing to discard or sacrifice`);
    return { game: g };
  }
  msgs.push(discard && sac ? `${g[side].name} chooses: sacrifice a permanent or discard a card`
    : discard ? `${g[side].name} must discard a card (no permanent to sacrifice)`
    : `${g[side].name} must sacrifice a permanent (no cards in hand)`);
  return { game: { ...g, pendingCoercion: { source: co.source, victim: side, generic: true } } };
}

/** Arc G (2026-08-04): a resolved game-level prompt may have been PAUSING the
 *  multi-pending enter window — when the stack now rests on an 'enterUnit' and no
 *  blocking prompt remains, the next unit resolves (fresh, per-event). NARROW by
 *  construction: shipped stacks never hold enterUnit entries, so every shipped
 *  resolver path returns unchanged. Declared here (above the store) and driven from
 *  resolveDeadPick / cancelDeadPick / resolveCoercionDiscard / resolveCoercionSacrifice /
 *  resolveHandReveal — the four prompt kinds an enter unit can arm (peeks already
 *  re-enter via resolvePeek's standing stack resumption). */
function resumeEnterUnits(g: GameState, s: StackRunCtx):
  { game: GameState; local: Partial<GameStoreState>; msgs: string[] } {
  const top = g.triggerStack?.[g.triggerStack.length - 1];
  if (top?.kind !== 'enterUnit') return { game: g, local: {}, msgs: [] };
  if (g.pendingDeadPick || g.pendingCoercion || g.pendingHandReveal || g.pendingPeek
    || g.pendingDiscard || g.pendingTriggerOrder || g.pendingArmor || g.pendingPreventOrder
    || g.pendingItemTransfer || g.pendingPoison || g.pendingForcedSacrifice
    || g.pendingCombatPick) return { game: g, local: {}, msgs: [] };
  const r = runStack(g, s);
  return { game: r.game, local: r.local, msgs: r.toastMsgs };
}

export function reactiveHold(game: GameState, localPlayer: 'p1' | 'p2'): string | null {
  const dp = game.pendingDeadPick;
  if (dp && dp.lp !== localPlayer) return dp.source;
  // A Coercion prompt is the VICTIM's decision — the player who played the coercer
  // (and anyone else) waits for it.
  const co = game.pendingCoercion;
  if (co && co.victim !== localPlayer) return `${co.source}${co.generic ? ' (forced choice)' : ' (Coercion)'}`; // labeled per kind (the Doubt lesson)
  // A forced discard is the DISCARDING player's choice (Arc A 2026-07-22, the
  // Coercion pattern) — whoever forced it waits.
  const pd = game.pendingDiscard;
  if (pd && pd.victim !== localPlayer) return `${pd.source} (discard)`;
  // An opponent-owned deck peek: normally their own-turn scry (holding the inactive
  // peer is harmless), but with Paranoia the ACTIVE player's companion play arms a
  // peek OWNED by the inactive controller — the placer must wait for the decision.
  const pk = game.pendingPeek;
  if (pk && pk.lp !== localPlayer) return `${pk.source} (deck peek)`;
  // A hand reveal is the LOOKER's window (Arc A 2026-07-22) — the hand's owner
  // (and anyone else) waits while they look/pick.
  const hr = game.pendingHandReveal;
  if (hr && hr.lp !== localPlayer) return `${hr.source} (hand reveal)`;
  // A mid-combat Armor choice owned by the opponent (defender) holds the attacker
  // until it resolves, so the attacker's broadcasts don't clobber the resolution.
  const pa = game.pendingArmor;
  if (pa && pa.defender !== localPlayer) return `${pa.entityName}'s armor`;
  // The opponent's pre-attack pay-HP choice (Mara) — same clobber risk.
  const pac = game.pendingAttackChoice;
  if (pac && pac.lp !== localPlayer) return `${pac.sourceName} (attack choice)`;
  // The opponent's forced sacrifice (The Final Word, owner rewording 2026-08-11) —
  // the PAYER (the attacking companion's controller) chooses; everyone else waits.
  const pfs = game.pendingForcedSacrifice;
  if (pfs && pfs.lp !== localPlayer) return `${pfs.sourceName} (forced sacrifice)`;
  // The opponent's combat-trigger target pick (Requiem Arc B — Satyr of the Reel):
  // the attacker's controller chooses; everyone else waits.
  const pcp = game.pendingCombatPick;
  if (pcp && pcp.lp !== localPlayer) return `${pcp.source} (combat target)`;
  // The opponent's Haunt slot pick (Requiem Arc C) — the OWNER places their
  // returning companion; everyone else waits.
  const phr = game.pendingHauntReturn;
  if (phr && phr.lp !== localPlayer) return `${phr.cardName} (haunting)`;
  // The opponent's reversion slot pick (Arc I control theft) — the OWNER chooses
  // where their companion returns; the caster's turn cannot end until they do.
  const pr = game.pendingReversion;
  if (pr && pr.lp !== localPlayer) return `${pr.sourceName} (returning to its owner)`;
  // The opponent's Item Transfer window (e.g. the defender rescuing a killed bearer's
  // items) — the active player waits so broadcasts don't clobber the resolution.
  const it = game.pendingItemTransfer;
  if (it && it.lp !== localPlayer) return `${it.sourceName}'s items (Item Transfer)`;
  // The opponent's simultaneous-trigger ordering pick (trigger stack, 2026-07-12;
  // chooser re-ruled 2026-07-22) — the triggers' OWNER orders; everyone else waits.
  const po = game.pendingTriggerOrder;
  if (po && po.lp !== localPlayer) return 'simultaneous trigger ordering';
  // The opponent's prevention-ordering pick (R3, 2026-07-14) — the affected
  // character's controller orders; everyone else (usually the attacker) waits.
  const pv = game.pendingPreventOrder;
  if (pv && pv.chooser !== localPlayer) return `${pv.entityName}'s damage prevention`;
  // A trigger stack resting on the OTHER client's 'ownEnter' hand-off (its on-enter
  // machinery arms store-local prompts, so only the controller's client resolves it).
  const head = game.triggerStack?.[game.triggerStack.length - 1];
  if (head?.kind === 'ownEnter' && head.controller !== localPlayer) return `${head.card.name} (entering)`;
  // Arc G note (2026-08-04): an 'enterUnit'-headed stack needs NO clause of its own —
  // every enterUnit pause has a game-level prompt armed (runStack breaks only after
  // arming one), and each prompt's clause above already holds exactly the right
  // party (a Coercion unit must hold the placer, not its victim — the shipped
  // Coercion UX). Transient no-prompt gaps never sync: reducers drain the stack
  // synchronously before broadcasting.
  return null;
}

/** Once the game is decided, every gameplay reducer refuses — the board is frozen for
 *  review. (Session/UI actions — backToLobby, switchSides, selection, pile viewing —
 *  stay live.) Before this gate, a post-game endTurn even WIPED `gameOver` back to null. */
function gameIsOver(game: GameState): boolean {
  return game.gameOver !== null;
}

/** Action-phase actions are legal only IN the Action Phase: the Draw stop and the
 *  Class Zone Exchange must be resolved (or deliberately skipped) first. Reducer-level —
 *  the CZ panel overlay alone used to be the only block, so clicks/keys that bypassed
 *  the UI could act mid-CZ-phase. Prompt RESOLUTIONS (peeks, dead-picks, armor, poison)
 *  are exempt: they arm across phase boundaries and must resolve where they armed. */
function notActionPhase(game: GameState): boolean {
  return game.currentPhase !== 'action';
}

// ─── Trigger-stack driver (reactive-trigger arc, owner-ratified 2026-07-12) ─────
// The headless primitives live in src/engine/stack.ts; this driver stays in the
// store because two entry kinds reach store territory: 'attackDamage' finalizes via
// finalizeAttack (activation seal = store-level, per the extraction plan) and
// 'ownEnter' arms store-LOCAL prompts (pendingTrigger/pendingKit/…), so in
// multiplayer only the controller's client may resolve it.

/** The store fields runStack needs to read (never mutated here). */
type StackRunCtx = Pick<GameStoreState, 'localPlayer' | 'conn' | 'modalQueue' | 'oathContext'>;

/**
 * The entered permanent's own on-enter ability — the back half of the old placeCard,
 * extracted verbatim so it can resolve as a STACK item (R1: it queues before any
 * reactive enter-triggers, which resolve first; and it still resolves if the entrant
 * died to one of them — queued triggers survive death, ruled 2026-07-12). `game` is
 * post-placement (the entity is on the board, or already dead to a trap).
 */
function runOnEnter(
  game: GameState, card: Card, entId: string, lp: 'p1' | 'p2',
  s: StackRunCtx,
  deadSink: PendingDeadPick[], armorSink: ArmorChoiceData[],
): { game: GameState; local: Partial<GameStoreState>; msg: string } {
  const isCompanion = card.type === 'Companion';
  let g = game;
  const local: Partial<GameStoreState> = {};
  let enterMsg = `${card.name} enters the field!`;
  const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';

  // Oathsworn: place a sworn card beneath it (modal). Armed at ENTER — the permanent
  // is in the encounter now (with a Paranoia pause upstream this runs on the
  // controller's client via the resumeStack hand-off, like every local prompt here).
  if (card.keywords.includes('Oathsworn')) {
    local.modalQueue = [...s.modalQueue, 'oathsworn'];
    local.oathContext = { permanentId: entId, name: card.name };
  }

  // On-enter targeting keyword (Reinforce / Dismantle) — Reinforce targets your
  // own Physical Constructs, Dismantle targets the opponent's. If none exist the
  // trigger fizzles with a note rather than blocking. (The enterer itself is
  // excluded — pre-stack this ran against the pre-placement board.)
  const enterTrig = parseEnterTrigger(card.keywords);
  let pendingTrigger: PendingTrigger | null = null;
  if (enterTrig) {
    const targetBoard = enterTrig.kind === 'reinforce' ? g[lp].board : g[opp].board;
    const eligibleIds = (Object.values(targetBoard) as (BoardEntity | undefined)[])
      .filter((e): e is BoardEntity => !!e && isPhysicalConstruct(e) && e.id !== entId)
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
  // Computed on the LIVE board (the enterer is already placed, so it counts as a
  // possible destination — same eligibility the pre-stack code built by hand).
  let pendingKit: PendingKit | null = null;
  if (card.keywords.includes('Kit-Master')) {
    const chars = (Object.values(g[lp].board) as (BoardEntity | undefined)[])
      .filter((e): e is BoardEntity => !!e && isCharacter(e));
    // A source is eligible only if it holds an item that some OTHER character
    // has slot capacity to receive (otherwise highlighting it would dead-end).
    const sources = chars.filter(e =>
      allItemsOf(e).some(it => kitDests(g, lp, e.id, it.isWeapon, !!it.item.heavy).length > 0)
    ).map(e => e.id);
    if (sources.length > 0) {
      pendingKit = { sourceName: card.name, step: 'source', eligibleIds: sources };
      enterMsg = `${card.name}: Kit-Master — choose a character to take an item from.`;
    } else {
      enterMsg = `${card.name} enters — no item to move (Kit-Master).`;
    }
  }

  // Scavenger (on-enter, optional): return an Item card from your Dead Zone and
  // attach it to this companion. Rides the existing Dead-Zone prompt with an attach
  // destination (resolveDeadPick equips instead of returning to hand; a wearer that
  // died to a trap while entering is skipped by its stale-guard). No items in the
  // Dead Zone → fizzles with a note rather than blocking.
  let scavengerPick: PendingDeadPick | null = null;
  if (isCompanion && card.keywords.includes('Scavenger')) {
    const options = g[lp].dead
      .map((c, idx) => ({ card: c, idx }))
      .filter(o => o.card.type === 'Item');
    if (options.length > 0) {
      scavengerPick = { source: card.name, lp, options, postEffects: [], optional: true,
        attachTo: { id: entId, name: card.name } };
      enterMsg = `${card.name}: Scavenger — you may return an item from your Dead Zone.`;
    } else {
      enterMsg = `${card.name} enters — no item in the Dead Zone (Scavenger).`;
    }
  }

  // Entomb N (Requiem Arc A, 2026-08-25) — on-enter, MANDATORY, promptless: put the
  // top N cards of your own deck into your Dead Zone. A short/empty deck mills what
  // it can (R4: mandatory triggers fire and no-op); milling never loses the game —
  // only DRAWS do (the drawCards chokepoint). A card mixing Entomb with another
  // enter unit (Palegrove Gravekeeper: + Scavenger) never reaches this inline path:
  // enterUnitsOf splits it into owner-ordered 'enterUnit' entries (Arc G).
  const entombN = parseEntomb(card.keywords);
  if (isCompanion && entombN != null) {
    const m = millCards(g, lp, entombN);
    g = m.game;
    enterMsg = m.milled.length
      ? `${card.name}: Entomb ${entombN} — ${m.milled.map(c => c.name).join(', ')} into the Dead Zone.`
      : `${card.name}: Entomb ${entombN} — the deck is empty, nothing to entomb.`;
  }

  // Animate Magic X (on-enter): choose a Magical (Incantation) Construct you
  // control — it becomes an X/X Manifest companion via the interpreter's existing
  // 'animate' op. No Magical Construct → fizzles with a note.
  let animatePick: PendingActionTarget | null = null;
  const animateX = parseAnimateMagic(card.keywords);
  if (animateX != null) {
    const eligibleIds = (Object.values(g[lp].board) as (BoardEntity | undefined)[])
      .filter((e): e is BoardEntity => !!e && e.kind === 'construct' && e.subtype === 'Incantation')
      .map(e => e.id);
    if (eligibleIds.length > 0) {
      animatePick = { source: 'enter', sourceName: card.name, lp,
        effects: [{ op: 'animate', atk: animateX, hp: animateX, target: 'magicalConstruct' }],
        eligibleIds, sourceId: entId };
      enterMsg = `${card.name}: Animate Magic — choose a Magical Construct to animate (${animateX}/${animateX}).`;
    } else {
      enterMsg = `${card.name} enters — no Magical Construct to animate.`;
    }
  }

  // Coercion (on-enter, companions): the OPPONENT must discard a card or sacrifice
  // a permanent — their choice, routed to their client (the acting player is held
  // via reactiveHold). Their PC never qualifies as the sacrifice; with an empty
  // hand and no other permanents the trigger fizzles.
  let pendingCoercion: PendingCoercion | null = null;
  if (isCompanion && card.keywords.includes('Coercion')) {
    const canDiscard = g[opp].hand.length > 0;
    const canSacrifice = Object.values(g[opp].board).some(e => e && canBeSacrificed(e)); // the 2026-07-24 chokepoint (behavior-identical)
    if (canDiscard || canSacrifice) {
      pendingCoercion = { source: card.name, victim: opp };
      enterMsg = `${card.name}: Coercion — opponent must discard a card or sacrifice a permanent.`;
    } else {
      enterMsg = `${card.name} enters — the opponent has nothing to coerce.`;
    }
  }

  // Structured on-enter effects (the non-keyword "When this enters, …" text).
  // Only when no keyword trigger already claimed the enter (avoids double pending).
  // Arc C (2026-08-23): clause-level `if` is evaluated HERE and only here -- the entry
  // snapshot. A refused clause fizzles loudly below rather than vanishing.
  const { effects: onEnter, gatedOut: enterGatedOut } = onEnterEffects(card, g, lp);
  if (enterGatedOut && onEnter.length === 0) enterMsg = `${card.name} enters -- its condition is not met.`;
  if (!pendingTrigger && !pendingKit && !scavengerPick && !animatePick && !pendingCoercion && onEnter.length > 0) {
    // Equip-from-hand (Veteran of the Ashgrove): pick an item from hand for this character.
    if (onEnter.some(e => e.op === 'equipFromHand')) {
      const items = g[lp].hand.filter(c => c.type === 'Item');
      if (items.length > 0) {
        return {
          game: g,
          local: { ...local, pendingTrigger: null, pendingKit: null,
            pendingEquipPick: { source: card.name, lp, targetId: entId, items } },
          msg: `${card.name} enters — equip an item from your hand?`,
        };
      }
      // no items in hand — fall through (nothing to equip)
    }

    // Two-step on-enter: Field Engineer moves an anchor between two Physical Constructs.
    if (twoStepKind(onEnter) === 'moveAnchor') {
      const mv = onEnter.find(e => e.op === 'moveAnchor');
      const count = mv && mv.op === 'moveAnchor' ? mv.count : 1;
      const physical = ownPhysicalConstructIds(g, lp);
      const sources = physical.filter(pid => (findEntityAnywhere(g, pid)?.ent.anchors ?? 0) >= count);
      if (sources.length >= 1 && physical.length >= 2) {
        return {
          game: g,
          local: { ...local, pendingTrigger: null, pendingKit: null,
            pendingActionTarget: { source: 'enter', sourceName: card.name, lp, effects: onEnter, eligibleIds: sources, sourceId: entId, twoStep: 'moveAnchor' } },
          msg: `${card.name} enters — move an anchor: choose a source Physical Construct.`,
        };
      }
      // not enough Physical Constructs — fall through (fizzle, it's optional)
    }

    const enterPeek = onEnter.find(e => e.op === 'deckPeek');
    if (enterPeek && enterPeek.op === 'deckPeek') {
      const cards = g[lp].deck.slice(0, enterPeek.look);
      if (cards.length > 0) {
        return {
          game: { ...g, pendingPeek: { source: card.name, lp, deckSide: lp, cards, dests: enterPeek.dests, maxHand: enterPeek.maxHand,
            ...(enterPeek.reorder ? { reorder: true as const } : {}) } }, // Arc A: Herald of Despair's look-and-reorder
          local: { ...local, pendingTrigger: null, pendingKit: null },
          msg: `${card.name} enters — look at your deck.`,
        };
      }
    }
    const spec = actionTargetSpec(onEnter);
    if (spec) {
      // Arc H: op-level narrowing (bounce hpAtMost) — identity for shipped cards.
      const eligibleIds = filterEligibleByEffects(g, eligibleTargets(g, lp, spec).filter(eid => eid !== entId), onEnter);
      if (eligibleIds.length > 0) {
        return {
          game: g,
          local: { ...local, pendingTrigger: null, pendingKit: null,
            pendingActionTarget: { source: 'enter', sourceName: card.name, lp, effects: onEnter, eligibleIds, sourceId: entId } },
          msg: `${card.name} enters — choose a target.`,
        };
      }
      // No legal target — fizzle (enter without the targeted effect).
    } else {
      const r = resolveActionEffects(g, lp, card.name, onEnter, undefined, entId, undefined, deadSink, armorSink);
      return {
        game: r.game,
        local: { ...local, pendingTrigger, pendingKit },
        msg: r.msgs.length ? `${card.name} enters! ${r.msgs.join(' | ')}` : enterMsg,
      };
    }
  }

  // Scavenger's prompt joins the game-level Dead-Zone queue (behind any active pick).
  if (scavengerPick) {
    g = g.pendingDeadPick
      ? { ...g, pendingDeadPickQueue: [...g.pendingDeadPickQueue, scavengerPick] }
      : { ...g, pendingDeadPick: scavengerPick };
  }
  if (pendingCoercion) g = { ...g, pendingCoercion };

  return {
    game: g,
    local: {
      ...local,
      pendingTrigger,
      pendingKit,
      // Only claim the pendingActionTarget slot when Animate Magic armed one — a null
      // here must not clobber an unrelated pending target.
      ...(animatePick ? { pendingActionTarget: animatePick } : {}),
    },
    msg: enterMsg,
  };
}

/**
 * Arm a segmented simultaneous window (Arc G 2026-08-04, the 2026-07-22 structural
 * queue implemented): segments arrive in PUSH order (segmentBatch — the active
 * player's first, the non-active player's second/above). A ≤1 segment pushes
 * directly (no arbitrary orderings exist); a >1 segment pauses for its OWNER's
 * ordering pick, chaining any later segment via PendingTriggerOrder.next —
 * serialized per-owner prompts, never dual-hold. `paused` = a prompt now gates the
 * window; the caller returns without running the stack (resolveTriggerOrder
 * resumes). Single-owner windows produce exactly today's arming shape.
 */
function armSegmentedWindow(
  g: GameState, segments: { controller: 'p1' | 'p2'; items: ReactiveStackEntry[] }[],
): { game: GameState; paused: boolean } {
  let out = g;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.items.length <= 1) { out = pushStack(out, seg.items); continue; }
    const rest = segments[i + 1]; // at most one later segment (two owners)
    out = { ...out, pendingTriggerOrder: { lp: seg.controller, items: seg.items, picked: [],
      ...(rest ? { next: { lp: rest.controller, items: rest.items } } : {}) } };
    return { game: out, paused: true };
  }
  return { game: out, paused: false };
}

/**
 * A card's onEnter effects with clause-level `if` HONOURED (Arc C, 2026-08-23 --
 * Elder Shellback's entry-snapshot intervening-if). Before this arc the three onEnter
 * sites flattened clauses straight to effects and silently dropped `if`; no card
 * carried one, so nothing changed behaviorally, but the contract advertised a gate the
 * engine ignored.
 *
 * THE SNAPSHOT IS THIS CALL. The condition is read once, here, at the moment the enter
 * trigger resolves -- and nothing re-reads it afterwards. That is the whole of the
 * "entry snapshot, never re-evaluated" ruling: an Untamed check that fails because Gear
 * was on the board places nothing, and an encounter that clears three turns later
 * places nothing retroactively, because there is no live reader left to fire.
 *
 * `gatedOut` reports that a clause was present and refused, so the caller can fizzle
 * LOUDLY (R4: mandatory triggers fire even when their effects no-op; no silent
 * outcomes, 2026-07-12) instead of looking like a card with no enter text at all.
 */
function onEnterEffects(card: Card, game: GameState, lp: 'p1' | 'p2'):
  { effects: Effect[]; gatedOut: boolean } {
  const clauses = (card.effects ?? []).filter(c => c.trigger === 'onEnter');
  const live = clauses.filter(c => !c.if || conditionMet(game, lp, c.if));
  return { effects: live.flatMap(c => c.effects), gatedOut: live.length < clauses.length };
}

/** Perform one HAUNT return (Requiem Arc C, 2026-08-25) — shared by armHaunt's
 *  singleton auto-place and resolveHauntSlot. Removes the card from the owner's Dead
 *  Zone, rebuilds the entity the way placeCard does (fresh acts, `fresh: true` so the
 *  willpower gate applies, armor counters re-placed — an enter is an enter) PLUS
 *  `exhausted` (the ratified wording) and ONE Memory counter, then pushes the 'enter'
 *  stack entry so the FULL entry machinery fires and runs the stack. */
function performHauntReturn(game: GameState, head: PendingHauntReturn, slot: SlotId, s: StackRunCtx):
  { game: GameState; local: Partial<GameStoreState>; msgs: string[] } {
  const card = game[head.lp].dead.find(c => c.id === head.cardId);
  if (!card) return { game, local: {}, msgs: [] };
  const ent: BoardEntity = {
    id: uid(`haunt-${card.id}`),
    kind: 'companion',
    name: card.name, cls: card.class1, level: card.level,
    atk: card.attack ?? undefined,
    hp: card.hp ?? 0, maxHp: card.hp ?? 0,
    armorCounters: parseArmorKeyword(card.keywords) ?? undefined,
    armorStart: parseArmorKeyword(card.keywords) ?? undefined,
    keywords: card.keywords, statuses: [],
    subtype: card.subtype, text: card.text,
    tapped: 'major', exhausted: true,   // "return it ... exhausted"
    fresh: true,                        // an enter — the willpower gate applies
    memoryCounters: 1,                  // the per-stint tracker, placed BY the return
    acts: freshActs(),
  };
  let g: GameState = { ...game, [head.lp]: { ...game[head.lp], dead: game[head.lp].dead.filter(c => c.id !== card.id) } };
  g = pushStack(g, [{ kind: 'enter', ent, card, slot, controller: head.lp }]);
  const r = runStack(g, s);
  return { game: r.game, local: r.local,
    msgs: [`${card.name} haunts — it returns to the encounter with a Memory counter.`, ...r.toastMsgs] };
}

/** The onPlay twin (Requiem Arc B, 2026-08-25 — Encore of the Dawn's additive
 *  crescendo draw): clause-level `if` evaluated at CAST time, so the armed/resolved
 *  effect list is the gated one. Identity for every card without a conditional
 *  clause — the raw flatten this replaced dropped `if` silently (the trap family). */
function onPlayEffects(card: Card, game: GameState, lp: 'p1' | 'p2'): Effect[] {
  return (card.effects ?? [])
    .filter(c => c.trigger === 'onPlay')
    .filter(c => !c.if || conditionMet(game, lp, c.if))
    .flatMap(c => c.effects);
}

/**
 * The GAME-LEVEL enter triggers a card statically carries (Arc G 2026-08-04, the
 * multi-pending enter window). A card with >1 splits into owner-ordered 'enterUnit'
 * stack entries instead of letting the first claimant drop the rest (the Phase-1
 * Gutter Fence finding). Kinds whose prompts are STORE-local (Reinforce/Dismantle,
 * Kit-Master, Animate Magic, equip-from-hand, two-step / targeted onEnter) are not
 * queueable — a card mixing one of those with another enter trigger fails loudly
 * (detection over enumeration; extend armEnterUnit when a card needs it). No
 * shipped card carries more than one unit (Scavenger and Coercion have zero shipped
 * carriers), so every shipped enter runs the pre-Arc-G path byte-identically.
 */
function enterUnitsOf(card: Card): ('scavenger' | 'coercion' | 'structured' | 'entomb')[] {
  const isCompanion = card.type === 'Companion';
  const units: ('scavenger' | 'coercion' | 'structured' | 'entomb')[] = [];
  if (isCompanion && card.keywords.includes('Scavenger')) units.push('scavenger');
  if (isCompanion && card.keywords.includes('Coercion')) units.push('coercion');
  // Entomb (Requiem Arc A, 2026-08-25): promptless and game-level-safe, so QUEUEABLE.
  // Palegrove Gravekeeper (Scavenger + Entomb 2) is the live multi-pending probe —
  // the owner orders the two, and Entomb-first can mill an item Scavenger's fresh
  // evaluation then offers (per-event state, 2026-07-21).
  if (isCompanion && parseEntomb(card.keywords) != null) units.push('entomb');
  // DELIBERATELY UNGATED (Arc C, 2026-08-23): this is a static SHAPE query with no
  // GameState to read, and the enter trigger exists whether or not its condition will
  // hold -- a mandatory trigger fires and no-ops (R4). The `if` is evaluated when the
  // unit RESOLVES, in armEnterUnit below.
  const onEnter = (card.effects ?? []).filter(c => c.trigger === 'onEnter').flatMap(c => c.effects);
  if (onEnter.length > 0) units.push('structured');
  if (units.length > 1) {
    const unsupported = [
      parseEnterTrigger(card.keywords) ? 'Reinforce/Dismantle' : null,
      card.keywords.includes('Kit-Master') ? 'Kit-Master' : null,
      parseAnimateMagic(card.keywords) != null ? 'Animate Magic' : null,
      card.keywords.includes('Oathsworn') ? 'Oathsworn' : null,
      onEnter.some(e => e.op === 'equipFromHand') ? 'equipFromHand' : null,
      twoStepKind(onEnter) ? 'two-step targeting' : null,
      actionTargetSpec(onEnter) ? 'targeted onEnter' : null,
    ].filter(Boolean);
    if (unsupported.length) {
      throw new Error(
        `multi-pending enter window: ${card.name} mixes ${unsupported.join(', ')} with other ` +
        `enter triggers — only game-level prompt kinds (Scavenger / Coercion / no-target ` +
        `structured) are queueable (Arc G 2026-08-04). Extend armEnterUnit before shipping this card.`);
    }
  }
  return units;
}

/**
 * Resolve ONE queued enter trigger (Arc G 'enterUnit') — evaluated FRESH as of now
 * (per-event state, 2026-07-21): an earlier unit's outcome (an item attached, a card
 * discarded) is visible to later ones. Each block mirrors its runOnEnter twin; a
 * unit with nothing to do fizzles loudly and the stack continues (mandatory triggers
 * fire even when their effects no-op — R4). Declining an OPTIONAL unit's prompt
 * never eats the units beneath it (they are separate stack entries).
 */
function armEnterUnit(
  game: GameState, entry: Extract<ReactiveStackEntry, { kind: 'enterUnit' }>,
  deadSink: PendingDeadPick[], armorSink: ArmorChoiceData[],
): { game: GameState; msg: string } {
  let g = game;
  const lp = entry.controller;
  const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
  const name = entry.sourceName;
  if (entry.unit === 'scavenger') {
    const options = g[lp].dead.map((c, idx) => ({ card: c, idx })).filter(o => o.card.type === 'Item');
    if (!options.length) return { game: g, msg: `${name} — no item in the Dead Zone (Scavenger).` };
    const pick: PendingDeadPick = { source: name, lp, options, postEffects: [], optional: true,
      attachTo: { id: entry.entId, name } };
    g = g.pendingDeadPick
      ? { ...g, pendingDeadPickQueue: [...g.pendingDeadPickQueue, pick] }
      : { ...g, pendingDeadPick: pick };
    return { game: g, msg: `${name}: Scavenger — you may return an item from your Dead Zone.` };
  }
  if (entry.unit === 'coercion') {
    const canDiscard = g[opp].hand.length > 0;
    const canSacrifice = Object.values(g[opp].board).some(e => e && canBeSacrificed(e)); // the 2026-07-24 chokepoint
    if (!canDiscard && !canSacrifice) return { game: g, msg: `${name} — the opponent has nothing to coerce.` };
    return { game: { ...g, pendingCoercion: { source: name, victim: opp } },
      msg: `${name}: Coercion — opponent must discard a card or sacrifice a permanent.` };
  }
  if (entry.unit === 'entomb') {
    // Mandatory + promptless — mirrors the runOnEnter inline twin exactly; evaluated
    // fresh, so a unit resolved before this one (e.g. Scavenger reclaiming an item)
    // has already changed the deck/Dead Zone this mill reads.
    const n = parseEntomb(entry.card.keywords) ?? 0;
    const m = millCards(g, lp, n);
    return { game: m.game, msg: m.milled.length
      ? `${name}: Entomb ${n} — ${m.milled.map(c => c.name).join(', ')} into the Dead Zone.`
      : `${name}: Entomb ${n} — the deck is empty, nothing to entomb.` };
  }
  // 'structured': the card's authored onEnter clauses — no-target ops only
  // (enterUnitsOf refuses the rest), resolved through the interpreter. The dead
  // sink defers returnFromDead to the player-facing picker; revealHand/deckPeek
  // arm their game-level prompts directly.
  // Arc C (2026-08-23): the entry snapshot on the queued path. Evaluated FRESH as of
  // now, matching this function's per-event contract -- an earlier unit that destroyed
  // the last Gear is visible to this one.
  const { effects: onEnter, gatedOut } = onEnterEffects(entry.card, g, lp);
  if (gatedOut && onEnter.length === 0) return { game: g, msg: `${name} -- its condition is not met.` };
  const r = resolveActionEffects(g, lp, name, onEnter, undefined, entry.entId, undefined, deadSink, armorSink);
  return { game: r.game, msg: r.msgs.length ? `${name}: ${r.msgs.join(' | ')}` : '' };
}

/**
 * Drive the trigger stack (GameState.triggerStack, top = last) until it drains or
 * PAUSES: on a Paranoia peek (the controller decides), on a simultaneous-trigger
 * ordering pick (the triggers' owner decides — 2026-07-22), on a mid-combat Armor choice, or on an
 * 'ownEnter' hand-off owned by the other client. Every pause resumes through the
 * corresponding resolver, which re-enters this driver. Collected trap toasts are
 * returned for the calling reducer to surface — no silent outcomes (2026-07-12).
 */
function runStack(game: GameState, s: StackRunCtx):
  { game: GameState; toastMsgs: string[]; local: Partial<GameStoreState> } {
  let g = game;
  const toastMsgs: string[] = [];
  let local: Partial<GameStoreState> = {};
  let sCtx: StackRunCtx = s;
  const deadSink: PendingDeadPick[] = [];
  const armorSink: ArmorChoiceData[] = [];

  while (g.triggerStack?.length) {
    if (g.pendingTriggerOrder) break; // an ordering pick is pending — resolveTriggerOrder resumes
    const stack = g.triggerStack;
    const top = stack[stack.length - 1];

    if (top.kind === 'paranoia') {
      if (g.pendingPeek) break; // an earlier peek is still up — its resolver re-enters
      g = setStack(g, stack.slice(0, -1));
      const cards = g[top.deckSide].deck.slice(0, 1);
      if (!cards.length) { toastMsgs.push(`${top.sourceName} (Paranoia): the deck is empty.`); continue; }
      // Canon dests: "You may put that card on the top or bottom of their deck."
      g = { ...g, pendingPeek: { source: top.sourceName, lp: top.controller, deckSide: top.deckSide, cards, dests: ['top', 'bottom'] } };
      break; // PAUSE — resolvePeek/cancelPeek re-enter the stack
    }

    if (top.kind === 'reactive') {
      g = setStack(g, stack.slice(0, -1));
      const peekBefore = g.pendingPeek;
      const r = resolveReactiveEntry(g, top, deadSink, armorSink);
      g = r.game;
      toastMsgs.push(r.toast);
      // Arc A (2026-07-22): a reactive clause that forces a discard (Tripline of
      // Bells) PAUSES the stack — the trap's chosen discard is part of its
      // resolution and completes before anything beneath it (LIFO), in particular
      // before the entering companion's own ownEnter. resolveDiscard re-enters.
      if (g.pendingDiscard) break;
      // Arc G (2026-08-04): a reactive clause that ARMS a deck peek (Echo-Keeper's
      // own-play listener → the interpreter's deckPeek) pauses like the Paranoia
      // branch — the owner's decision completes before anything beneath (LIFO).
      // Transition check, not presence check: no shipped reactive arms a peek, so
      // every shipped path is byte-identical. resolvePeek/cancelPeek re-enter.
      if (g.pendingPeek && g.pendingPeek !== peekBefore) break;
      // The Final Word (owner rewording 2026-08-11): a reactive clause that demands
      // a FORCED SACRIFICE pauses the stack — the payment (a real sacrifice event,
      // listeners included) completes before anything beneath, in particular before
      // the queued attack's damage step. resolveForcedSacrifice re-enters. New
      // field — no shipped path can see it.
      if (g.pendingForcedSacrifice) break;
      continue;
    }

    if (top.kind === 'enterUnit') {
      // Multi-pending enter window (Arc G 2026-08-04): one of an entered card's
      // OWN simultaneous enter triggers, in the owner's chosen order. Evaluated
      // FRESH here (per-event state, 2026-07-21). A unit that armed a prompt (or
      // deferred a dead pick into the sink) pauses the stack — its resolution
      // completes before the next unit is evaluated; the prompt's own resolver
      // re-enters (resolveDeadPick / resolveCoercion* / resolveHandReveal /
      // resolvePeek, narrow: only when the stack rests on an enterUnit). A
      // fizzled unit falls through to the next.
      g = setStack(g, stack.slice(0, -1));
      const sinkBefore = deadSink.length;
      const before = { dp: g.pendingDeadPick, co: g.pendingCoercion, hr: g.pendingHandReveal, pk: g.pendingPeek };
      const r = armEnterUnit(g, top, deadSink, armorSink);
      g = r.game;
      if (r.msg) toastMsgs.push(r.msg);
      if (deadSink.length > sinkBefore || g.pendingDeadPick !== before.dp
        || g.pendingCoercion !== before.co || g.pendingHandReveal !== before.hr
        || g.pendingPeek !== before.pk) break;
      continue;
    }

    if (top.kind === 'enter') {
      g = setStack(g, stack.slice(0, -1));
      // The stack emptied down to the played card — it ENTERS the encounter now (R1).
      // Defensive: if its slot was somehow occupied while the play sat on the stack
      // (sandbox side-flip during a Paranoia peek), take the first empty slot instead.
      const board = g[top.controller].board;
      const slot = !board[top.slot] ? top.slot
        : ([...BACK_SLOTS, ...FRONT_SLOTS] as SlotId[]).find(sl => !board[sl]);
      if (!slot) {
        const cardObj = CATALOG.find(c => c.name === top.ent.name);
        g = { ...g, [top.controller]: { ...g[top.controller], dead: cardObj ? [...g[top.controller].dead, cardObj] : g[top.controller].dead } };
        toastMsgs.push(`${top.ent.name} has nowhere to enter — it is put into the Dead Zone.`);
        continue;
      }
      g = recomputeStatics({ ...g, [top.controller]: { ...g[top.controller], board: { ...board, [slot]: top.ent } } });
      // Enter-event triggers queue in the RULED order (verbatim sequence, owner
      // 2026-07-12): the enterer's own on-enter queues FIRST, reactive triggers
      // (Tripwire Snare) above it — so the traps resolve first, the enter ability after.
      const batch: StackEntry[] = [{ kind: 'ownEnter', entId: top.ent.id, card: top.card, slot, controller: top.controller }];
      // THIS IS THE ENTRY SITE — the one moment a permanent actually arrives in the
      // encounter. Both entry windows hang here, never at the play site (Arc D,
      // 2026-08-23): playing from hand is today's main producer of entries, but it is
      // not the only shape, and the two are canonically distinct events. Control-theft
      // RELOCATION deliberately never reaches this branch (Arc I ruling 3: board-to-board,
      // no enter), and a countered play never becomes an entry at all. A future
      // effect-placement that enters without being played will pick these windows up for
      // free precisely because they are gathered HERE.
      const subject = { id: top.ent.id, name: top.ent.name, controller: top.controller };
      const reactive = top.ent.kind === 'companion'
        ? [
            ...gatherReactive(g, 'oppCompanionEnters', subject),   // opposing traps
            // Own-side entry listeners (Chorus of the Understory). The enterer is
            // ALREADY on the board at this point, so a permanent whose own card carried
            // this trigger would hear its own entry — which is the literal reading of
            // "whenever a companion enters under your control" and is deliberately NOT
            // suppressed. No shipped card exercises it (Chorus is a Construct, so it can
            // never be the entering companion); recorded rather than built for.
            ...gatherOwnSide(g, 'ownCompanionEnters', subject),
          ]
        : [];
      g = pushStack(g, batch);
      // MIXED-OWNER WINDOW (new this arc): opposing traps and own-side listeners can now
      // fire on the same entry, so this site takes the Arc G structural queue exactly as
      // the play window does — batchOrderer THROWS on a mixed batch by design, and
      // segmentBatch/armSegmentedWindow is the sanctioned handling. Segmented by the
      // ACTIVE player (the 2026-07-22 rule is about turn order, not about who placed):
      // the active player's segment queues first, the opponent's above it, so theirs
      // resolves first. A single-owner window arms byte-identically to the pre-Arc-D path.
      const armedEnter = armSegmentedWindow(g, segmentBatch(reactive, g.activePlayer));
      g = armedEnter.game;
      if (armedEnter.paused) break; // PAUSE — resolveTriggerOrder resumes
      continue;
    }

    if (top.kind === 'ownAttack') {
      g = setStack(g, stack.slice(0, -1));
      // Declaration-window clauses resolve from the queued SNAPSHOT — they fire even
      // if the attacker died to a trap that resolved above them (R1).
      // Requiem Arc B (owner-ruled 2026-08-25): an interactive-spec clause DEFERS to
      // the attacker's controller via the pickSink — the attack stays paused on the
      // stack beneath the pick (the pendingForcedSacrifice discipline) and
      // resolveCombatPick resumes it.
      const pickSink: CombatPickRequest[] = [];
      const ct = resolveCombatTriggers(g, top.attacker, top.side, [], armorSink, ['onAttack'], pickSink);
      g = ct.game;
      if (ct.msgs.length) toastMsgs.push(ct.msgs.join(' | '));
      if (pickSink.length > 0) {
        // One slot, detection over enumeration: no card carries two targeted onAttack
        // clauses — the first that does must extend this to a queue, loudly.
        if (pickSink.length > 1) throw new Error(
          `combat pick collision: ${pickSink.map(p => p.source).join(' + ')} both demand a target in one declaration window — extend pendingCombatPick to a queue before shipping this card.`);
        g = { ...g, pendingCombatPick: pickSink[0] };
        toastMsgs.push(`${pickSink[0].source}: choose a target.`);
        break; // PAUSE — the attackDamage entry waits beneath; resolveCombatPick resumes
      }
      continue;
    }

    if (top.kind === 'attackDamage') {
      g = setStack(g, stack.slice(0, -1));
      // Clone the ctx (the stored one is synced state) and fold in anything the
      // declaration triggers deferred, so finalizeAttack arms everything at once.
      const ctx: AttackCtx = { ...top.ctx,
        hitQueue: [...top.ctx.hitQueue], msgs: [...top.ctx.msgs], events: [...top.ctx.events],
        deadSink: [...top.ctx.deadSink, ...deadSink.splice(0)],
        armorSink: [...top.ctx.armorSink, ...armorSink.splice(0)],
      };
      // R2 (owner 2026-07-12): if the attacker is dead when the attack step would
      // proceed to damage, damage is never queued — the attack fizzles.
      if (!findEntityAnywhere(g, ctx.charId)) {
        toastMsgs.push(`${ctx.attackerName}'s attack fizzles — it left the encounter before dealing damage.`);
        g = finalizeAttack(g, ctx); // seals activation + arms whatever the triggers deferred
        continue;
      }
      const res = driveAttack(g, ctx);
      if (!res.done) { g = { ...res.game, pendingArmor: res.pendingArmor ?? null, pendingPreventOrder: res.pendingPreventOrder }; break; } // PAUSE — resolveArmor/resolvePreventOrder resumes + finalizes
      g = finalizeAttack(res.game, res.ctx);
      if (res.ctx.msgs.length) toastMsgs.push(res.ctx.msgs.join(' | '));
      continue;
    }

    if (top.kind === 'forcedAttack') {
      g = setStack(g, stack.slice(0, -1));
      // FORCED ATTACKS ARE ATTACKS (owner ruling 2026-08-21). Expanded HERE, through
      // the same assembly a chosen attack uses (declareAttack), so the whole
      // declaration-window family fires: Iron Spikes, The Final Word, Caltrop Pouch,
      // Quillspine. No listener knows or cares that this attack was compelled.
      //
      // The declaration snapshot is taken NOW, not when Press the Line was played —
      // which is the point of queueing rather than looping: an earlier forced attacker
      // that killed a buff source correctly lowers this one's damage (R2).
      //
      // A vanished attacker or target is a silent skip, not an error: the whole
      // resolution may have been invalidated by an earlier attack in the same volley
      // (its own trap killed the target), and R1 already says queued entries survive
      // and no-op rather than throwing.
      const fa = declareAttack(g, top.attackerId, top.targetId, 0);
      if (!fa) { toastMsgs.push(`${top.sourceName}: an attacker or its target is gone — that attack does not happen.`); continue; }
      g = fa.game;
      if (fa.declReactive.length || fa.hasOwnAttack) {
        g = pushStack(g, [
          { kind: 'attackDamage', ctx: fa.ctx },
          ...(fa.hasOwnAttack ? [{ kind: 'ownAttack', attacker: fa.attacker, side: fa.side } satisfies StackEntry] : []),
        ]);
        const armedFa = armSegmentedWindow(g, segmentBatch(fa.declReactive, g.activePlayer));
        g = armedFa.game;
        if (armedFa.paused) break; // PAUSE — resolveTriggerOrder resumes
        continue;
      }
      // No declaration-window triggers: the damage step alone, still ON the stack so a
      // pause inside it (armor choice) resumes the rest of the volley beneath.
      g = pushStack(g, [{ kind: 'attackDamage', ctx: fa.ctx }]);
      continue;
    }

    // top.kind === 'ownEnter': arms store-LOCAL prompts, so in multiplayer only the
    // controller's client may resolve it — everyone else leaves it on the stack
    // (reactiveHold covers them; the controller's client resumes via resumeStack).
    if (sCtx.conn.mode !== 'solo' && top.controller !== sCtx.localPlayer) break;
    // Multi-pending enter window (Arc G 2026-08-04): a card with MORE THAN ONE
    // game-level enter trigger no longer lets the first claimant drop the rest
    // (the Phase-1 Gutter Fence finding — the single-pending guard). Its enter
    // splits into per-trigger 'enterUnit' entries, ordered by their OWNER (Rules
    // Note 2026-07-22: each player orders their own simultaneous triggers — the
    // information-relevant case Arc A refused to auto-order) via the standing
    // ordering prompt, then resolved LIFO with fresh per-unit evaluation. ≤1 unit
    // → the pre-Arc-G runOnEnter path, byte-identical (no shipped card carries two).
    const units = enterUnitsOf(top.card);
    if (units.length > 1) {
      g = setStack(g, stack.slice(0, -1));
      toastMsgs.push(`${top.card.name} enters the field!`);
      const items: ReactiveStackEntry[] = units.map(u => ({ kind: 'enterUnit', unit: u,
        entId: top.entId, sourceName: top.card.name, card: top.card, controller: top.controller }));
      g = { ...g, pendingTriggerOrder: { lp: top.controller, items, picked: [] } };
      break; // PAUSE — resolveTriggerOrder pushes them in the chosen order and resumes
    }
    g = setStack(g, stack.slice(0, -1));
    const r = runOnEnter(g, top.card, top.entId, top.controller, sCtx, deadSink, armorSink);
    g = r.game;
    local = { ...local, ...r.local };
    // Later oath pushes in the same run must see the queue the previous one built.
    sCtx = { ...sCtx,
      modalQueue: r.local.modalQueue ?? sCtx.modalQueue,
      oathContext: r.local.oathContext !== undefined ? r.local.oathContext : sCtx.oathContext };
    if (r.msg) toastMsgs.push(r.msg);
  }

  // Arm whatever the resolved triggers deferred (dead picks / armor choices / item
  // transfers). Empty sinks make this a no-op, so an attack that already finalized
  // (arming its own ctx sinks) is never clobbered.
  g = armPrompts(g, deadSink, armorSink);
  return { game: g, toastMsgs, local };
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
  pendingTribute: PendingTribute | null;
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
  /** HOST-only: rebuild the authoritative game once the guest's real deck is known (from the
   *  READY handshake). Runs pre-setup while the host is still on the Matching screen, so
   *  re-dealing both hands is invisible; conn/localPlayer are left intact. */
  assembleMpGame: (p1Cards: Card[], p2Cards: Card[]) => void;
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
  /** The affected character's controller's prevention-ordering pick (R3, 2026-07-14):
   *  one blind pick per call (the PendingTriggerOrder pattern) — when one unpicked
   *  item remains the order is complete and the damage instance resolves. */
  resolvePreventOrder: (idx: number) => void;
  /** Resolve Mara's pre-attack optional ability — pay HP for +damage, or decline; commits the attack. */
  resolveAttackChoice: (accept: boolean) => void;
  /** Forced sacrifice (The Final Word, owner rewording 2026-08-11): sacrifice the
   *  chosen own permanent (never the PC) — MANDATORY, no decline; the paused
   *  declaration window resumes after. */
  resolveForcedSacrifice: (entityId: string) => void;
  /** A combat-trigger target choice (Requiem Arc B, 2026-08-25 — Satyr of the Reel):
   *  the attacker's controller picks the clause's own-side target; the paused
   *  declaration window (and the attack beneath it) resumes on pick. MANDATORY —
   *  no decline; the only escape was not attacking. */
  resolveCombatPick: (targetId: string) => void;
  /** HAUNT arming driver (Requiem Arc C, 2026-08-25): advances the owed-return queue
   *  once every prompt from the death has drained ("the death fully happens FIRST").
   *  Safe to call speculatively (the resumeStack discipline — a Play.tsx effect
   *  drives it); no-ops unless a return is actually ready. Owner's client only. */
  armHaunt: () => void;
  /** The OWNER places their haunting companion in the clicked open slot (any line —
   *  the ratified wording carries no line restriction); the return is an ENTER. */
  resolveHauntSlot: (slot: SlotId) => void;
  /** Control-theft reversion (Arc I): the OWNER places their returning companion in
   *  the clicked open slot — any line (ruling 6) — and the paused endTurn resumes. */
  resolveReversionSlot: (slot: SlotId) => void;

  // Cancel any pending action
  cancelPending: () => void;

  // Play card from hand
  beginPlay: (cardId: string) => void;
  cancelPlay: () => void;
  placeCard: (slot: SlotId) => void;
  /** Pay a Tribute cost with the chosen permanent; the suspended play then completes. */
  resolveTribute: (entityId: string) => void;
  /** Decline the cost. The play is abandoned: card stays in hand, NOTHING is paid. */
  cancelTribute: () => void;

  // On-enter trigger targeting (Reinforce/Dismantle)
  resolveTrigger: (targetId: string) => void;
  cancelTrigger: () => void;

  // Kit-Master two-step item move targeting
  resolveKit: (targetId: string) => void;
  pickKitItem: (itemId: string) => void;
  cancelKit: () => void;

  /** Simultaneous-trigger ordering (trigger stack, 2026-07-12): the ACTIVE player
   *  picks which of the queued reactive triggers resolves next. Picks are BLIND —
   *  nothing resolves between picks; once one unpicked item remains the order is
   *  complete, the triggers go on the stack and it runs. */
  resolveTriggerOrder: (idx: number) => void;
  /** Multiplayer hand-off driver: continue a trigger stack whose head is an
   *  'ownEnter' owned by this client (its resolution arms store-local prompts, so
   *  only the controller's client may run it). No-op when there is nothing to run
   *  or the stack is paused on a prompt — safe to call speculatively. */
  resumeStack: () => void;

  // Action-card target selection
  resolveActionTarget: (targetId: string) => void;
  /** Step 2 of a two-step action when it's a slot pick (Tactical Reposition). */
  resolveActionSlot: (slot: SlotId) => void;
  cancelActionTarget: () => void;

  // Activated abilities (on companions / equipped items)
  activateAbility: (entityId: string, idx: number) => void;
  /** Sandbox affordance: sacrifice a permanent outright — a REAL exit (destroyEntity:
   *  card + items to Dead Zone, sworn returns, Item Transfer window queues). The old
   *  ✕-Sacrifice button faked this with adjustHp(-999), which clamps to 0 HP and
   *  removes NOTHING — a silent no-op behind a success toast. */
  sacrificeEntity: (entityId: string) => void;

  // Deck-peek (scry) resolution
  resolvePeek: (assignments: ('hand' | 'top' | 'bottom')[]) => void;
  /** "Any deck" peek (2026-07-16): the controller picks whose deck; slices it and
   *  advances the peek to its normal card-placement phase. */
  resolvePeekDeck: (side: 'p1' | 'p2') => void;
  cancelPeek: () => void;
  /** Dead-Zone recovery: take the dead card at `idx` (in the dead array) to hand. */
  resolveDeadPick: (idx: number) => void;
  cancelDeadPick: () => void;
  /** Reorder peek (Arc A): return the looked-at cards to the TOP of the peeked deck
   *  in the given order (a permutation of card indices; order[0] = new top). */
  resolvePeekOrder: (order: number[]) => void;
  /** Forced discard (Arc A): the VICTIM discards the chosen hand card, then the
   *  queue advances and any paused trigger stack (a trap's discard) resumes. */
  resolveDiscard: (cardId: string) => void;
  /** Hand reveal (Arc A): the LOOKER closes the reveal — with a pick mode and a
   *  chosen card, that card goes to the BOTTOM of its owner's deck and the owner
   *  draws a card; null = done looking / skip the optional pick. */
  resolveHandReveal: (cardId: string | null) => void;
  /** Equip-from-hand: equip the chosen item card onto the pending target. */
  resolveEquipPick: (handCardId: string) => void;
  cancelEquipPick: () => void;

  /** Start-of-turn modal choice (Pyre): pick option `idx` — pays the clause cost
   *  (sacrificeSelf → a real death, ruled 2026-07-08) then resolves the chosen mode
   *  (chaining into pendingActionTarget when it needs a target). */
  resolveModalChoice: (idx: number) => void;
  /** Decline an OPTIONAL modal choice — nothing is paid, nothing happens. */
  declineModalChoice: () => void;

  /** Item Transfer on Character Exit: exhaust `targetCharId` (a ready character with a
   *  fitting open slot, once per event) to claim the window's HEAD item out of the
   *  Dead Zone. */
  resolveItemTransfer: (targetCharId: string) => void;
  /** Decline the window's HEAD item — it simply stays in the Dead Zone. */
  declineItemTransfer: () => void;

  // Action bookkeeping
  markAction: (entityId: string, type: 'move' | 'minor' | 'major') => void;
  resetActions: (entityId: string) => void;

  // HP nudge (playtesting)
  adjustHp: (entityId: string, delta: number) => void;

  /** Apply the ready-phase Poison check outcomes (PoisonModal): a cleansed unit loses its
   *  counters and readies; each failed unit deals 1 damage per counter to the owner's PC
   *  (via setPcHp — entity + headline stay married, game ends at 0). Un-rolled units are
   *  simply omitted. Clears `pendingPoison`. */
  resolvePoison: (player: 'p1' | 'p2', outcomes: { id: string; cleansed: boolean }[]) => void;
  /** Coercion: the victim discards the chosen hand card to their Dead Zone. */
  resolveCoercionDiscard: (cardId: string) => void;
  /** Coercion: the victim sacrifices the chosen permanent (never their PC). */
  resolveCoercionSacrifice: (entityId: string) => void;

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

/**
 * The PAYMENT + PLACEMENT half of playing a card from hand (extracted Arc E,
 * 2026-08-23). Every legality question is settled BEFORE this runs; from here on the
 * play cannot be refused. Two callers must run byte-identical tails:
 *   · placeCard      — the ordinary play, no additional cost
 *   · resolveTribute — an Angel whose Tribute has just been paid
 * A second copy of this tail is how the two paths would drift (the Watchtower lesson).
 *
 * `czIdx` and `pcId` are passed IN rather than re-derived: they were computed from the
 * pre-payment board, and re-deriving legality after a cost is paid is exactly the
 * ordering bug the split exists to prevent.
 */
function commitPlay(
  s: GameStoreState, game: GameState, lp: 'p1' | 'p2', card: Card, slot: SlotId,
  czIdx: number, pcId: string | null | undefined,
): Partial<GameStoreState> {
    const newCZ = game[lp].classZone.map((c, i) =>
      i === czIdx ? { ...c, faceDown: true } : c
    );
    const newWillpower = computeWillpower(newCZ);

    // Build board entity from card
    const isCompanion = card.type === 'Companion';
    const isConstruct = card.type === 'Construct';

    const newEnt: BoardEntity = {
      id: uid(`placed-${card.id}`),
      kind: isConstruct ? 'construct' : 'companion',
      name: card.name,
      cls: card.class1,
      level: card.level,
      atk: card.attack ?? undefined,
      hp: card.hp ?? 0,
      maxHp: card.hp ?? 0,
      anchors: card.anchor ?? undefined,
      anchorsStart: card.anchor ?? undefined,
      // Companion-variant Armor X: "This companion enters the encounter with X armor
      // counters" (canon 2026-08-18). Placed ONCE here — from then on the COUNTERS
      // carry the behavior, not a keyword check (universal counter rule).
      armorCounters: parseArmorKeyword(card.keywords) ?? undefined,
      armorStart: parseArmorKeyword(card.keywords) ?? undefined,
      keywords: card.keywords,
      statuses: [],
      subtype: card.subtype,
      text: card.text,
      tapped: 'none', exhausted: false,
      // `fresh` = "entered the encounter this turn" for EVERY permanent (bugfix
      // 2026-07-15): constructs carry it too, so a type-changing effect (Animate
      // Magic) can preserve the permanent's true entry time instead of stamping the
      // Manifest as newly entered. Constructs themselves are never gated by it
      // (they don't attack; their abilities are economy-exempt); readyPlayer clears
      // it for all kinds at the controller's next ready.
      fresh: true,
      acts: freshActs(),
      loadout: isCompanion ? { weapon: null, gear: [] } : undefined,
    };

    // `card.id` rather than the pending's cardId: commitPlay is shared with the Tribute
    // resume, where the pending that armed the play is already cleared. Same card.
    const newHand = game[lp].hand.filter(c => c.id !== card.id);

    // ── The trigger stack (R1, owner-ratified 2026-07-12) ───────────────────────
    // Playing the card puts it ON THE STACK — it does not enter the encounter until
    // the stack empties down to it. Play-window triggers (Paranoia — canon:
    // "Whenever an opponent plays a Companion…", from-hand plays only) queue ABOVE
    // it and resolve first: the controller's peek happens BEFORE the companion
    // enters and before its on-enter effects (R3, re-ruled 2026-07-12 — "Peek first
    // 100%", superseding the 2026-07-04 placer's-scry-first order). The on-enter
    // machinery itself runs when the stack reaches the entered permanent's own
    // trigger (runOnEnter); reactive enter-traps resolve before it.
    const paidGame: GameState = {
      ...game,
      // The PC is the acting character for this Special Action (2026-07-15):
      // registers currentActor and seals any companion that was mid-activation.
      ...(pcId ? activationPatch(game, pcId) : {}),
      [lp]: { ...game[lp], hand: newHand, classZone: newCZ, willpower: newWillpower },
    };
    const paranoia = isCompanion ? gatherParanoia(paidGame, lp) : [];
    // On-play listeners (arc 4, owner 2026-07-15; extended Arc G 2026-08-04):
    // "When you play a …" — own-side listeners, from-hand plays ONLY (this reducer
    // IS the from-hand path; conversions/placements never emit a play event, R1).
    // Gathered from the PRE-ENTER board (paidGame — the entity is still on the
    // stack), so a companion entering from this very play never hears itself
    // (per-event evaluation, 2026-07-21). A companion play queues Paranoia AND
    // own 'ownPlaysCompanion' listeners (Echo-Keeper) — the first MIXED-owner
    // window; a construct play queues own-play listeners only.
    const onPlay = isConstruct && card.subtype === 'Incantation'
      ? gatherOwnSide(paidGame, 'ownPlaysMagicalConstruct', { id: newEnt.id, name: card.name, controller: lp })
      : isCompanion
        ? gatherOwnSide(paidGame, 'ownPlaysCompanion', { id: newEnt.id, name: card.name, controller: lp })
        : [];
    const playWindow = [...paranoia, ...onPlay];
    const g = pushStack(paidGame, [{ kind: 'enter', ent: newEnt, card, slot, controller: lp }]);
    // Structural queue (Rules Note 2026-07-22, IMPLEMENTED Arc G 2026-08-04 —
    // supersedes the batchOrderer fail-loudly guard for this window): segment the
    // window by controller — the placer's (active player's) triggers queue onto the
    // stack first, the opponent's above them, so theirs resolve first (LIFO:
    // Paranoia's peek before Echo-Keeper's — consistent with R3 "peek first").
    // Each owner orders their own segment when it holds >1 trigger; two prompts
    // serialize via PendingTriggerOrder.next (never dual-hold, the Arc F
    // discipline). Single-owner windows arm byte-identically to the pre-Arc-G path.
    const armed = armSegmentedWindow(g, segmentBatch(playWindow, lp));
    if (armed.paused) {
      return { pendingPlay: null, pendingTrigger: null, pendingKit: null, game: armed.game };
    }
    const r = runStack(armed.game, s);
    return {
      pendingPlay: null,
      pendingTrigger: null,
      pendingKit: null,
      ...r.local,
      game: r.game,
      toasts: [...s.toasts, ...mkToasts(r.toastMsgs)],
    };
}

export const useGameStore = create<GameStoreState>()(
  subscribeWithSelector(
  persist(
  recordActions(
  (set, get) => ({
  playPhase: 'lobby' as PlayPhase,
  conn: EMPTY_CONN,
  game: makeNewGame('You', SORCERER_WARRIOR_CARDS, 'Opponent', WIZARD_BUILDER_CARDS),
  localPlayer: 'p1' as 'p1' | 'p2',
  hovered: null,
  pending: null,
  pendingPlay: null,
  pendingTribute: null,
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

  assembleMpGame: (p1Cards, p2Cards) => {
    // Rebuild the authoritative game (host) now that the guest's real deck is known. Same
    // shape as startMultiplayer's game seed, but keep conn/localPlayer/_broadcast — we're
    // already hosting; only the game contents change (p2 becomes the guest's actual deck).
    set({
      game: makeNewGame('You', p1Cards, 'Opponent', p2Cards),
      ...LOCAL_PROMPTS_CLEARED,
      modalQueue: [],
      oathContext: null,
    });
  },

  placePc: (slot, targetPlayer) => set(s => {
    if (gameIsOver(s.game)) return s;
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
  // Deck-out (Requiem Arc A, owner-ruled 2026-08-25): the Draw Phase draw from an
  // empty deck LOSES the game (this replaced a silent no-op). drawCards is the
  // chokepoint; it sets `gameOver` to the opponent.
  drawCard: (player) => set(s => {
    if (gameIsOver(s.game)) return s;
    const r = drawCards(s.game, player, 1);
    if (r.lost) {
      const winner = player === 'p1' ? 'p2' : 'p1';
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 6000);
      return { game: r.game, toasts: [...s.toasts,
        { id, msg: `${s.game[player].name} must draw from an empty deck — ${s.game[winner].name} wins the game!` }] };
    }
    return { game: r.game };
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
    // Hold gate (live MP pass 2026-07-21): phase advancement while the opponent
    // resolves a reactive prompt is exactly the clobber reactiveHold exists to stop
    // (the wire suppresses the broadcast, so it was a silent LOCAL divergence).
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    const { currentPhase } = s.game;
    // Only advances draw→cz. CZ→action must go through completeCzPhase.
    const next: Phase = currentPhase === 'draw' ? 'cz' : currentPhase;
    return { game: { ...s.game, currentPhase: next } };
  }),

  /** CZ phase → Action phase. Called by CZExchangePanel after any valid choice (exchange or pass). */
  completeCzPhase: () => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer); // hold gate, see advancePhase
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    if (s.game.currentPhase !== 'cz') return s;
    return { game: { ...s.game, currentPhase: 'action' as Phase } };
  }),

  // Move active player to End Phase (they confirm before passing the turn)
  endTurnToEndPhase: () => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer); // hold gate, see advancePhase
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    return { game: { ...s.game, currentPhase: 'end' as Phase } };
  }),

  // ── Equip item ─────────────────────────────────────────────────────────────
  equipItem: (entityId, handCardId) => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game) || notActionPhase(s.game)) return s;
    const lp = s.localPlayer;
    const card = s.game[lp].hand.find(c => c.id === handCardId);
    if (!card || card.type !== 'Item') return s;
    const loc = findEntityAnywhere(s.game, entityId);
    if (!loc) return s;

    // Willpower requirement: must have Willpower ≥ the item's Level to play it.
    const wp = currentWillpower(s.game[lp]);
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

    // Equipping is a MINOR ACTION — the shared gate applies (strict §24 order,
    // 2026-07-15): refused after the Major (rotation only advances), and refused
    // when the Minor is already spent (equip was previously UNGATED here — the
    // double-Minor hole closed by the same shared gate; flagged in HANDOFF).
    const minorReason = minorActionReason(loc.ent);
    if (minorReason) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg: `Can't equip ${card.name}: ${minorReason}.` }] };
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

    // Kit-Master on EQUIP (2026-07-16, partial-gaps closeout — Captain's Belt /
    // Engineer's Toolbelt: "When this becomes equipped, you may move target item
    // from one character you control to another…"). The belts declare the
    // Kit-Master KEYWORD with equip timing; the engine only wired the companion
    // on-enter variant, so the belt clause was dead. Same prompt machinery
    // (pendingKit), same eligibility, optional ("you may" — cancel skips).
    let beltKit: PendingKit | null = null;
    if (card.keywords.includes('Kit-Master')) {
      const chars = (Object.values(g[lp].board) as (BoardEntity | undefined)[])
        .filter((e): e is BoardEntity => !!e && isCharacter(e));
      const sources = chars.filter(e =>
        allItemsOf(e).some(it => kitDests(g, lp, e.id, it.isWeapon, !!it.item.heavy).length > 0)
      ).map(e => e.id);
      if (sources.length > 0) {
        beltKit = { sourceName: card.name, step: 'source', eligibleIds: sources };
      } else {
        const id = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
        return { game: { ...g, ...activationPatch(s.game, entityId) },
          toasts: [...s.toasts, { id, msg: `${card.name} equipped — no item to move (Kit-Master).` }] };
      }
    }
    return { game: { ...g, ...activationPatch(s.game, entityId) }, ...(beltKit ? { pendingKit: beltKit } : {}) };
  }),

  // ── Play Action card ───────────────────────────────────────────────────────
  // Interprets the card's onPlay effects. If an effect needs an interactive board
  // target, arms pendingActionTarget and waits for a click; otherwise resolves
  // immediately. Either way the card ends up in the Dead Zone.
  playAction: (handCardId) => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game) || notActionPhase(s.game)) return s;
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

    // Pre-cost refusal (Arc I 2026-08-11, ruling 1 — the universal pre-cost rule
    // applied to control theft): a gainControl action with no legal target (the
    // CURRENT-hp gate) or no open slot on the caster's board CANNOT BE PLAYED —
    // refused before any cost is paid, card stays in hand. SCOPED to
    // gainControl-carrying actions: the shipped fizzle-to-Dead-Zone behavior of
    // every other action is untouched.
    const preOnPlay = onPlayEffects(card, s.game, lp);
    const preGc = preOnPlay.find(e => e.op === 'gainControl');
    if (preGc && preGc.op === 'gainControl') {
      const stealables = isInteractiveSpec(preGc.target)
        ? filterEligibleByEffects(s.game, eligibleTargets(s.game, lp, preGc.target), preOnPlay, card) : [];
      if (stealables.length === 0) {
        return { toasts: [...s.toasts, mkToast(`Can't play ${card.name}: no legal target within the HP limit.`)] };
      }
      if (![...FRONT_SLOTS, ...BACK_SLOTS].some(sl => !s.game[lp].board[sl])) {
        return { toasts: [...s.toasts, mkToast(`Can't play ${card.name}: no available slot on your board.`)] };
      }
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

    // ── Magic-Action riders + first-Magic tracking (2026-07-16, partial-gaps
    //    closeout). "Plays" is the event (2026-07-15 definition) — riders fire on
    //    the play itself, before any counter resolves (a countered action was
    //    still PLAYED). Trackers are 'ability-used:'-prefixed statuses on the
    //    actor, cleared at its controller's ready like every per-turn marker.
    const riderMsgs: string[] = [];
    let actorWasFirstMagic = false;
    if (card.subtype === 'Magic') {
      const MAGIC_TAG = 'ability-used:played-magic-this-turn';
      const a0 = findEntityAnywhere(g0, actLoc.ent.id)?.ent;
      actorWasFirstMagic = !!a0 && !a0.statuses.includes(MAGIC_TAG);
      if (a0 && actorWasFirstMagic) g0 = updateEntity(g0, a0.id, { statuses: [...a0.statuses, MAGIC_TAG] });
      // Embercast Wand: "Once per turn, when equipped character plays a Magic
      // Action, draw a card." — per-ITEM once-per-turn (printed limit; the 2026-07-15
      // guideline governs ACTIVATED abilities, not triggers).
      const bearer0 = findEntityAnywhere(g0, actLoc.ent.id)?.ent;
      const rlo = bearer0?.loadout;
      if (bearer0 && rlo) for (const it of [rlo.weapon, ...rlo.gear]) {
        if (!it) continue;
        const itemCard = CATALOG.find(c => c.name === it.name);
        for (const ce of itemCard?.effects ?? []) {
          if (ce.trigger !== 'onEquippedPlaysMagicAction') continue;
          const tag = `ability-used:magic-rider:${it.id}`;
          const cur = findEntityAnywhere(g0, bearer0.id)?.ent;
          if (!cur || (ce.oncePerTurn && cur.statuses.includes(tag))) continue;
          const rr = resolveActionEffects(g0, lp, it.name, ce.effects, undefined, bearer0.id);
          g0 = rr.game;
          riderMsgs.push(`${it.name}: ${rr.msgs.join(' | ') || 'triggers'}`);
          if (ce.oncePerTurn) {
            const c2 = findEntityAnywhere(g0, bearer0.id)?.ent;
            if (c2) g0 = updateEntity(g0, bearer0.id, { statuses: [...c2.statuses, tag] });
          }
        }
      }
    }

    // ── Counter check ──────────────────────────────────────────────────────────
    // If the opponent controls a counter ward and this action isn't uncounterable,
    // sacrifice the ward and send the action to the Dead Zone without resolving.
    const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
    // Ashforged Pendant (2026-07-16): "The first Magic Action equipped character
    // plays each turn cannot be countered." — the count resets each turn (the
    // tracker tag clears at ready).
    const pendantProtects = card.subtype === 'Magic' && actorWasFirstMagic
      && (() => { const b2 = findEntityAnywhere(g0, actLoc.ent.id)?.ent; const l2 = b2?.loadout;
           return !!l2 && [l2.weapon, ...l2.gear].some(it => it && (CATALOG.find(c => c.name === it.name)?.effects ?? [])
             .some(ce => ce.trigger === 'equipped' && ce.effects.some(e => e.op === 'firstMagicUncounterable'))); })();
    const uncounterable = (card.effects ?? []).some(c => c.uncounterable) || pendantProtects;
    if (!uncounterable) {
      const wardEntry = (Object.entries(g0[opp].board) as [SlotId, BoardEntity | undefined][])
        .find(([, e]) => e && permanentEffects(e, 'onOpponentAction').some(ef => ef.op === 'counterAction'));
      if (wardEntry) {
        const ward = wardEntry[1]!;
        let g = removeEntity(g0, ward.id);
        const wardCard = CATALOG.find(c => c.name === ward.name);
        if (wardCard) g = { ...g, [opp]: { ...g[opp], dead: [...g[opp].dead, wardCard] } };
        g = { ...g, [lp]: { ...g[lp], hand: g[lp].hand.filter(c => c.id !== handCardId), dead: [...g[lp].dead, card] } };
        return { game: g, pendingPlay: null, toasts: [...s.toasts, ...mkToasts(riderMsgs), mkToast(`${card.name} is countered by ${ward.name}!`)] };
      }
    }

    // Requiem Arc B (2026-08-25): clause-`if` gated at cast time (onPlayEffects) —
    // the armed pendingActionTarget carries the GATED set.
    const onPlay = onPlayEffects(card, g0, lp);

    // Two-step action: pick one of your characters first (then a slot or an enemy).
    // gainControl (Arc I): step 1 picks the OPPOSING companion instead (CURRENT-hp
    // gated); step 2 is the slot on the caster's board (resolveActionTarget arms it).
    const ts = twoStepKind(onPlay);
    if (ts) {
      const gcOp = onPlay.find(e => e.op === 'gainControl');
      // Arc A (2026-08-19): for the destroy two-steps, STEP 1 is the destroy target
      // (Gear / Physical Construct / the union), NOT one of the caster's characters.
      const dOp = onPlay.find(e => e.op === 'destroy');
      // Requiem Arc B (2026-08-25): readyUpTo's step 1 is the ready's own target.
      const rOp = onPlay.find(e => e.op === 'ready');
      const eligibleIds =
        (ts === 'destroyThenHeal' || ts === 'destroyUpTo') && dOp && dOp.op === 'destroy'
          ? filterEligibleByEffects(g0, eligibleTargets(g0, lp, dOp.target), onPlay, card)
        : ts === 'gainControl' && gcOp && gcOp.op === 'gainControl' && isInteractiveSpec(gcOp.target)
          ? filterEligibleByEffects(g0, eligibleTargets(g0, lp, gcOp.target), onPlay, card)
        : ts === 'readyUpTo' && rOp && rOp.op === 'ready'
          ? filterEligibleByEffects(g0, eligibleTargets(g0, lp, rOp.target), onPlay, card)
        : charsOf(g0, lp);
      const newHand = g0[lp].hand.filter(c => c.id !== handCardId);
      if (eligibleIds.length === 0) {
        return { game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] } }, pendingPlay: null, toasts: [...s.toasts, ...mkToasts(riderMsgs), mkToast(`${card.name} fizzles — no character to act.`)] };
      }
      return {
        game: { ...g0, [lp]: { ...g0[lp], hand: newHand } },
        pendingPlay: null,
        pendingActionTarget: { source: 'action', sourceName: card.name, lp, effects: onPlay, eligibleIds, card, twoStep: ts },
        toasts: [...s.toasts, ...mkToasts(riderMsgs)],
      };
    }

    // Deck-peek action: move to Dead Zone and open the scry modal. deck 'opp'
    // (Arc A — Recite the Ledger) peeks the OPPONENT's deck; reorder passes
    // through to the modal's "put back in any order" mode.
    const peek = onPlay.find(e => e.op === 'deckPeek');
    if (peek && peek.op === 'deckPeek') {
      const peekSide: 'p1' | 'p2' = peek.deck === 'opp' ? (lp === 'p1' ? 'p2' : 'p1') : lp;
      const cards = g0[peekSide].deck.slice(0, peek.look);
      const newHand = g0[lp].hand.filter(c => c.id !== handCardId);
      if (cards.length === 0) {
        return { game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] } }, pendingPlay: null, toasts: [...s.toasts, ...mkToasts(riderMsgs), mkToast(`${card.name} — deck is empty.`)] };
      }
      return {
        game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] },
          pendingPeek: { source: card.name, lp, deckSide: peekSide, cards, dests: peek.dests, maxHand: peek.maxHand, ...(peek.reorder ? { reorder: true as const } : {}) } },
        pendingPlay: null,
        toasts: [...s.toasts, ...mkToasts(riderMsgs)],
      };
    }

    const spec = actionTargetSpec(onPlay);

    if (spec) {
      // Arc H: op-level narrowing (bounce hpAtMost) — identity for shipped cards.
      // WARDED (Final Sweep, 2026-08-21): the ACTION CARD is passed so its class can be
      // matched against each candidate's ward. Only the Action-play sites pass a card —
      // ability/modal picks are hosted on permanents, and canon wards against CARDS.
      const eligibleIds = filterEligibleByEffects(g0, eligibleTargets(g0, lp, spec), onPlay, card);
      const newHand = g0[lp].hand.filter(c => c.id !== handCardId);
      if (eligibleIds.length === 0) {
        // No legal target — fizzle to the Dead Zone rather than soft-lock.
        return {
          game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] } },
          pendingPlay: null,
          toasts: [...s.toasts, ...mkToasts(riderMsgs), mkToast(`${card.name} fizzles — no legal target.`)],
        };
      }
      // Card goes on the "stack" (out of hand); resolves when a target is clicked.
      // sourceId = the acting character, so `target:'self'` ops (e.g. Conflagration's
      // "this character takes 1 damage") hit whoever played the card.
      return {
        game: { ...g0, [lp]: { ...g0[lp], hand: newHand } },
        pendingPlay: null,
        pendingActionTarget: { source: 'action', sourceName: card.name, lp, effects: onPlay, eligibleIds, card, sourceId: actLoc.ent.id },
        toasts: [...s.toasts, ...mkToasts(riderMsgs)],
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
      toasts: [...s.toasts, ...mkToasts(riderMsgs), mkToast(msgs.length ? `${card.name}: ${msgs.join(' | ')}` : `Played: ${card.name}`)],
    };
  }),

  resolveActionTarget: (targetId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pa = s.pendingActionTarget;
    if (!pa || !pa.eligibleIds.includes(targetId)) return s;

    // ── Two-step actions ──────────────────────────────────────────────────────
    if (pa.twoStep && !pa.firstId) {
      // Step 1: chose the first entity → arm step 2 (slot, enemy, or dest construct).
      if (pa.twoStep === 'gainControl') {
        // Arc I (2026-08-11): step 2 = the slot the stolen companion is placed in —
        // ANY open slot on the CASTER's board ("place in any available slot",
        // ruling 2; relocation is not movement, so between-lines restrictions do
        // not apply, and not a play, so the Back-Line rule does not either).
        const emptySlots = [...FRONT_SLOTS, ...BACK_SLOTS].filter(sl => !s.game[pa.lp].board[sl]);
        return { pendingActionTarget: { ...pa, firstId: targetId, eligibleIds: [], eligibleSlots: emptySlots } };
      }
      // Arc A (2026-08-19): STEP 1 DESTROYS, then arms the second pick. Unlike every
      // other twoStep kind, this one has already changed the board by the time step 2
      // is offered — which is why cancelActionTarget commits for these kinds.
      if (pa.twoStep === 'destroyThenHeal' || pa.twoStep === 'destroyUpTo') {
        const destroyEff = pa.effects.filter(e => e.op === 'destroy');
        const r = resolveActionEffects(s.game, pa.lp, pa.sourceName, destroyEff, targetId, pa.sourceId,
                                       magicCtx(s.game, pa.lp, pa.card));
        let g = r.game;
        const msgs = [...r.msgs];
        // What step 2 offers: the heal's own targets, or the constructs still standing.
        const rest = pa.effects.filter(e => e.op !== 'destroy');
        const spec = pa.twoStep === 'destroyThenHeal'
          ? actionTargetSpec(rest)
          : (pa.effects.find(e => e.op === 'destroy') as { target: TargetSpec } | undefined)?.target ?? null;
        const nextEligible = spec ? eligibleTargets(g, pa.lp, spec).filter(id => id !== targetId) : [];
        if (nextEligible.length) {
          const id0 = ++toastId;
          setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id0) })), 4000);
          return { game: g, pendingActionTarget: { ...pa, firstId: targetId, eligibleIds: nextEligible },
                   toasts: [...s.toasts, { id: id0, msg: `${pa.sourceName}: ${msgs.join(' | ')}` }] };
        }
        // Nothing left to pick — finish now rather than stranding an empty prompt.
        if (pa.twoStep === 'destroyThenHeal' && rest.length) {
          const r2 = resolveActionEffects(g, pa.lp, pa.sourceName, rest, undefined, pa.sourceId, magicCtx(g, pa.lp, pa.card));
          g = r2.game; msgs.push(...r2.msgs);
        }
        const done = pa.card ? { ...g, [pa.lp]: { ...g[pa.lp], dead: [...g[pa.lp].dead, pa.card] } } : g;
        const id1 = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id1) })), 4000);
        return { game: recomputeStatics(done), pendingActionTarget: null,
                 toasts: [...s.toasts, { id: id1, msg: `${pa.sourceName}: ${msgs.join(' | ')}` }] };
      }
      // Requiem Arc B (2026-08-25, Standing Ovation): STEP 1 READIES the first pick,
      // then offers the OPTIONAL second only while `maxIf` holds — evaluated NOW, at
      // the moment the second pick would arm (the twoStepKind comment's runtime gate).
      // The destroyUpTo shape exactly: the board has already changed when step 2 is
      // offered, so cancelActionTarget COMMITS for this kind (decline keeps pick 1).
      if (pa.twoStep === 'readyUpTo') {
        const readyEff = pa.effects.filter(e => e.op === 'ready');
        const r = resolveActionEffects(s.game, pa.lp, pa.sourceName, readyEff, targetId, pa.sourceId,
                                       magicCtx(s.game, pa.lp, pa.card));
        let g = r.game;
        const msgs = [...r.msgs];
        const rOp = pa.effects.find(e => e.op === 'ready');
        const capOk = !(rOp && rOp.op === 'ready' && rOp.maxIf) || conditionMet(g, pa.lp, (rOp as { maxIf: Condition }).maxIf);
        const nextEligible = capOk && rOp && rOp.op === 'ready'
          ? filterEligibleByEffects(g, eligibleTargets(g, pa.lp, rOp.target), pa.effects, pa.card).filter(id => id !== targetId)
          : [];
        if (nextEligible.length) {
          const id0 = ++toastId;
          setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id0) })), 4000);
          return { game: g, pendingActionTarget: { ...pa, firstId: targetId, eligibleIds: nextEligible },
                   toasts: [...s.toasts, { id: id0, msg: `${pa.sourceName}: ${msgs.join(' | ')}` }] };
        }
        const done = pa.card ? { ...g, [pa.lp]: { ...g[pa.lp], dead: [...g[pa.lp].dead, pa.card] } } : g;
        const id1 = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id1) })), 4000);
        return { game: recomputeStatics(done), pendingActionTarget: null,
                 toasts: [...s.toasts, { id: id1, msg: `${pa.sourceName}: ${msgs.join(' | ')}` }] };
      }
      if (pa.twoStep === 'reposition') {
        // Effect-driven repositioning is still MOVEMENT (R3, owner 2026-07-15): an
        // opposing between-lines restriction removes cross-line destinations here,
        // so restricted slots are never offered as clickable.
        const mover = findEntityAnywhere(s.game, targetId);
        const emptySlots = [...FRONT_SLOTS, ...BACK_SLOTS].filter(sl => !s.game[pa.lp].board[sl])
          .filter(sl => !mover || !moveRestrictedBy(s.game, mover.ent, mover.player, mover.slot, sl));
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
      const deadSink: PendingDeadPick[] = []; const armorSink: ArmorChoiceData[] = [];
      const srcLoc = findEntityAnywhere(g, pa.firstId);
      const dstLoc = findEntityAnywhere(g, targetId);
      if (srcLoc && dstLoc) {
        const moved = Math.min(count, srcLoc.ent.anchors ?? 0);
        g = updateEntity(g, targetId, { anchors: (dstLoc.ent.anchors ?? 0) + moved });
        const srcNext = (srcLoc.ent.anchors ?? 0) - moved;
        if (srcNext <= 0) {
          const d = destroyEntity(g, pa.firstId, deadSink, armorSink, 'sacrifice'); // sacrifice = death (fires triggers + on-sacrifice listeners)
          g = d.game;
          msgs.push(`${srcLoc.ent.name} loses its last anchor — sacrificed!`, ...d.msgs);
        }
        else g = updateEntity(g, pa.firstId, { anchors: srcNext });
        msgs.push(`Moved ${moved} anchor${moved !== 1 ? 's' : ''} ${srcLoc.ent.name} → ${dstLoc.ent.name}`);
      }
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
      return { game: recomputeStatics(armPrompts(g, deadSink, armorSink)), pendingActionTarget: null, toasts: [...s.toasts, { id, msg: `${pa.sourceName}: ${msgs.join(' | ')}` }] };
    }
    if ((pa.twoStep === 'destroyThenHeal' || pa.twoStep === 'destroyUpTo' || pa.twoStep === 'readyUpTo') && pa.firstId) {
      // Step 2: the heal's chosen target, the second destroy, or the second ready.
      const step2 = pa.twoStep === 'destroyThenHeal'
        ? pa.effects.filter(e => e.op !== 'destroy')
        : pa.twoStep === 'readyUpTo'
        ? (pa.effects.filter(e => e.op === 'ready') as Effect[])
        : (pa.effects.filter(e => e.op === 'destroy') as Effect[]);
      const r = resolveActionEffects(s.game, pa.lp, pa.sourceName, step2, targetId, pa.sourceId,
                                     magicCtx(s.game, pa.lp, pa.card));
      const done = pa.card ? { ...r.game, [pa.lp]: { ...r.game[pa.lp], dead: [...r.game[pa.lp].dead, pa.card] } } : r.game;
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
      return { game: recomputeStatics(done), pendingActionTarget: null,
               toasts: [...s.toasts, { id, msg: `${pa.sourceName}: ${r.msgs.join(' | ')}` }] };
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
    // FINAL SWEEP (2026-08-21): an Action's effects may now QUEUE stack entries rather
    // than resolving inline — forced attacks are real attacks and each opens a full
    // declaration window. Drive the stack here so the volley resolves within the same
    // reducer, and surface whatever it says. A pause inside it (armor choice, ordering
    // prompt, a Final Word demand) leaves the rest of the volley ON the stack, which is
    // exactly the sequencing this shape exists for; resolveArmor / resolveTriggerOrder /
    // resumeStack pick it up. Actions that queue nothing are byte-identical.
    let outG = armPrompts(finalGame, deadSink, armorSink);
    let outLocal: Partial<GameStoreState> = {};
    const outMsgs: string[] = [];
    if (outG.triggerStack?.length) {
      const r = runStack(outG, s);
      outG = r.game; outLocal = r.local; outMsgs.push(...r.toastMsgs);
    }
    return {
      ...outLocal,
      game: outG,
      pendingActionTarget: null,
      toasts: [...s.toasts, { id, msg: msgs.length ? `${pa.sourceName}: ${msgs.join(' | ')}` : pa.sourceName },
               ...mkToasts(outMsgs)],
    };
  }),

  resolveActionSlot: (slot) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pa = s.pendingActionTarget;
    if (!pa || !pa.firstId || !pa.eligibleSlots?.includes(slot)) return s;

    // ── gainControl (Arc I 2026-08-11, Command the Broken): REAL relocation ─────
    if (pa.twoStep === 'gainControl') {
      const mkT = (msg: string) => {
        const tid = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== tid) })), 4000);
        return { id: tid, msg };
      };
      const loc = findEntityAnywhere(s.game, pa.firstId);
      const gcOp = pa.effects.find(e => e.op === 'gainControl');
      const cap = gcOp && gcOp.op === 'gainControl' ? gcOp.hpAtMost : undefined;
      // Re-check at resolution (per-event state): target gone, no longer a legal
      // steal, or the slot filled → the steal fizzles LOUDLY (the cost was already
      // paid — playAction's up-front rule); the card still buries.
      if (!loc || loc.player === pa.lp || loc.ent.kind !== 'companion'
        || (cap != null && loc.ent.hp > cap) || s.game[pa.lp].board[slot]) {
        const buried = pa.card ? { ...s.game, [pa.lp]: { ...s.game[pa.lp], dead: [...s.game[pa.lp].dead, pa.card] } } : s.game;
        return { game: buried, pendingActionTarget: null,
          toasts: [...s.toasts, mkT(`${pa.sourceName} fizzles — the target is no longer a legal steal.`)] };
      }
      const owner = loc.player;
      // Board-to-board move — NEVER through hand, NEVER an enter (ruling 3): no
      // placeCard, no onEnter/Paranoia/trap windows, no Scavenger re-fire. Control
      // is board membership (ruling 2) — every "your companions" read follows free.
      const fromBoard = { ...s.game[owner].board };
      delete fromBoard[loc.slot];
      let g: GameState = { ...s.game, [owner]: { ...s.game[owner], board: fromBoard } };
      // fresh:true — relocation IS an entry for the Major-Action check (ruling 2:
      // exactly why the card grants Zealous); acts reset for the new controller.
      // Exhaust/tap/hp/counters PERSIST — the steal is not a ready.
      const stolen: BoardEntity = { ...loc.ent, stolenFrom: owner, fresh: true, acts: freshActs() };
      g = { ...g, [pa.lp]: { ...g[pa.lp], board: { ...g[pa.lp].board, [slot]: stolen } } };
      const msgs = [`${loc.ent.name} is under your control until end of turn`];
      // The rest of the card's effects (the Zealous grant) apply to the stolen
      // companion BY ID — the reposition precedent ("resolve the rest after the move").
      const rest = pa.effects.filter(e => e.op !== 'gainControl');
      if (rest.length) {
        const r = resolveActionEffects(g, pa.lp, pa.sourceName, rest, pa.firstId, undefined);
        g = r.game; msgs.push(...r.msgs);
      }
      const finalGame = pa.card ? { ...g, [pa.lp]: { ...g[pa.lp], dead: [...g[pa.lp].dead, pa.card] } } : g;
      return { game: recomputeStatics(finalGame), pendingActionTarget: null,
        toasts: [...s.toasts, mkT(`${pa.sourceName}: ${msgs.join(' | ')}`)] };
    }

    if (pa.twoStep !== 'reposition') return s;
    const loc = findEntityAnywhere(s.game, pa.firstId);
    // Defense-in-depth (R3): eligibleSlots was already restriction-filtered at arming;
    // re-check against the CURRENT board in case a restriction source entered since.
    if (loc) {
      const blocked = moveRestrictedBy(s.game, loc.ent, loc.player, loc.slot, slot);
      if (blocked) {
        const tid = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== tid) })), 4000);
        return { pendingActionTarget: null, toasts: [...s.toasts, { id: tid, msg: `${loc.ent.name} cannot move between lines — ${blocked} (opposing aura).` }] };
      }
    }
    let g = s.game; const msgs: string[] = [];
    let movedToFront = false;
    if (loc) {
      const board = { ...g[loc.player].board };
      delete board[loc.slot];
      board[slot] = loc.ent;
      g = { ...g, [loc.player]: { ...g[loc.player], board } };
      msgs.push(`${loc.ent.name} repositions`);
      // An effect-driven reposition is still a MOVE — arriving in the front line
      // from outside it trips Pit Trap windows (R4, 2026-07-12; companions only).
      movedToFront = loc.ent.kind === 'companion' && !isFront(loc.slot) && isFront(slot);
    }
    // Resolve the rest of the card's effects (e.g. the draw) after the move.
    const rest = pa.effects.filter(e => e.op !== 'move');
    const r = resolveActionEffects(g, pa.lp, pa.sourceName, rest, undefined); g = r.game; msgs.push(...r.msgs);
    let finalGame = pa.card ? { ...g, [pa.lp]: { ...g[pa.lp], dead: [...g[pa.lp].dead, pa.card] } } : g;
    const stackMsgs: string[] = [];
    let stackLocal: Partial<GameStoreState> = {};
    if (movedToFront && loc) {
      const reactive = gatherReactive(finalGame, 'oppCompanionMovesToFront', { id: loc.ent.id, name: loc.ent.name, controller: loc.player });
      if (reactive.length > 1) {
        // Their CONTROLLER orders (Rules Note 2026-07-22).
        finalGame = { ...finalGame, pendingTriggerOrder: { lp: batchOrderer(reactive), items: reactive, picked: [] } };
      } else if (reactive.length === 1) {
        const rs = runStack(pushStack(finalGame, reactive), s);
        finalGame = rs.game; stackMsgs.push(...rs.toastMsgs); stackLocal = rs.local;
      }
    }
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { game: finalGame, pendingActionTarget: null, ...stackLocal,
      toasts: [...s.toasts, { id, msg: `${pa.sourceName}: ${msgs.join(' | ')}` }, ...mkToasts(stackMsgs)] };
  }),

  activateAbility: (entityId, idx) => set(s => {
    // CATEGORICAL UX RULE (owner 2026-07-08): no gameplay click may ever silently do
    // nothing — EVERY refusal in this gate surfaces a toast naming its reason. New
    // abilities inherit this automatically because all activation flows through here.
    const toast = (msg: string) => {
      const tid = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== tid) })), 4000);
      return { id: tid, msg };
    };
    const refuse = (msg: string) => ({ toasts: [...s.toasts, toast(msg)] });

    const hold = reactiveHold(s.game, s.localPlayer);
    if (hold) return refuse(`Waiting for the opponent to resolve ${hold}.`);
    if (gameIsOver(s.game)) return refuse('The game is over.');
    if (notActionPhase(s.game)) return refuse('Not in the Action Phase — resolve the Class Zone Exchange (or Skip) first.');
    const loc = findEntityAnywhere(s.game, entityId);
    if (!loc) return refuse('That character is no longer on the board.');
    const ability = gatherActivated(loc.ent)[idx];
    if (!ability) return refuse('That ability is no longer available.');

    if (ability.oncePerTurn && loc.ent.statuses.includes(abilityUsedTag(ability.sourceName))) {
      return refuse(`${ability.sourceName} already used this turn.`);
    }

    const player = loc.player;

    // Activating an ability is the character's action per the clause's actionCost
    // (bugfix 2026-07-15 — Anchor Stone: "As a Minor Action, exhaust this trinket"):
    // 'minor' = Minor budget, 45° tap, legal on the entry turn (the first-turn ban
    // covers Major Actions only); default 'major' = the pre-existing rule (Major
    // budget, exhausts the activator). Constructs are not bound by character action
    // economy — their abilities cost only what the card states.
    // THE WINDOW MODEL (owner-ratified 2026-07-16, supersedes the 2026-07-15
    // Minor-spend): an item-hosted ability with NO printed action prefix is NOT a
    // character action — it belongs to the bearer's ACTIVATION WINDOW. Cost is the
    // item's exhaustion only; no character action is spent and the bearer does not
    // rotate; usable at any point within the window (before Movement, at 90°, fully
    // exhausted — rotation spends actions, not the window); tapping OPENS or
    // CONTINUES the bearer's activation (the activation patch below seals any other
    // character mid-activation, like every character switch). An item ability whose
    // card DOES print an action prefix (Quill of Unmaking: "As a Major Action…")
    // carries an explicit actionCost and stays a character action.
    const isItemAbility = !!ability.itemId;
    const windowModel = isItemAbility && ability.actionCost === undefined;
    const actionCost: 'minor' | 'major' | null = windowModel ? null : (ability.actionCost ?? 'major');
    // An exhausted hosting item is checked FIRST (2026-07-15): it is the most
    // specific refusal, and the check is side-effect-free.
    if (ability.cost?.kind === 'exhaustItem' && ability.itemId) {
      const host = [loc.ent.loadout?.weapon, ...(loc.ent.loadout?.gear ?? [])].find(it => it?.id === ability.itemId);
      if (host?.exhausted) return refuse(`${ability.sourceName} is exhausted.`);
    }
    if (windowModel) {
      // Existing inactive-player restriction (GRU §Inactive Player, cited not
      // re-ruled): "Item abilities are used only on their controller's turn."
      if (loc.player !== s.game.activePlayer) {
        return refuse(`${ability.sourceName}: item abilities are used on their controller's turn.`);
      }
      // Sealed with the character (2026-07-16): once another character acted, the
      // bearer's items are untappable for the rest of the turn.
      if (isSealed(s.game, entityId)) {
        return refuse(`${loc.ent.name}'s activation is finished.`);
      }
      // Deliberately NO fresh/rotation/budget checks: the window is the only gate.
    } else if (isCharacter(loc.ent)) {
      const isExhausted = loc.ent.tapped === 'major' || loc.ent.exhausted;
      // Minor-cost abilities route through the SHARED Minor gate (strict §24 order,
      // 2026-07-15): no Minor after the Major — rotation only advances.
      const reason = isSealed(s.game, entityId) ? 'Activation already finished'
        : actionCost === 'minor'
          ? minorActionReason(loc.ent)
          : loc.ent.fresh ? 'No Major Actions on its entry turn'
          : loc.ent.acts.major ? 'Major action already used'
          : isExhausted ? 'Exhausted' : null;
      if (reason) return refuse(`Can't activate ${ability.sourceName}: ${reason}.`);
    }

    // ── Cost PAYABILITY — checked BEFORE paying anything (a kind can pass the
    //    validator's shape check and still be unpayable; unpayable → refuse loudly,
    //    never a silent fall-through and never a burnt cost). ────────────────────
    const cost = ability.cost;
    // Runtime guard: deck JSON is not type-checked — an unknown/unimplemented cost
    // kind must refuse loudly, never fall through as a FREE ability. ('sacrifice'
    // and 'discard' were REMOVED from the Cost schema per owner ruling 2026-07-08 —
    // re-add together with engine support — so any occurrence is legacy/hand-edited
    // data reaching runtime past the mint gate.)
    if (cost && !['exhaustSelf', 'exhaustItem', 'sacrificeSelf', 'payHP', 'removeAnchor'].includes(cost.kind)) {
      return refuse(`Can't activate ${ability.sourceName}: its cost kind ("${(cost as { kind: string }).kind}") is not supported by the engine.`);
    }
    if (cost?.kind === 'exhaustSelf' && (loc.ent.exhausted || loc.ent.tapped === 'major')) {
      return refuse(`Can't activate ${ability.sourceName}: already exhausted — the exhaust cost can't be paid.`);
    }
    // exhaustItem (2026-07-15): the cost exhausts the HOSTING item. Item-hosted
    // clauses only (misauthored data refuses loudly); an already-exhausted item
    // can't pay again — and exhaustion travels with the item, so a Kit-Master
    // move never grants a second activation.
    const hostItem = ability.itemId
      ? [loc.ent.loadout?.weapon, ...(loc.ent.loadout?.gear ?? [])].find(it => it?.id === ability.itemId)
      : undefined;
    if (cost?.kind === 'exhaustItem') {
      if (!ability.itemId || !hostItem) return refuse(`Can't activate ${ability.sourceName}: an exhaust-item cost requires the ability to live on an equipped item.`);
      if (hostItem.exhausted) return refuse(`${ability.sourceName} is exhausted.`);
    }
    if (cost?.kind === 'payHP' && loc.ent.hp <= cost.amount) {
      // Never a lethal payment — same rule as Mara's optional on-attack cost.
      return refuse(`Can't activate ${ability.sourceName}: not enough HP to pay ${cost.amount}.`);
    }
    if (cost?.kind === 'removeAnchor' && (loc.ent.anchors ?? 0) < cost.count) {
      return refuse(`Can't activate ${ability.sourceName}: not enough Anchor counters to pay ${cost.count}.`);
    }

    // ── Target availability — ALSO before paying: an ability that needs a target
    //    it doesn't have refuses up front (the old order paid first, so e.g. a Quill
    //    with no construct in play sacrificed itself for nothing). ────────────────
    const spec = actionTargetSpec(ability.effects);
    if (spec && filterEligibleByEffects(s.game, eligibleTargets(s.game, player, spec).filter(t => t !== entityId), ability.effects).length === 0) {
      return refuse(`${ability.sourceName} — no legal target.`);
    }
    // RULED 2026-07-08 (universal pre-cost refusal): an ability that would affect
    // NOTHING cannot be activated — non-interactive effects check their recipients
    // up front too (e.g. Collapsing Tunnel with an empty enemy back line used to pay
    // its sacrifice and whiff).
    if (!spec && !effectsWouldAffectSomething(s.game, player, ability.effects, entityId)) {
      return refuse(`${ability.sourceName} — it would affect nothing right now.`);
    }

    let g = s.game;
    let sacrificedSelf = false;
    const costMsgs: string[] = [];
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];

    // ── Pay the cost ─────────────────────────────────────────────────────────
    if (cost?.kind === 'sacrificeSelf') {
      if (ability.itemId) {
        const lo = loc.ent.loadout ?? { weapon: null, gear: [] };
        const newLo = { weapon: lo.weapon?.id === ability.itemId ? null : lo.weapon, gear: lo.gear.map(x => x?.id === ability.itemId ? null : x) };
        g = updateEntity(g, entityId, { loadout: newLo });
        const itemCard = CATALOG.find(c => c.name === ability.sourceName);
        if (itemCard) g = { ...g, [player]: { ...g[player], dead: [...g[player].dead, itemCard] } };
      } else {
        // Self-sacrifice is an EXIT like any other — destroyEntity moves the card AND
        // its items to the Dead Zone, returns a sworn card, queues the Item Transfer
        // window, and (ruled 2026-07-08: sacrifice IS a death) fires death triggers.
        const d = destroyEntity(g, entityId, deadSink, armorSink, 'sacrifice');
        g = d.game; costMsgs.push(...d.msgs);
        sacrificedSelf = true;
      }
    } else if (cost?.kind === 'exhaustSelf') {
      g = updateEntity(g, entityId, { exhausted: true, tapped: 'major', acts: { ...loc.ent.acts, major: true } });
    } else if (cost?.kind === 'exhaustItem') {
      const lo = loc.ent.loadout!;
      g = updateEntity(g, entityId, { loadout: {
        weapon: lo.weapon && lo.weapon.id === ability.itemId ? { ...lo.weapon, exhausted: true } : lo.weapon,
        gear: lo.gear.map(it => it && it.id === ability.itemId ? { ...it, exhausted: true } : it),
      } });
    } else if (cost?.kind === 'payHP') {
      g = updateEntity(g, entityId, { hp: Math.max(0, loc.ent.hp - cost.amount) });
    } else if (cost?.kind === 'removeAnchor') {
      const left = (loc.ent.anchors ?? 0) - cost.count;
      // Paying the LAST anchor sacrifices the construct — consistent with the anchor
      // effect op and the decay rule ("sacrifice when last removed"). Engine default;
      // no shipped card pays this cost yet (flagged to the owner).
      if (left <= 0) {
        const d = destroyEntity(g, entityId, deadSink, armorSink, 'sacrifice'); // sacrifice = death
        g = d.game; costMsgs.push(...d.msgs);
      } else {
        g = updateEntity(g, entityId, { anchors: left });
      }
    }

    // Mark once-per-turn (only if the source is still around).
    if (ability.oncePerTurn && !sacrificedSelf) {
      const cur = findEntityAnywhere(g, entityId);
      if (cur) g = updateEntity(g, entityId, { statuses: [...cur.ent.statuses, abilityUsedTag(ability.sourceName)] });
    }

    // Consume the character's action per the clause's actionCost: 'minor' → Minor
    // budget + 45° tap; 'major' (default for body-hosted) → Major budget + exhaust.
    // WINDOW-MODEL item taps (actionCost null, 2026-07-16) spend NOTHING — the item's
    // exhaustion is the whole cost and the bearer does not rotate. Skip if the
    // entity was sacrificed as the cost, if exhaustSelf already did it, or for
    // constructs.
    if (isCharacter(loc.ent) && actionCost !== null && !sacrificedSelf && cost?.kind !== 'exhaustSelf') {
      const cur = findEntityAnywhere(g, entityId);
      if (cur) {
        g = actionCost === 'minor'
          ? updateEntity(g, entityId, { acts: { ...cur.ent.acts, minor: true }, tapped: cur.ent.tapped === 'none' ? 'minor' : cur.ent.tapped })
          : updateEntity(g, entityId, { acts: { ...cur.ent.acts, major: true }, exhausted: true, tapped: 'major' });
      }
    }

    // Atomic activation: activating a character's ability seals its activation
    // (and any other character mid-activation). Constructs are exempt.
    if (isCharacter(loc.ent)) g = { ...g, ...activationPatch(s.game, entityId) };

    // The source may have left play paying its cost (sacrificeSelf, last-anchor pay).
    const selfId = findEntityAnywhere(g, entityId) ? entityId : undefined;

    // Deck-peek ability (Runic Convergence Staff, 2026-07-16): deckPeek is
    // modal-driven, not an inline interpreter op — arm the scry (with the
    // "any deck" choice phase when the card grants it), playAction's pattern.
    const peekEff = ability.effects.find(e => e.op === 'deckPeek');
    if (peekEff && peekEff.op === 'deckPeek') {
      const built = buildPeek(g, { source: ability.sourceName, lp: player, deckSide: player,
        look: peekEff.look, dests: peekEff.dests, maxHand: peekEff.maxHand, deck: peekEff.deck,
        ...(peekEff.reorder ? { reorder: true as const } : {}) });
      if (!built) {
        return { game: armPrompts(g, deadSink, armorSink), toasts: [...s.toasts, toast(`${ability.sourceName} — the deck is empty.`)] };
      }
      return { game: armPrompts({ ...g, pendingPeek: built }, deadSink, armorSink) };
    }

    // ── Resolve the effect (target or immediate) ─────────────────────────────
    if (spec) {
      // Re-derive against the post-cost board (the pre-cost check above guarantees
      // this is non-empty except for the vanishing edge where paying the cost itself
      // removed the last target — then the toast below still names the outcome).
      const eligibleIds = filterEligibleByEffects(g, eligibleTargets(g, player, spec).filter(t => t !== entityId), ability.effects);
      if (eligibleIds.length === 0) {
        return { game: armPrompts(g, deadSink, armorSink), toasts: [...s.toasts, toast(`${ability.sourceName} — no legal target left after paying the cost.`)] };
      }
      // Arm any death-trigger picks / transfer windows the COST produced (the target
      // pick coexists with them; armNextItemTransfer holds rescues behind dead-picks).
      return {
        game: armPrompts(g, deadSink, armorSink),
        pendingActionTarget: { source: 'ability', sourceName: ability.sourceName, lp: player, effects: ability.effects, eligibleIds, sourceId: selfId },
      };
    }
    const r = resolveActionEffects(g, player, ability.sourceName, ability.effects, undefined, selfId, undefined, deadSink, armorSink);
    const allMsgs = [...costMsgs, ...r.msgs];
    // An immediate resolution that produced no messages had nothing to affect —
    // say so instead of a bare source-name toast (silent-whiff honesty; should be
    // unreachable for known ops now that would-affect-nothing refuses pre-cost).
    return { game: armPrompts(r.game, deadSink, armorSink),
      toasts: [...s.toasts, toast(allMsgs.length ? `${ability.sourceName}: ${allMsgs.join(' | ')}` : `${ability.sourceName}: no effect (nothing valid to affect).`)] };
  }),

  // ── Sandbox: sacrifice a permanent outright (a real exit — see interface note) ──
  sacrificeEntity: (entityId) => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer); // hold gate, see advancePhase
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    const loc = findEntityAnywhere(s.game, entityId);
    if (!loc || !canBeSacrificed(loc.ent)) return s; // never the PC — the 2026-07-24 chokepoint
    const name = loc.ent.name;
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    const d = destroyEntity(s.game, entityId, deadSink, armorSink, 'sacrifice'); // sacrifice = death (ruled 2026-07-08)
    const g = armPrompts(d.game, deadSink, armorSink);
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
    return { game: recomputeStatics({ ...g, selected: s.game.selected === entityId ? null : s.game.selected }),
      toasts: [...s.toasts, { id, msg: [`${name} sacrificed.`, ...d.msgs].join(' | ') }] };
  }),

  // Cancel a pending target. Action cards return to hand; on-enter effects just fizzle.
  cancelActionTarget: () => set(s => {
    const pa = s.pendingActionTarget;
    if (!pa) return { pendingActionTarget: null };
    // Arc A (2026-08-19): for the destroy two-steps, STEP 1 already destroyed something.
    // "Skip" at step 2 means STOP (an "up to two" that takes one), never undo — so the
    // card goes to the Dead Zone like any resolved Action. Rolling it back to hand here
    // would hand the player a free destroy.
    if (pa.firstId && (pa.twoStep === 'destroyThenHeal' || pa.twoStep === 'destroyUpTo'
        || pa.twoStep === 'readyUpTo')) { // readyUpTo (Arc B): "up to two" that took one — same commit
      const g = pa.card ? { ...s.game, [pa.lp]: { ...s.game[pa.lp], dead: [...s.game[pa.lp].dead, pa.card] } } : s.game;
      return { pendingActionTarget: null, game: g };
    }
    if (pa.source === 'action' && pa.card) {
      return {
        pendingActionTarget: null,
        game: { ...s.game, [pa.lp]: { ...s.game[pa.lp], hand: [...s.game[pa.lp].hand, pa.card] } },
      };
    }
    return { pendingActionTarget: null };
  }),

  // ── Simultaneous-trigger ordering (trigger stack, owner-ratified 2026-07-12;
  // chooser re-ruled 2026-07-22) ──
  // Canon (Rules Note 2026-07-22): each player orders their OWN simultaneous
  // triggers — `lp` is the batch's controller (supersedes the 2026-07-12
  // active-player reconfirmation and Tier 5 #9 / Tier 3 #18's tiebreaker).
  // Picks are BLIND: the order is decided at queue time and nothing resolves
  // between picks (unchanged).
  resolveTriggerOrder: (idx) => set(s => {
    if (gameIsOver(s.game)) return s;
    const po = s.game.pendingTriggerOrder;
    if (!po) return s;
    if (s.conn.mode !== 'solo' && po.lp !== s.localPlayer) return s; // orderer-only
    if (idx < 0 || idx >= po.items.length || po.picked.includes(idx)) return s;
    const picked = [...po.picked, idx];
    if (picked.length < po.items.length - 1) {
      return { game: { ...s.game, pendingTriggerOrder: { ...po, picked } } };
    }
    // Order complete (the last unpicked item is implied) — the triggers go on the
    // stack in the chosen order and it runs.
    let g = pushStack({ ...s.game, pendingTriggerOrder: undefined }, orderedForStack(po.items, picked));
    // Arc G (2026-08-04): a segmented mixed-owner window chains the OTHER owner's
    // segment — pushed ABOVE the segment just ordered (structural queue: theirs
    // resolve first when they are the non-active side). >1 → their own ordering
    // prompt (serialized, never dual-hold — the hold flips to the new orderer);
    // a singleton needs no prompt and pushes directly.
    if (po.next) {
      if (po.next.items.length > 1) {
        return { game: { ...g, pendingTriggerOrder: { lp: po.next.lp, items: po.next.items, picked: [] } } };
      }
      g = pushStack(g, po.next.items);
    }
    const r = runStack(g, s);
    return { ...r.local, game: r.game, toasts: [...s.toasts, ...mkToasts(r.toastMsgs)] };
  }),

  resumeStack: () => set(s => {
    if (gameIsOver(s.game)) return s;
    const stack = s.game.triggerStack;
    const top = stack?.[stack.length - 1];
    if (!top) return s;
    if (s.game.pendingTriggerOrder || s.game.pendingPeek || s.game.pendingArmor || s.game.pendingPreventOrder
      || s.game.pendingDiscard || s.game.pendingHandReveal || s.game.pendingForcedSacrifice
      || s.game.pendingCombatPick || s.game.pendingHauntReturn) return s; // paused on a prompt, not a hand-off
    // Arc G (2026-08-04): an enterUnit-headed stack also pauses on the game-level
    // prompts the global list doesn't cover — narrow to the new kind, so shipped
    // ownEnter resumption (which can legitimately coexist with a dead pick) is
    // byte-identical.
    if (top.kind === 'enterUnit' && (s.game.pendingDeadPick || s.game.pendingCoercion || s.game.pendingItemTransfer)) return s;
    if (top.kind === 'ownEnter' && s.conn.mode !== 'solo' && top.controller !== s.localPlayer) return s;
    const r = runStack(s.game, s);
    return { ...r.local, game: r.game, toasts: [...s.toasts, ...mkToasts(r.toastMsgs)] };
  }),

  // ── "Any deck" peek: the controller picks whose deck (2026-07-16) ──────────
  resolvePeekDeck: (side) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pk = s.game.pendingPeek;
    if (!pk?.chooseDeck) return s;
    if (s.conn.mode !== 'solo' && pk.lp !== s.localPlayer) return s; // controller-only
    const cards = s.game[side].deck.slice(0, pk.look ?? 1);
    if (cards.length === 0) {
      // The chosen deck is empty — surface it and drain to any queued peek.
      const { peek, rest } = nextPeek(s.game, s.game.pendingPeekQueue);
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { game: { ...s.game, pendingPeek: peek, pendingPeekQueue: rest },
        toasts: [...s.toasts, { id, msg: `${pk.source} — that deck is empty.` }] };
    }
    // Advance to the normal placement phase against the chosen deck.
    return { game: { ...s.game, pendingPeek: {
      source: pk.source, lp: pk.lp, deckSide: side, cards, dests: pk.dests, maxHand: pk.maxHand } } };
  }),

  // ── Deck-peek (scry): apply the player's per-card destinations ─────────────
  resolvePeek: (assignments) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pk = s.game.pendingPeek;
    if (!pk) return s;
    const side = pk.deckSide;
    const ps = s.game[side];
    // The looked-at cards were the top `pk.cards.length`; the rest of the deck is below.
    const below = ps.deck.slice(pk.cards.length);
    const toHand: Card[] = [], toTop: Card[] = [], toBottom: Card[] = [];
    pk.cards.forEach((c, i) => {
      // Coerce any destination the peek doesn't offer back to 'top' (else a stray
      // 'hand' on an opponent-deck peek would vaporize the card: lp !== deckSide
      // means toHand cards are never added to a hand below).
      const raw = assignments[i] ?? 'top';
      const dest = pk.dests.includes(raw) ? raw : pk.dests.includes('top') ? 'top' : pk.dests[0];
      (dest === 'hand' ? toHand : dest === 'bottom' ? toBottom : toTop).push(c);
    });
    const newDeck = [...toTop, ...below, ...toBottom];
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    const parts: string[] = [];
    if (toHand.length) parts.push(`${toHand.length} to hand`);
    if (toBottom.length) parts.push(`${toBottom.length} to bottom`);
    if (toTop.length) parts.push(`${toTop.length} kept on top`);
    let g: GameState = { ...s.game, pendingPeek: null, [side]: { ...ps, deck: newDeck, hand: pk.lp === side ? [...s.game[pk.lp].hand, ...toHand] : ps.hand } };
    // A paused trigger stack resumes FIRST (a Paranoia peek pauses the stack before
    // the played companion enters — R3, 2026-07-12): the enter, its traps, and its
    // on-enter run now (possibly arming the NEXT peek). Only if the stack left no
    // peek armed do the queued start-of-turn peeks advance.
    let local: Partial<GameStoreState> = {};
    const stackMsgs: string[] = [];
    if (g.triggerStack?.length) {
      const r = runStack(g, s);
      g = r.game; local = r.local; stackMsgs.push(...r.toastMsgs);
    }
    if (!g.pendingPeek) {
      const { peek, rest } = nextPeek(g, g.pendingPeekQueue); // advance any queued start-of-turn peeks
      g = { ...g, pendingPeek: peek, pendingPeekQueue: rest };
    }
    return {
      ...local,
      game: armNextItemTransfer(g),
      toasts: [...s.toasts, { id, msg: `${pk.source}: ${parts.join(', ')}` }, ...mkToasts(stackMsgs)],
    };
  }),

  // ── Reorder peek (Arc A, 2026-07-22): "put them back in any order" ───────────
  resolvePeekOrder: (order) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pk = s.game.pendingPeek;
    if (!pk || !pk.reorder) return s;
    if (s.conn.mode !== 'solo' && pk.lp !== s.localPlayer) return s; // owner-gated
    const n = pk.cards.length;
    if (order.length !== n || new Set(order).size !== n || order.some(i => !Number.isInteger(i) || i < 0 || i >= n)) return s; // must be a permutation
    const side = pk.deckSide;
    const ps = s.game[side];
    const below = ps.deck.slice(n);
    let g: GameState = { ...s.game, pendingPeek: null, [side]: { ...ps, deck: [...order.map(i => pk.cards[i]), ...below] } };
    // Same resumption chain as resolvePeek: a paused trigger stack first, then any
    // queued start-of-turn peeks.
    let local: Partial<GameStoreState> = {};
    const stackMsgs: string[] = [];
    if (g.triggerStack?.length) {
      const r = runStack(g, s);
      g = r.game; local = r.local; stackMsgs.push(...r.toastMsgs);
    }
    if (!g.pendingPeek) {
      const { peek, rest } = nextPeek(g, g.pendingPeekQueue);
      g = { ...g, pendingPeek: peek, pendingPeekQueue: rest };
    }
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { ...local, game: armNextItemTransfer(g),
      toasts: [...s.toasts, { id, msg: `${pk.source}: ${n} card${n !== 1 ? 's' : ''} put back in the chosen order` }, ...mkToasts(stackMsgs)] };
  }),

  cancelPeek: () => set(s => {
    const pk = s.game.pendingPeek;
    if (!pk) return s;
    // Only the scry's owner may cancel it — the global Escape handler on the OTHER
    // client used to remotely wipe the opponent's peek mid-decision. (Sandbox
    // controls both seats, so it may always cancel.)
    if (s.conn.mode !== 'solo' && pk.lp !== s.localPlayer) return s;
    // Cancelling declines the decision (the looked-at card stays where it was) but a
    // paused trigger stack still resumes — the played companion must still ENTER.
    let g: GameState = { ...s.game, pendingPeek: null };
    let local: Partial<GameStoreState> = {};
    const stackMsgs: string[] = [];
    if (g.triggerStack?.length) {
      const r = runStack(g, s);
      g = r.game; local = r.local; stackMsgs.push(...r.toastMsgs);
    }
    if (!g.pendingPeek) {
      const { peek, rest } = nextPeek(g, g.pendingPeekQueue);
      g = { ...g, pendingPeek: peek, pendingPeekQueue: rest };
    }
    return { ...local, game: armNextItemTransfer(g), toasts: [...s.toasts, ...mkToasts(stackMsgs)] };
  }),

  // ── Dead-Zone recovery (Library of Memory) ────────────────────────────────
  resolveDeadPick: (idx) => set(s => {
    if (gameIsOver(s.game)) return s;
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
      const ru = resumeEnterUnits(armNextItemTransfer({ ...s.game, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest }), s);
      return { ...ru.local, game: ru.game, toasts: [...s.toasts, ...mkToasts(ru.msgs)] };
    }
    const taken: GameState = { ...s.game, [dp.lp]: { ...ps, dead: ps.dead.filter((_, i) => i !== liveIdx), hand: [...ps.hand, card] } };
    let g = taken;
    const msgs: string[] = [];
    if (dp.attachTo) {
      // Scavenger: the recovered item attaches to the wearer instead of going to hand.
      // The card routes THROUGH the hand so equipOnto's hand-removal applies. If the
      // wearer left the board or lost capacity since the prompt armed, skip the pick
      // like a stale option (the item stays in the Dead Zone).
      const wearer = findEntityAnywhere(s.game, dp.attachTo.id);
      const { isWeapon, isHeavy } = itemProfileOf(card);
      if (!wearer || !canHoldItem(wearer.ent, isWeapon, isHeavy)) {
        const [next, ...rest] = s.game.pendingDeadPickQueue;
        const ru = resumeEnterUnits(armNextItemTransfer({ ...s.game, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest }), s);
        return { ...ru.local, game: ru.game, toasts: [...s.toasts, ...mkToasts(ru.msgs)] };
      }
      g = equipOnto(taken, dp.lp, dp.attachTo.id, card);
      msgs.push(`Returned ${card.name} from the Dead Zone — attached to ${wearer.ent.name}`);
    } else {
      msgs.push(`Returned ${card.name} from the Dead Zone to hand`);
    }
    // Run "if you do" effects (e.g. exhaust the source construct) now a card was taken.
    if (dp.postEffects.length) { const r = resolveActionEffects(g, dp.lp, dp.source, dp.postEffects, undefined, dp.sourceId); g = r.game; msgs.push(...r.msgs); }
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    // Advance to the next queued prompt, if any (e.g. a Cleave that killed two bearers).
    const [next, ...rest] = s.game.pendingDeadPickQueue;
    // Arc G: a resolved pick may have been pausing the multi-pending enter window.
    const ru = resumeEnterUnits(armNextItemTransfer({ ...g, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest }), s);
    return { ...ru.local, game: ru.game, toasts: [...s.toasts, { id, msg: `${dp.source}: ${msgs.join(' | ')}` }, ...mkToasts(ru.msgs)] };
  }),

  cancelDeadPick: () => set(s => {
    const dp = s.game.pendingDeadPick;
    if (!dp) return s;
    // Owner-only, like cancelPeek — an Escape on the other client must not wipe the
    // opponent's recovery pick. (The owner keeps the escape-hatch cancel.)
    if (s.conn.mode !== 'solo' && dp.lp !== s.localPlayer) return s;
    const [next, ...rest] = s.game.pendingDeadPickQueue;
    // Arc G: declining an OPTIONAL pick must not eat the units queued beneath it —
    // the enter window resumes exactly as it does after a taken pick.
    const ru = resumeEnterUnits(armNextItemTransfer({ ...s.game, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest }), s);
    return { ...ru.local, game: ru.game, toasts: [...s.toasts, ...mkToasts(ru.msgs)] };
  }),

  // ── Equip from hand (Veteran of the Ashgrove on-enter) ────────────────────
  resolveEquipPick: (handCardId) => set(s => {
    if (gameIsOver(s.game)) return s;
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

  // ── Start-of-turn modal choice (Pyre of the Unbound) ───────────────────────────
  resolveModalChoice: (idx) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pm = s.game.pendingModalChoice;
    if (!pm) return s;
    if (s.conn.mode !== 'solo' && pm.lp !== s.localPlayer) return s; // owner-only
    const option = pm.options[idx];
    if (!option) return s;
    const toast = (msg: string) => {
      const tid = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== tid) })), 4000);
      return { id: tid, msg };
    };

    // RULED 2026-07-08 (universal pre-cost refusal): a mode that would affect nothing
    // cannot be chosen — the prompt stays up so another mode (or Decline) can be picked.
    const spec = actionTargetSpec(option.effects);
    if (spec && filterEligibleByEffects(s.game, eligibleTargets(s.game, pm.lp, spec).filter(t => t !== pm.sourceId), option.effects).length === 0) {
      return { toasts: [...s.toasts, toast(`${pm.sourceName}: that mode has no legal target.`)] };
    }
    if (!spec && !effectsWouldAffectSomething(s.game, pm.lp, option.effects, pm.sourceId)) {
      return { toasts: [...s.toasts, toast(`${pm.sourceName}: that mode would affect nothing right now.`)] };
    }

    let g: GameState = { ...s.game, pendingModalChoice: null };
    const msgs: string[] = [];
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    // Pay the clause cost now (choosing a mode commits the "you may").
    if (pm.cost === 'sacrificeSelf') {
      const d = destroyEntity(g, pm.sourceId, deadSink, armorSink, 'sacrifice'); // sacrifice = death (fires triggers + on-sacrifice listeners)
      g = d.game;
      msgs.push(`${pm.sourceName} is sacrificed`, ...d.msgs);
    }
    const [nextModal, ...restModals] = g.pendingModalChoiceQueue;
    g = { ...g, pendingModalChoice: nextModal ?? null, pendingModalChoiceQueue: restModals };

    if (spec) {
      const eligibleIds = filterEligibleByEffects(g, eligibleTargets(g, pm.lp, spec).filter(t => t !== pm.sourceId), option.effects);
      if (eligibleIds.length) {
        const id2 = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id2) })), 4000);
        return {
          game: armPrompts(g, deadSink, armorSink),
          pendingActionTarget: { source: 'ability', sourceName: pm.sourceName, lp: pm.lp, effects: option.effects, eligibleIds, sourceId: undefined },
          toasts: [...s.toasts, { id: id2, msg: msgs.join(' | ') || `${pm.sourceName}: choose a target` }],
        };
      }
      // Vanishing edge: paying the cost removed the last target.
      return { game: armPrompts(g, deadSink, armorSink), toasts: [...s.toasts, toast(`${pm.sourceName} — no legal target left after paying the cost.`)] };
    }
    const r = resolveActionEffects(g, pm.lp, pm.sourceName, option.effects, undefined, undefined, undefined, deadSink, armorSink);
    msgs.push(...r.msgs);
    return { game: recomputeStatics(armPrompts(r.game, deadSink, armorSink)),
      toasts: [...s.toasts, toast(`${pm.sourceName}: ${msgs.join(' | ')}`)] };
  }),

  declineModalChoice: () => set(s => {
    if (gameIsOver(s.game)) return s;
    const pm = s.game.pendingModalChoice;
    if (!pm || !pm.optional) return s; // only "you may" clauses can be declined
    if (s.conn.mode !== 'solo' && pm.lp !== s.localPlayer) return s;
    const [next, ...rest] = s.game.pendingModalChoiceQueue;
    return { game: armNextItemTransfer({ ...s.game, pendingModalChoice: next ?? null, pendingModalChoiceQueue: rest }) };
  }),

  // ── Item Transfer on Character Exit (rules §Items; ruled 2026-07-08: all exits) ──
  resolveItemTransfer: (targetCharId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const it = s.game.pendingItemTransfer;
    if (!it || !it.items.length) return s;
    // Owner-only (sandbox controls both seats): the departing character's controller chooses.
    if (s.conn.mode !== 'solo' && it.lp !== s.localPlayer) return s;
    const head = it.items[0];
    if (!itemTransferCandidates(s.game, it, head.id).includes(targetCharId)) return s;
    const target = findEntityAnywhere(s.game, targetCharId);
    const card = s.game[it.lp].dead.find(c => c.id === head.id);
    if (!target || !card) return s; // claimed/removed since arming — stale click
    const deadIdx = s.game[it.lp].dead.indexOf(card);
    let g: GameState = { ...s.game, pendingItemTransfer: null,
      [it.lp]: { ...s.game[it.lp], dead: s.game[it.lp].dead.filter((_, i) => i !== deadIdx) } };
    g = equipOnto(g, it.lp, targetCharId, card);
    // Exhausting is the COST — the rescuer's actions are untouched, but it cannot
    // attack or activate until it readies. tapped:'major' so the card renders rotated.
    g = updateEntity(g, targetCharId, { exhausted: true, tapped: 'major' });
    // Remaining items continue the SAME event (front of the queue keeps usedIds);
    // armNextItemTransfer re-filters against the shrunken rescuer pool.
    const rest: PendingItemTransfer = { ...it, items: it.items.slice(1), usedIds: [...it.usedIds, targetCharId] };
    if (rest.items.length) g = { ...g, pendingItemTransferQueue: [rest, ...g.pendingItemTransferQueue] };
    g = armNextItemTransfer(g);
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { game: recomputeStatics(g),
      toasts: [...s.toasts, { id, msg: `Item Transfer: ${target.ent.name} exhausts to take up ${card.name}` }] };
  }),

  declineItemTransfer: () => set(s => {
    if (gameIsOver(s.game)) return s;
    const it = s.game.pendingItemTransfer;
    if (!it || !it.items.length) return s;
    if (s.conn.mode !== 'solo' && it.lp !== s.localPlayer) return s;
    // The declined item is already in the Dead Zone — just advance.
    const rest: PendingItemTransfer = { ...it, items: it.items.slice(1) };
    let g: GameState = { ...s.game, pendingItemTransfer: null };
    if (rest.items.length) g = { ...g, pendingItemTransferQueue: [rest, ...g.pendingItemTransferQueue] };
    return { game: armNextItemTransfer(g) };
  }),

  // ── Class Zone exchange ─────────────────────────────────────────────────────
  czToHand: (czCardId) => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer); // hold gate, see advancePhase
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    // Reducer-level CZ-phase gate: the exchange happens in the CZ phase, once per turn
    // (the panel enforced this in the UI only — czExchangeUsed was set but never checked).
    if (s.game.currentPhase !== 'cz' || s.game.czExchangeUsed) return s;
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
    const heldBy = reactiveHold(s.game, s.localPlayer); // hold gate, see advancePhase
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    if (s.game.currentPhase !== 'cz' || s.game.czExchangeUsed) return s; // reducer-level gate (see czToHand)
    const lp = s.localPlayer;
    const ps = s.game[lp];
    if (ps.classZone.length >= 5) return s;     // CZ at max
    const card = ps.hand.find(c => c.id === handCardId);
    if (!card) return s;
    const newCzCard = { id: uid('cz'), cls: card.class1 || 'Classless', name: card.name, faceDown: false, cardData: card };
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
      pendingPeek: null, pendingPeekQueue: [], pendingDeadPick: null, pendingDeadPickQueue: [], pendingPoison: null, pendingCoercion: null, pendingArmor: null, pendingAttackChoice: null,
      pendingDiscard: undefined, pendingDiscardQueue: undefined, pendingHandReveal: undefined,
      // A pending forced sacrifice rides the trigger stack, which a save never
      // resumes mid-window — drop it with the rest of the transient prompts.
      pendingForcedSacrifice: undefined,
      pendingCombatPick: undefined,
      // A dropped Haunt queue/pick is safe to clear: the counter was never placed,
      // so a reloaded game simply proceeds without the owed return (transient-prompt
      // policy, same as the forced sacrifice above).
      pendingHauntQueue: undefined,
      pendingHauntReturn: undefined,
      // A dropped reversion pick is safe: the stolenFrom marker persists, so the
      // next endTurn simply re-arms it.
      pendingReversion: undefined,
      // Transfer windows are safe to drop: the items already sit in the Dead Zone.
      // Modal choices too: the cost is unpaid until resolved, so nothing is lost.
      pendingItemTransfer: null, pendingItemTransferQueue: [],
      pendingModalChoice: null, pendingModalChoiceQueue: [],
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
  beginMove: (charId) => set(s => {
    if (gameIsOver(s.game)) return s;
    if (notActionPhase(s.game)) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg: 'Not in the Action Phase — resolve the Class Zone Exchange (or Skip) first.' }] };
    }
    return { pending: { action: 'move', charId } };
  }),

  resolveMove: (targetSlot) => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game) || notActionPhase(s.game)) return s;
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

    // Standing movement restrictions LAST — "cannot" beats "can" (R1/R2, owner
    // 2026-07-15): an opposing aura may bar movement between the lines. Checked at
    // the moment the move would begin; lateral within-line steps are never "between".
    const moveRestricted = moveRestrictedBy(game, src.ent, src.player, src.slot, targetSlot);
    if (moveRestricted) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { pending: null, toasts: [...s.toasts, { id, msg: `${src.ent.name} cannot move between lines — ${moveRestricted} (opposing aura).` }] };
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

    const moved: GameState = { ...game, ...activationPatch(game, pending.charId), [src.player]: { ...game[src.player], board } };

    // Pit Trap window (R4, owner 2026-07-12): "moves INTO the front line" = arriving
    // in the front line from outside it — movement only (direct entry onto the front
    // line does not trip it; a lateral front→front step never LEAVES the line, so it
    // doesn't either). Companions only; the trigger is MANDATORY — it fires even if
    // the mover is already exhausted (the exhaust no-ops, the trap still sacrifices
    // itself). The Hit & Run bonus move is still a move — it trips traps too.
    if (ent.kind === 'companion' && !isFront(src.slot) && isFront(targetSlot)) {
      const reactive = gatherReactive(moved, 'oppCompanionMovesToFront', { id: ent.id, name: ent.name, controller: src.player });
      if (reactive.length > 1) {
        // >1 simultaneous trigger — their CONTROLLER (the trap side, not the mover)
        // orders them (Rules Note 2026-07-22).
        return { pending: null, game: { ...moved, pendingTriggerOrder: { lp: batchOrderer(reactive), items: reactive, picked: [] } } };
      }
      if (reactive.length === 1) {
        const r = runStack(pushStack(moved, reactive), s);
        return { pending: null, ...r.local, game: r.game, toasts: [...s.toasts, ...mkToasts(r.toastMsgs)] };
      }
    }

    return { pending: null, game: moved };
  }),

  // ── Attack ─────────────────────────────────────────────────────────────────
  beginAttack: (charId) => set(s => {
    // FLAGGED CLOSURE (live MP pass 2026-07-21): arming was previously NOT hold-gated —
    // a held player could open the target picker whose resolveAttack was guaranteed to
    // refuse (a dead prompt, the 2026-07-20 no-dead-prompt class). Refuse loudly at arm.
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    const attLoc = findEntityAnywhere(s.game, charId);
    if (!attLoc) return s;
    const ent = attLoc.ent;

    const toast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg }] };
    };

    if (notActionPhase(s.game)) return { ...toast('Not in the Action Phase — resolve the Class Zone Exchange (or Skip) first.') };

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

    // Attack eligibility: must be in Front Line unless Ranged — or covered by a
    // Watchtower-style aura (back-line COMPANIONS may attack as if Ranged).
    // SHARED gate (canAttackFromPosition, 2026-07-20): the UI's Attack button and
    // the board highlight computation consult the same helper by construction.
    if (!canAttackFromPosition(s.game, ent, attLoc.player, attLoc.slot)) {
      return { ...toast('Must be in the Front Line to attack (no Ranged).') };
    }

    // Standing restrictions — "cannot" beats "can" (R1, owner 2026-07-15): an
    // opposing restriction aura overrides Ranged and Watchtower coverage alike.
    const restricted = attackRestrictedBy(s.game, ent, attLoc.player, attLoc.slot);
    if (restricted) {
      return { ...toast(`${ent.name} cannot attack — ${restricted}.`) };
    }

    // No dead prompts (2026-07-20): if opposing characters exist but the targeting
    // rules leave NOTHING legal (e.g. every legal line is warded), refuse loudly
    // now instead of arming a highlight-less picker. (An opponent with no
    // characters at all — sandbox/test rigs only — keeps the old pass-through.)
    const oppHasChars = Object.values(s.game[attLoc.player === 'p1' ? 'p2' : 'p1'].board)
      .some(e => e && e.kind !== 'construct');
    if (oppHasChars && legalAttackTargetIds(s.game, ent, attLoc.player).size === 0) {
      return { ...toast(`No legal attack target for ${ent.name} right now — every attackable character is protected.`) };
    }

    return { pending: { action: 'attack', charId } };
  }),

  resolveAttack: (targetEntityId) => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game) || notActionPhase(s.game)) return s;
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

    // Declaration-time restriction check (R2, owner 2026-07-15): this is the moment
    // the attack is DECLARED, so the gate runs here too — beginAttack already refused
    // in normal flow; this covers a board that changed while the targeting UI was up.
    const restricted = attackRestrictedBy(game, attacker, attLoc.player, attLoc.slot);
    if (restricted) {
      return { pending: null, toasts: [...s.toasts, pushToast(`${attacker.name} cannot attack — ${restricted}.`)] };
    }

    // ── Targeting rules — the SHARED gate (engine/stats.ts) computes legality;
    //    the UI highlights exactly legalAttackTargetIds, built from the same
    //    primitives consulted here, so prompt and reducer cannot disagree
    //    (bugfix 2026-07-20; ab8a5b0 single-gate discipline). ──────────────────
    // 0. Constructs are not attack targets — canon (GRU §Targeting Rules,
    //    verbatim): "Constructs cannot be attacked and do not satisfy or
    //    interfere with Front Line priority." ADJACENT HOLE CLOSED (flagged,
    //    2026-07-20): this branch previously SKIPPED the targeting rules for
    //    construct targets and fell through to commitAttack — the UI never
    //    offered one, but a direct call would have attacked it.
    if (target.kind === 'construct') {
      const t = pushToast('Constructs cannot be attacked — attacks target characters.');
      return { pending: null, toasts: [...s.toasts, t] };
    }
    {
      // 1. Guardian — canon (Master_Keyword_List, quoted verbatim): "While this
      //    character is ready (not exhausted) and a legal target, opponents must
      //    attack it before any other character." Guardian applies WITHIN the
      //    legal set (bugfix 2026-07-15).
      const binding = bindingGuardianIds(game, attacker, attLoc.player);
      if (binding.length > 0 && !binding.includes(targetEntityId)) {
        const t = pushToast('A Guardian must be attacked first!');
        return { pending: null, toasts: [...s.toasts, t] };
      }

      // 2. Front-Line-priority legality for the chosen target (corrected rule
      //    2026-07-16: front slot, empty front line, or attacker Evasive — the
      //    defender's keywords play no role in its targetability).
      if (!isLegalAttackTarget(game, attacker, attLoc.player, targetEntityId)) {
        const t = pushToast('Must target the Front Line first (attacker has no Evasive).');
        return { pending: null, toasts: [...s.toasts, t] };
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

    // (The Final Word rides the DECLARATION WINDOW as a reactive trigger since the
    // owner's rewording 2026-08-11 — see the declaration gather; the same-session
    // Arc H pay-to-break gate that sat here was removed with it.)

    // Optional on-attack ability (Mara): pause to ask the attacker whether to pay HP
    // for +damage. Decided BEFORE the attack resolves (the bonus rides the attack).
    const opt = optionalAttackAbility(attacker, game, attLoc.player);
    if (opt) {
      return { pending: null, game: { ...game, pendingAttackChoice: {
        lp: attLoc.player, charId: pending.charId, targetId: targetEntityId,
        sourceName: opt.sourceName, payHP: opt.payHP, bonus: opt.bonus } } };
    }

    const r = commitAttack(s, game, pending.charId, targetEntityId, 0);
    return { pending: null, ...r.local, game: r.game, toasts: [...s.toasts, ...mkToasts(r.toastMsgs)] };
  }),

  // ── Forced sacrifice (owner rewording 2026-08-11, The Final Word): the demanded
  // sacrifice resolves while the trigger stack is PAUSED on it; the declared
  // attack sits beneath and resumes after — fizzling at the damage step if the
  // attacker itself was the sacrifice (the Glass Cannon precedent, R2). MANDATORY:
  // there is no decline path; an invalid pick leaves the prompt armed. ──────────
  resolveForcedSacrifice: (entityId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pfs = s.game.pendingForcedSacrifice;
    if (!pfs) return s;
    if (s.conn.mode !== 'solo' && pfs.lp !== s.localPlayer) return s; // payer-only
    const loc = findEntityAnywhere(s.game, entityId);
    // Only the payer's own permanents qualify, never the PC (the 2026-07-24
    // canBeSacrificed chokepoint). The attacking companion itself IS legal — the
    // owner's literal "a permanent" (2026-08-11).
    if (!loc || loc.player !== pfs.lp || !canBeSacrificed(loc.ent)) return s;
    const mkToast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
      return { id, msg };
    };
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    // A REAL sacrifice event: death triggers + on-sacrifice listeners fully
    // resolve before the stack (and the attack beneath) resumes.
    const d = destroyEntity({ ...s.game, pendingForcedSacrifice: undefined }, entityId, deadSink, armorSink, 'sacrifice');
    let g = recomputeStatics(armPrompts(d.game, deadSink, armorSink));
    const msgs = [`${pfs.sourceName}: ${loc.ent.name} is sacrificed`, ...d.msgs];
    // Resume the paused declaration window (the resolveDiscard pattern): the
    // remaining entries — another copy's demand, the attacker's own onAttack
    // clauses, the damage step — run now.
    let local: Partial<GameStoreState> = {};
    const stackMsgs: string[] = [];
    if (!g.pendingForcedSacrifice && g.triggerStack?.length) {
      const r = runStack(g, s);
      g = r.game; local = r.local; stackMsgs.push(...r.toastMsgs);
    }
    return { ...local, game: g,
      toasts: [...s.toasts, mkToast(msgs.join(' | ')), ...mkToasts(stackMsgs)] };
  }),

  // ── HAUNT returns (Requiem Arc C, 2026-08-25) ─────────────────────────────────
  // The death fully happened (destroyEntity / the flee exit queued the owed return);
  // armHaunt advances the queue once every prompt from the death has drained. The
  // return is an ENTER: the entity is rebuilt from the dead card (fresh acts, the
  // willpower gate, armor counters re-placed) PLUS exhausted and ONE Memory counter —
  // the counter IS the per-stint tracker (a body that dies carrying one stays dead) —
  // and the 'enter' stack entry fires the full entry machinery: the Lich's Entomb 2
  // re-fires, opposing enter-traps hear it; Paranoia does NOT (a return is not a play).
  armHaunt: () => set(s => {
    const g0 = s.game;
    if (gameIsOver(g0)) return s;
    const q = g0.pendingHauntQueue ?? [];
    if (!q.length || g0.pendingHauntReturn) return s;
    // "The death fully happens FIRST": every window a death can open must drain.
    if (g0.pendingItemTransfer || g0.pendingItemTransferQueue.length || g0.pendingPoison
      || g0.pendingArmor || g0.pendingPreventOrder || g0.pendingDeadPick || g0.pendingCoercion
      || g0.pendingDiscard || g0.pendingHandReveal || g0.pendingPeek || g0.pendingTriggerOrder
      || g0.pendingForcedSacrifice || g0.pendingCombatPick || g0.pendingModalChoice
      || g0.triggerStack?.length) return s;
    const [head, ...rest] = q;
    if (s.conn.mode !== 'solo' && head.lp !== s.localPlayer) return s; // owner's client advances
    const restPatch = rest.length ? { pendingHauntQueue: rest } : { pendingHauntQueue: undefined };
    const mkToast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 5000);
      return { id, msg };
    };
    // The card must still be in the owner's Dead Zone — an outside recursion may have
    // taken it first (their claim wins; the owed return simply evaporates).
    const card = g0[head.lp].dead.find(c => c.id === head.cardId);
    if (!card) return { game: { ...g0, ...restPatch } };
    const empty = [...BACK_SLOTS, ...FRONT_SLOTS].filter(sl => !g0[head.lp].board[sl]);
    if (empty.length === 0) {
      // Full board: the return does not happen and NO Memory counter is placed —
      // Haunt retained for a later death (the 2026-08-25 counter-rework ruling).
      return { game: { ...g0, ...restPatch },
        toasts: [...s.toasts, mkToast(`${head.cardName} finds no room to return — it stays in the Dead Zone (its Haunt is not spent).`)] };
    }
    if (empty.length > 1) {
      return { game: { ...g0, ...restPatch, pendingHauntReturn: { ...head, eligibleSlots: empty } },
        toasts: [...s.toasts, mkToast(`${head.cardName} haunts — choose an empty slot for its return.`)] };
    }
    const r = performHauntReturn({ ...g0, ...restPatch }, head, empty[0] as SlotId, s);
    return { ...r.local, game: r.game, toasts: [...s.toasts, ...mkToasts(r.msgs)] };
  }),

  resolveHauntSlot: (slot) => set(s => {
    if (gameIsOver(s.game)) return s;
    const ph = s.game.pendingHauntReturn;
    if (!ph) return s;
    if (s.conn.mode !== 'solo' && ph.lp !== s.localPlayer) return s; // owner-only
    if (!ph.eligibleSlots.includes(slot)) return s; // must be one of the offered slots
    const r = performHauntReturn({ ...s.game, pendingHauntReturn: undefined }, ph, slot, s);
    return { ...r.local, game: r.game, toasts: [...s.toasts, ...mkToasts(r.msgs)] };
  }),

  // ── Combat-trigger target pick (Requiem Arc B, 2026-08-25 — Satyr of the Reel) ──
  // The resolveForcedSacrifice discipline exactly: picker-only, the clause resolves
  // with the chosen target, then the paused stack (the attack's damage step beneath)
  // resumes in the same reducer.
  resolveCombatPick: (targetId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pcp = s.game.pendingCombatPick;
    if (!pcp) return s;
    if (s.conn.mode !== 'solo' && pcp.lp !== s.localPlayer) return s; // picker-only
    if (!pcp.eligibleIds.includes(targetId)) return s; // re-check: only an offered target
    const loc = findEntityAnywhere(s.game, targetId);
    if (!loc) return s; // target vanished while the prompt was up — pick another (or none left: see below)
    const mkToast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
      return { id, msg };
    };
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    const r = resolveActionEffects({ ...s.game, pendingCombatPick: undefined }, pcp.lp,
      pcp.source, pcp.effects, targetId, pcp.sourceId, undefined, deadSink, armorSink);
    let g = recomputeStatics(armPrompts(r.game, deadSink, armorSink));
    // Resume the paused declaration window: the damage step beneath runs now.
    let local: Partial<GameStoreState> = {};
    const stackMsgs: string[] = [];
    if (!g.pendingCombatPick && g.triggerStack?.length) {
      const rs = runStack(g, s);
      g = rs.game; local = rs.local; stackMsgs.push(...rs.toastMsgs);
    }
    return { ...local, game: g,
      toasts: [...s.toasts, mkToast(`${pcp.source}: ${r.msgs.join(' | ')}`), ...mkToasts(stackMsgs)] };
  }),

  // ── Optional pre-attack ability (Mara): pay HP for +damage, or decline ─────────
  resolveAttackChoice: (accept) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pac = s.game.pendingAttackChoice;
    if (!pac) return s;
    let game: GameState = { ...s.game, pendingAttackChoice: null };
    const prefix: string[] = [];
    if (accept) {
      game = payPcHp(game, pac.lp, pac.payHP);
      prefix.push(`${pac.sourceName}: pays ${pac.payHP} HP for +${pac.bonus}`);
    }
    const r = commitAttack(s, game, pac.charId, pac.targetId, accept ? pac.bonus : 0);
    return { ...r.local, game: r.game, toasts: [...s.toasts, ...mkToasts([...prefix, ...r.toastMsgs])] };
  }),

  // ── Armor choice (mid-combat): the defender picks which piece absorbs the hit ──
  resolveArmor: (pieceId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pa = s.game.pendingArmor;
    if (!pa) return s;
    const chosen = pa.candidates.find(c => c.id === pieceId);
    if (!chosen) return s; // must pick a real candidate
    const mkToast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { id, msg };
    };

    // Non-combat deferred choice: apply the counter, then arm the next queued one
    // (then any deferred prevention ordering held back behind the armor prompts).
    if (!pa.ctx) {
      const r = removeArmorCounter(s.game, pa.entityId, pieceId);
      const next = armNextArmorChoice(r.game, pa.queue ?? []);
      let g: GameState = { ...next.game, pendingArmor: next.pendingArmor };
      if (!g.pendingArmor && g.preventOrderQueue?.length) {
        const p = armNextPreventOrder(g);
        g = { ...p.game, pendingPreventOrder: p.pendingPreventOrder };
      }
      return { game: armNextItemTransfer(g), toasts: [...s.toasts, mkToast(r.msgs.join(' | '))] };
    }

    // Combat: resume the paused attack on a cloned ctx (the stored one is synced state).
    const ctx: AttackCtx = { ...pa.ctx, hitQueue: [...pa.ctx.hitQueue], msgs: [...pa.ctx.msgs], events: [...pa.ctx.events], deadSink: [...pa.ctx.deadSink], armorSink: [...pa.ctx.armorSink] };
    let g: GameState = { ...s.game, pendingArmor: null };
    g = applyCombatHit(g, ctx, chosen.id); // resolve the paused hit with the chosen piece
    const res = driveAttack(g, ctx);
    if (!res.done) {
      return { game: { ...res.game, pendingArmor: res.pendingArmor ?? null, pendingPreventOrder: res.pendingPreventOrder } };
    }
    return { game: finalizeAttack(res.game, res.ctx), toasts: [...s.toasts, mkToast(res.ctx.msgs.join(' | '))] };
  }),

  // ── Prevention ordering (R3, owner 2026-07-14) ─────────────────────────────
  resolvePreventOrder: (idx) => set(s => {
    if (gameIsOver(s.game)) return s;
    const po = s.game.pendingPreventOrder;
    if (!po) return s;
    if (s.conn.mode !== 'solo' && po.chooser !== s.localPlayer) return s; // the affected character's controller orders; others hold
    if (idx < 0 || idx >= po.items.length || po.picked.includes(idx)) return s;
    const picked = [...po.picked, idx];
    if (picked.length < po.items.length - 1) {
      return { game: { ...s.game, pendingPreventOrder: { ...po, picked } } };
    }
    // Order complete (the last unpicked item is implied — the blind-pick pattern).
    const lastIdx = po.items.findIndex((_, i) => !picked.includes(i));
    const order = [...picked, lastIdx].map(i => po.items[i]);
    const mkToast = (msg: string) => {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { id, msg };
    };

    // Deferred non-combat ordering: the HP outcome landed at damage time (it is
    // order-independent) — the chosen order decides only the armor-counter
    // consequences. Then arm the next queued ordering / held-back item transfers.
    if (!po.ctx) {
      const w = applyPreventionOrder(s.game, po.entityId, po.dmg, order);
      const p = armNextPreventOrder({ ...w.game, pendingPreventOrder: undefined });
      const g: GameState = { ...p.game, pendingPreventOrder: p.pendingPreventOrder };
      const msgs = [...w.msgs, ...p.msgs];
      return { game: armNextItemTransfer(g), toasts: msgs.length ? [...s.toasts, mkToast(msgs.join(' | '))] : s.toasts };
    }

    // Combat: resume the paused attack on a cloned ctx, replaying the head hit with
    // the chosen prevention order (the resolveArmor resume pattern).
    const ctx: AttackCtx = { ...po.ctx, hitQueue: [...po.ctx.hitQueue], msgs: [...po.ctx.msgs], events: [...po.ctx.events], deadSink: [...po.ctx.deadSink], armorSink: [...po.ctx.armorSink] };
    let g: GameState = { ...s.game, pendingPreventOrder: undefined };
    g = applyCombatHit(g, ctx, undefined, order);
    const res = driveAttack(g, ctx);
    if (!res.done) {
      return { game: { ...res.game, pendingArmor: res.pendingArmor ?? null, pendingPreventOrder: res.pendingPreventOrder } };
    }
    return { game: finalizeAttack(res.game, res.ctx), toasts: [...s.toasts, mkToast(res.ctx.msgs.join(' | '))] };
  }),

  // ── Cancel ─────────────────────────────────────────────────────────────────
  cancelPending: () => set({ pending: null }),

  // ── Play card ──────────────────────────────────────────────────────────────
  beginPlay: (cardId) => set(s => {
    // FLAGGED CLOSURE (live MP pass 2026-07-21): same dead-prompt closure as
    // beginAttack — placeCard is hold-gated, so arming while held must refuse too.
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    if (notActionPhase(s.game)) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg: 'Not in the Action Phase — resolve the Class Zone Exchange (or Skip) first.' }] };
    }
    // Special Action plays (Companion/Construct placement) belong to the PC's
    // atomic activation (Rules Note 2026-07-15): refuse arming once the PC is
    // sealed — the same gate placeCard re-checks authoritatively.
    const armCard = s.game[s.localPlayer].hand.find(c => c.id === cardId);
    if (armCard && (armCard.type === 'Companion' || armCard.type === 'Construct')) {
      const sp = specialActionActor(s.game, s.localPlayer);
      if (sp.reason) {
        const id = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
        return { toasts: [...s.toasts, { id, msg: `Can't play ${armCard.name}: ${sp.reason} — Special Actions are part of the PC's activation.` }] };
      }
    }
    // Capture the selected character as the activating actor before clearing the
    // selection (Action cards charge this character's action economy).
    return {
      pendingPlay: s.pendingPlay?.cardId === cardId ? null : { cardId, actorId: s.game.selected },
      pending: null,
      game: { ...s.game, selected: null },
    };
  }),

  cancelPlay: () => set({ pendingPlay: null }),

  // ── On-enter trigger targeting (Reinforce / Dismantle) ─────────────────────
  resolveTrigger: (targetId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pt = s.pendingTrigger;
    if (!pt || !pt.eligibleIds.includes(targetId)) return s;
    const loc = findEntityAnywhere(s.game, targetId);
    if (!loc) return { pendingTrigger: null };

    const cur = loc.ent.anchors ?? 0;
    let game = s.game;
    let msg: string;
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    if (pt.kind === 'reinforce') {
      const next = cur + pt.n;
      game = updateEntity(game, targetId, { anchors: next });
      msg = `${pt.sourceName} reinforces ${loc.ent.name}: ${cur} → ${next} anchors.`;
    } else {
      const next = Math.max(0, cur - pt.n);
      if (next <= 0) {
        const d = destroyEntity(game, targetId, deadSink, armorSink, 'sacrifice'); // sacrifice = death (fires triggers + on-sacrifice listeners)
        game = d.game;
        msg = [`${pt.sourceName} dismantles ${loc.ent.name} — no anchors left, sacrificed!`, ...d.msgs].join(' | ');
      } else {
        game = updateEntity(game, targetId, { anchors: next });
        msg = `${pt.sourceName} dismantles ${loc.ent.name}: ${cur} → ${next} anchors.`;
      }
    }
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
    return { pendingTrigger: null, game: recomputeStatics(armPrompts(game, deadSink, armorSink)), toasts: [...s.toasts, { id, msg }] };
  }),

  cancelTrigger: () => set({ pendingTrigger: null }),

  // ── Kit-Master: move an item from one of your characters to another ─────────
  resolveKit: (targetId) => set(s => {
    if (gameIsOver(s.game)) return s;
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
    if (gameIsOver(s.game)) return s;
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
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game) || notActionPhase(s.game)) return s;
    const { pendingPlay, game, localPlayer } = s;
    if (!pendingPlay) return s;

    const lp = localPlayer;
    const card = game[lp].hand.find(c => c.id === pendingPlay.cardId);
    if (!card) return s;

    // Special Actions are part of the PC's ATOMIC ACTIVATION (Rules Note
    // 2026-07-15, closes the escape: PC plays → companions act → PC plays MORE).
    // The PC is the acting character: refuse when its activation is sealed, and on
    // success the activation patch below registers it (sealing any companion that
    // was mid-activation — the standard character-switch rule). Within the PC's own
    // activation Specials interleave freely with its Move/Minor/Major (ruling).
    const sp = specialActionActor(game, lp);
    if (sp.reason) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { pendingPlay: null, toasts: [...s.toasts, { id, msg: `Can't play ${card.name}: ${sp.reason} — Special Actions are part of the PC's activation.` }] };
    }

    // Willpower requirement: must have Willpower ≥ the card's Level to play it.
    const wp = currentWillpower(game[lp]);
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

    // ── TRIBUTE: the play-time additional cost (Arc E, 2026-08-23) ─────────────
    // SITED HERE ON PURPOSE. Every legality check above has passed — hold, phase, the
    // PC's atomic activation, Willpower ≥ level, a face-up Class Zone card, and
    // Back-Line-only — and the destination slot is already chosen and validated. That
    // is the whole of "all legality before any payment": nothing below can refuse the
    // play for an unrelated reason after a Beast has died for it.
    //
    // UNPAYABLE = UNPLAYABLE (locked ruling). With no payable permanent the play is
    // REFUSED: the card stays in hand, the Class Zone is unspent, nothing is
    // sacrificed, no partial state. This is the pre-cost refusal precedent, which
    // governs COSTS — deliberately NOT the targeted-Action fizzle (retired as a reading
    // for Actions on 2026-08-21); the two precedents must not be crossed.
    const tribute = card.type === 'Companion' ? tributeOf(card.name) : undefined;
    if (tribute) {
      const payable = tributePayable(game, lp, tribute.sacrificeSubtype);
      // SLOT-AS-PICK (owner ruling 2026-08-23, "the offering makes room"): the caster
      // may click a Back-Line slot HELD by a payable Beast. That click both proves the
      // slot will be free and chooses the payment, so the principle above survives a
      // full Back Line intact. Clicking an empty slot offers every payable Beast.
      const occupant = game[lp].board[slot];
      const inSlot = occupant ? payable.find(x => x.id === occupant.id) : undefined;
      if (occupant && !inSlot) {
        const id = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
        return { pendingPlay: null, toasts: [...s.toasts, { id,
          msg: `${slot.toUpperCase()} is occupied by ${occupant.name} — choose an empty slot, or one held by a ${tribute.sacrificeSubtype} you can offer.` }] };
      }
      const options = inSlot ? [inSlot] : payable;
      if (!options.length) {
        const id = ++toastId;
        setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
        return { pendingPlay: null, toasts: [...s.toasts, { id,
          msg: `Can't play ${card.name}: TRIBUTE demands a ${tribute.sacrificeSubtype} to sacrifice and you control none — the cost is unpayable, so the play is refused.` }] };
      }
      // Suspend between legality and payment. ALWAYS prompt, even at one option: this
      // is forcedSacrifice's VOLUNTARY twin, so the prompt carries the decline that the
      // forced version has no room for. Nothing has been spent yet — cancelling costs
      // the caster nothing.
      return { pendingPlay: null, pendingTribute: {
        cardId: card.id, slot, lp, sourceName: card.name,
        sacrificeSubtype: tribute.sacrificeSubtype,
        actorId: pendingPlay.actorId, pcId: sp.pcId, options } };
    }

    return commitPlay(s, game, lp, card, slot, czIdx, sp.pcId);
  }),

  // ── TRIBUTE payment (Arc E, 2026-08-23) ────────────────────────────────────
  // The chosen permanent is sacrificed, and ONLY THEN does the Angel enter — no
  // interleaving (ordering pin): on-sacrifice listeners fire, removal triggers fire,
  // the card lands in its OWNER's Dead Zone, and an Oathsworn Beast returns its sworn
  // card to hand, all before the entering companion is even pushed onto the stack.
  // destroyEntity resolves those inline, so the payment is complete when it returns.
  resolveTribute: (entityId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pt = s.pendingTribute;
    if (!pt) return s;
    if (!pt.options.some(o => o.id === entityId)) return s; // invalid pick — prompt stays armed
    const card = s.game[pt.lp].hand.find(c => c.id === pt.cardId);
    if (!card) return { pendingTribute: null };             // card left hand somehow
    const loc = findEntityAnywhere(s.game, entityId);
    if (!loc) return s;

    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    const d = destroyEntity(s.game, entityId, deadSink, armorSink, 'sacrifice');
    const paid = recomputeStatics(armPrompts(d.game, deadSink, armorSink));

    // Re-read the Class Zone from the POST-payment state: a sacrifice cannot touch it,
    // but reading it here keeps commitPlay's contract honest (it spends what it finds).
    const czIdx = paid[pt.lp].classZone.findIndex(c => !c.faceDown);
    if (czIdx === -1) return { pendingTribute: null }; // unreachable: checked pre-payment

    const payMsg = `${pt.sourceName}: ${loc.ent.name} is sacrificed to pay TRIBUTE`;
    const out = commitPlay({ ...s, pendingTribute: null }, paid, pt.lp, card, pt.slot, czIdx, pt.pcId);
    return { ...out, pendingTribute: null,
      toasts: [...(out.toasts ?? s.toasts), ...mkToasts([payMsg, ...d.msgs])] };
  }),

  // Declining a voluntary cost abandons the play. Nothing was spent — the card never
  // left hand and the Class Zone was never touched — so this is a plain clear.
  cancelTribute: () => set({ pendingTribute: null }),

  // ── Action bookkeeping ─────────────────────────────────────────────────────
  markAction: (entityId, type) => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game) || notActionPhase(s.game)) return s;
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
    const heldBy = reactiveHold(s.game, s.localPlayer); // hold gate, see advancePhase
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    // Playtest helper: also lift the activation lock for this character.
    const finishedActors = s.game.finishedActors.filter(x => x !== entityId);
    const currentActor = s.game.currentActor === entityId ? null : s.game.currentActor;
    return { game: { ...updateEntity(s.game, entityId, { acts: freshActs(), tapped: 'none', exhausted: false }), finishedActors, currentActor } };
  }),

  // ── Poison check resolution (ready phase) ──────────────────────────────────
  resolvePoison: (player, outcomes) => set(s => {
    if (gameIsOver(s.game)) return s;
    let g = s.game;
    let dmg = 0;
    for (const o of outcomes) {
      const loc = findEntityAnywhere(g, o.id);
      if (!loc || loc.player !== player) continue;
      if (o.cleansed) {
        // Skip-refresh gate (Arc H 2026-08-04, Whispered Accusation): the cleanse
        // ALWAYS clears counters+status (Poison canon governs the cleanse), but the
        // ready half is part of "readying at the start of its controller's turn" —
        // a live 'doesNotReady' modifier holds it, exactly as it held the ready
        // step. The Poison check runs on the controller's own turn, so the armed
        // window is live here (`g` supplied for the dormancy gate).
        const skip = hasModifier(loc.ent, 'doesNotReady', g);
        g = updateEntity(g, o.id, { poison: 0, statuses: loc.ent.statuses.filter(st => st !== POISONED_STATUS),
          ...(skip ? {} : { exhausted: false, tapped: 'none' as TapState }) });
      } else {
        dmg += loc.ent.poison ?? 0; // failed check: the unit keeps its counters and stays exhausted
      }
    }
    if (dmg > 0) {
      const pcId = pcIdOf(g, player);
      const pcLoc = pcId ? findEntityAnywhere(g, pcId) : null;
      if (pcLoc) g = setPcHp(g, player, pcLoc.ent.id, Math.max(0, pcLoc.ent.hp - dmg));
    }
    // Poison resolved — Item Transfer windows may now arm (Rules Note 2026-07-08:
    // the Poison check resolves BEFORE any transfer window).
    return { game: armNextItemTransfer({ ...g, pendingPoison: null }) };
  }),

  // ── Forced discard (Arc A, 2026-07-22): the VICTIM's choice, Coercion's pattern ──
  resolveDiscard: (cardId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const pd = s.game.pendingDiscard;
    if (!pd) return s;
    // Only the discarding player resolves it (multiplayer); sandbox controls both seats.
    if (s.conn.mode !== 'solo' && pd.victim !== s.localPlayer) return s;
    const ps = s.game[pd.victim];
    const card = ps.hand.find(c => c.id === cardId);
    if (!card) return s; // not a hand card — prompt stays armed (Coercion's idiom)
    let g: GameState = { ...s.game,
      [pd.victim]: { ...ps, hand: ps.hand.filter(c => c.id !== cardId), dead: [...ps.dead, card] } };
    // Advance the queue, skipping entries whose victim ran out of cards meanwhile.
    const rest = [...(g.pendingDiscardQueue ?? [])];
    let next: PendingDiscard | undefined;
    while (rest.length) {
      const cand = rest.shift()!;
      if (g[cand.victim].hand.length > 0) { next = cand; break; }
    }
    g = { ...g, pendingDiscard: next, pendingDiscardQueue: rest.length ? rest : undefined };
    // A paused trigger stack resumes once every queued discard is settled (a trap's
    // discard pauses before the entering companion's own ownEnter — Arc A).
    let local: Partial<GameStoreState> = {};
    const stackMsgs: string[] = [];
    if (!g.pendingDiscard && g.triggerStack?.length) {
      const r = runStack(g, s);
      g = r.game; local = r.local; stackMsgs.push(...r.toastMsgs);
    }
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { ...local, game: armNextItemTransfer(g),
      toasts: [...s.toasts, { id, msg: `${pd.source}: ${card.name} discarded` }, ...mkToasts(stackMsgs)] };
  }),

  // ── Hand reveal (Arc A, 2026-07-22): the LOOKER's window ────────────────────
  resolveHandReveal: (cardId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const hr = s.game.pendingHandReveal;
    if (!hr) return s;
    // Only the looker resolves it (multiplayer); sandbox controls both seats.
    if (s.conn.mode !== 'solo' && hr.lp !== s.localPlayer) return s;
    let g: GameState = { ...s.game, pendingHandReveal: undefined };
    let msg = `${hr.source}: done looking`;
    if (hr.pick === 'toBottomDraw' && cardId) {
      const vs = g[hr.handSide];
      const card = vs.hand.find(c => c.id === cardId);
      if (!card) return s; // not a hand card — prompt stays armed
      // Canon-literal (Mark the Pockets): the chosen card goes to the BOTTOM of its
      // owner's deck, then that player draws a card (with an empty deck they draw
      // the bottomed card right back — the text offers no exception).
      const bottomed = { ...vs, hand: vs.hand.filter(c => c.id !== cardId), deck: [...vs.deck, card] };
      const drawn = bottomed.deck[0];
      g = { ...g, [hr.handSide]: { ...bottomed, deck: bottomed.deck.slice(1), hand: [...bottomed.hand, drawn] } };
      msg = `${hr.source}: ${card.name} put on the bottom of ${vs.name}'s deck — they draw a card`;
    }
    // Arc G: the reveal may have been pausing the multi-pending enter window.
    const ru = resumeEnterUnits(armNextItemTransfer(g), s);
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { ...ru.local, game: ru.game, toasts: [...s.toasts, { id, msg }, ...mkToasts(ru.msgs)] };
  }),

  // ── Coercion resolution (the VICTIM's choice: discard or sacrifice) ────────
  resolveCoercionDiscard: (cardId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const co = s.game.pendingCoercion;
    if (!co) return s;
    if (s.conn.mode !== 'solo' && co.victim !== s.localPlayer) return s; // victim-only
    const ps = s.game[co.victim];
    const card = ps.hand.find(c => c.id === cardId);
    if (!card) return s;
    let g: GameState = { ...s.game, pendingCoercion: null,
      [co.victim]: { ...ps, hand: ps.hand.filter(c => c.id !== cardId), dead: [...ps.dead, card] } };
    const chainMsgs: string[] = [];
    ({ game: g } = chainForcedChoice(g, co, chainMsgs)); // Arc F: a symmetric effect arms the other player next
    const ru = resumeEnterUnits(g, s); // Arc G: the coercion may have been pausing the enter window
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { ...ru.local, game: ru.game, toasts: [...s.toasts,
      { id, msg: `${co.source}: ${card.name} discarded${co.generic ? '' : ' (Coercion)'}` }, ...mkToasts([...chainMsgs, ...ru.msgs])] };
  }),

  resolveCoercionSacrifice: (entityId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const co = s.game.pendingCoercion;
    if (!co) return s;
    if (s.conn.mode !== 'solo' && co.victim !== s.localPlayer) return s; // victim-only
    const loc = findEntityAnywhere(s.game, entityId);
    // Only the victim's own permanents qualify, and never the PC (a forced game
    // loss is not a cost).
    if (!loc || loc.player !== co.victim || !canBeSacrificed(loc.ent)) return s; // PC never legal — the 2026-07-24 chokepoint
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    // Sacrifice IS a death (ruled 2026-07-08) — destroyEntity fires the triggers.
    const d = destroyEntity({ ...s.game, pendingCoercion: null }, entityId, deadSink, armorSink, 'sacrifice');
    let g = recomputeStatics(armPrompts(d.game, deadSink, armorSink));
    const msgs = [`${loc.ent.name} is sacrificed${co.generic ? '' : ' (Coercion)'}`, ...d.msgs];
    // Arc F: chain AFTER the destruction fully resolved — the next player's halves
    // read the post-event state (per-event evaluation, 2026-07-21).
    const chainMsgs: string[] = [];
    ({ game: g } = chainForcedChoice(g, co, chainMsgs));
    const ru = resumeEnterUnits(g, s); // Arc G: the coercion may have been pausing the enter window
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { ...ru.local, game: ru.game,
      toasts: [...s.toasts, { id, msg: `${co.source}: ${msgs.join(' | ')}` }, ...mkToasts([...chainMsgs, ...ru.msgs])] };
  }),

  // ── HP nudge ──────────────────────────────────────────────────────────────
  adjustHp: (entityId, delta) => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer); // hold gate, see advancePhase
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
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

  // ── Control-theft reversion slot pick (Arc I 2026-08-11, ruling 6) ─────────
  resolveReversionSlot: (slot) => {
    let placed = false;
    set(s => {
      const pr = s.game.pendingReversion;
      if (!pr) return s;
      if (s.conn.mode !== 'solo' && pr.lp !== s.localPlayer) return s; // owner-only
      if (s.game[pr.lp].board[slot]) return s; // must be an open slot (any line — ruling 6)
      const loc = findEntityAnywhere(s.game, pr.entId);
      if (!loc || !loc.ent.stolenFrom) {
        // Stale (the companion left the board since the prompt armed) — clear and
        // let the re-invoked endTurn proceed.
        placed = true;
        return { game: { ...s.game, pendingReversion: undefined } };
      }
      // Same shedding as the auto path: the until-endOfTurn buffs (the Zealous
      // grant) die WITH the control — one clock (ruling 5).
      const { stolenFrom: _home, ...rest } = loc.ent;
      const homed: BoardEntity = { ...rest, buffs: loc.ent.buffs?.filter(b => b.until !== 'endOfTurn') };
      const fromBoard = { ...s.game[loc.player].board };
      delete fromBoard[loc.slot];
      let g: GameState = { ...s.game, pendingReversion: undefined,
        [loc.player]: { ...s.game[loc.player], board: fromBoard } };
      g = recomputeStatics({ ...g, [pr.lp]: { ...g[pr.lp], board: { ...g[pr.lp].board, [slot]: homed } } });
      placed = true;
      const tid = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== tid) })), 4000);
      return { game: g, toasts: [...s.toasts, { id: tid, msg: `${pr.sourceName} returns to its owner's control (${slot.toUpperCase()}).` }] };
    });
    // The turn was PAUSED on this pick — finish it now. The re-invocation processes
    // any remaining stolen companions, then runs the real end-of-turn sequence
    // (reversion completes BEFORE the next player's ready phase — the Arc I finding).
    if (placed) get().endTurn();
  },

  // ── Turn end / ready phase ────────────────────────────────────────────────
  endTurn: () => set(s => {
    const heldBy = reactiveHold(s.game, s.localPlayer);
    if (heldBy) return heldRefusal(s, heldBy);
    if (gameIsOver(s.game)) return s;
    // Unresolved triggers hold the turn: the stack must drain (and any simultaneous-
    // trigger ordering pick must resolve) before the turn can pass (R1, 2026-07-12).
    // Likewise an open prevention ordering / deferred prevention queue (R3, 2026-07-14).
    if (s.game.triggerStack?.length || s.game.pendingTriggerOrder) return s;
    if (s.game.pendingPreventOrder || s.game.preventOrderQueue?.length) return s;
    // An owed forced sacrifice holds the turn (new field only, so shipped behavior
    // is untouched; the non-empty stack beneath it blocks endTurn anyway —
    // defensive double-lock).
    if (s.game.pendingForcedSacrifice) return s;
    // Likewise an open combat-trigger target pick (Requiem Arc B — same double-lock).
    if (s.game.pendingCombatPick) return s;
    // An armed Haunt slot pick holds the turn; a QUEUED (not yet armed) return does
    // not — armHaunt advances it whenever its windows drain, either side of the flip.
    if (s.game.pendingHauntReturn) return s;
    if (s.game.pendingReversion) return s; // a reversion pick is out — the turn waits for it

    // ── Control-theft reversion (Arc I 2026-08-11) — the FIRST substantive step of
    // ending the turn: "until end of turn" expires NOW, and the companion must be
    // home BEFORE runReadyPhase below (which readies the NEXT player's side and
    // runs their flee/decay checks while activePlayer is still the caster — the
    // Arc I timing finding; a late reversion would miss its owner's entire ready).
    // Zero open slots → sacrificed to the OWNER's Dead Zone (the flee OUTCOME,
    // never the flee trigger — ruling 6); exactly one → auto-placed (no choice
    // content); more → the OWNER picks ANY slot, Front or Back (ruling 6, the
    // ratified general rule) — pendingReversion pauses the turn and
    // resolveReversionSlot re-invokes endTurn. Same-boundary buffs (until
    // 'endOfTurn' — the Zealous grant) strip WITH the reversion: one clock
    // (ruling 5), even though this pass runs before the buffBoundary below.
    let gRev = s.game;
    const revMsgs: string[] = [];
    {
      const revDead: PendingDeadPick[] = [];
      const revArmor: ArmorChoiceData[] = [];
      for (const side of ['p1', 'p2'] as const) {
        for (const [slot, ent] of Object.entries(gRev[side].board) as [SlotId, BoardEntity | undefined][]) {
          if (!ent?.stolenFrom) continue;
          const owner = ent.stolenFrom;
          const open = [...FRONT_SLOTS, ...BACK_SLOTS].filter(sl => !gRev[owner].board[sl]);
          if (open.length > 1) {
            const tid = ++toastId;
            setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== tid) })), 4000);
            return { game: { ...gRev, pendingReversion: { lp: owner, entId: ent.id, sourceName: ent.name } },
              toasts: [...s.toasts, { id: tid, msg: `${ent.name} returns to its owner — they choose the slot (any line).` }] };
          }
          if (open.length === 0) {
            const d = destroyEntity(gRev, ent.id, revDead, revArmor, 'sacrifice'); // owner-routed via stolenFrom (ruling 4)
            gRev = d.game;
            revMsgs.push(`${ent.name} has nowhere to return — it is sacrificed to its owner's Dead Zone.`, ...d.msgs);
            continue;
          }
          const { stolenFrom: _home, ...rest } = ent;
          const homed: BoardEntity = { ...rest, buffs: ent.buffs?.filter(b => b.until !== 'endOfTurn') };
          const fromBoard = { ...gRev[side].board };
          delete fromBoard[slot];
          gRev = { ...gRev, [side]: { ...gRev[side], board: fromBoard } };
          gRev = { ...gRev, [owner]: { ...gRev[owner], board: { ...gRev[owner].board, [open[0]]: homed } } };
          revMsgs.push(`${ent.name} returns to its owner's control.`);
        }
      }
      if (revMsgs.length) gRev = recomputeStatics(armPrompts(gRev, revDead, revArmor));
    }
    const g = gRev;
    const nextPlayer: 'p1' | 'p2' = g.activePlayer === 'p1' ? 'p2' : 'p1';
    const nextTurn = nextPlayer === 'p1' ? g.turn + 1 : g.turn;

    const whose = nextPlayer === s.localPlayer ? 'Your' : "Opponent's";

    // Buff boundary pass (expiry precedes the new turn's start-of-turn triggers —
    // ruled order; debuffs never affect flee/Poison, and the "until the start of
    // your next turn" entries must be GONE before any start-of-turn evaluation).
    // One pass over BOTH boards (Arc B: timed entries can sit on either side):
    //  - until 'endOfTurn' on the ENDING player's entities (shipped, byte-identical:
    //    a stripped entity keeps its buffs array, possibly empty);
    //  - until {turnEnd of: acted} — unless still pendingUntilTurnOf (an own-turn
    //    cast of a "controller's next turn" window survives its cast turn's end);
    //  - until {turnStart of: next} — caster-anchored debuffs die as the caster's
    //    turn begins;
    //  - pendingUntilTurnOf === next — the window ARMS (dormant → live; the key is
    //    dropped so the entry hashes like any live entry).
    const acted = g.activePlayer;
    const buffBoundary = (side: 'p1' | 'p2', board: Board): Board => {
      const out: Board = {};
      for (const [slot, ent] of Object.entries(board) as [SlotId, BoardEntity | undefined][]) {
        if (!ent) continue;
        const affected = ent.buffs?.some(b =>
          (b.until === 'endOfTurn' && side === acted)
          || (b.until !== 'endOfTurn' && b.until.at === 'turnEnd' && b.until.of === acted && !b.pendingUntilTurnOf)
          || (b.until !== 'endOfTurn' && b.until.at === 'turnStart' && b.until.of === nextPlayer)
          || b.pendingUntilTurnOf === nextPlayer);
        if (!affected) { out[slot] = ent; continue; }
        const kept = ent.buffs!
          .filter(b => b.until === 'endOfTurn' ? side !== acted
            : b.until.at === 'turnEnd' ? (b.until.of !== acted || !!b.pendingUntilTurnOf)
            : b.until.of !== nextPlayer)
          .map(b => {
            if (b.pendingUntilTurnOf !== nextPlayer) return b;
            const { pendingUntilTurnOf: _armed, ...live } = b;
            return live;
          });
        out[slot] = { ...ent, buffs: kept };
      }
      return out;
    };
    const expired: GameState = { ...g,
      [acted]: { ...g[acted], board: buffBoundary(acted, g[acted].board) },
      [nextPlayer]: { ...g[nextPlayer], board: buffBoundary(nextPlayer, g[nextPlayer].board) },
    };

    // The whole Ready Phase in the ruled order (engine/readyPhase.ts — extracted
    // 2026-07-20, debt #2 closed): readyAndFlip → LAST GASP start-of-turn triggers
    // → decay/flee removals → arc-5 on-sacrifice listeners. Then the turn draw
    // (Ready precedes Draw — arc-5 pin), statics, and prompt arming below.
    const ready = runReadyPhase(expired, nextPlayer, whose);
    const workGame = ready.game;
    const sot = ready;
    const readyNotices = ready.notices;
    const readyTransfers = ready.transfers;
    const readiedPost = workGame[nextPlayer];
    // Draw a card for the next player (with deck-out check)
    let drawnDeck = readiedPost.deck;
    let drawnHand = readiedPost.hand;
    let drawToast = '';
    let deckOutLoser = false;
    if (drawnDeck.length > 0) {
      const drawn = drawnDeck[0];
      drawnHand = [...readiedPost.hand, drawn];
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
    const nextPlayerState = { ...readiedPost, deck: drawnDeck, hand: drawnHand };

    const winnerOnDeckOut: 'p1' | 'p2' | null = deckOutLoser
      ? (nextPlayer === 'p1' ? 'p2' : 'p1')
      : null;

    let newGame: GameState = recomputeStatics({
      ...workGame,
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

    const drawId = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== drawId) })), 4000);
    // Event order in the toasts mirrors the ruling: triggers first, then removals.
    // Reversion notices lead (they happened FIRST — before the ready phase).
    const sotToasts = [...revMsgs, ...sot.sotMsgs, ...readyNotices].map(msg => {
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
    // Item Transfer windows (fled companions + any queued exits) arm LAST among the
    // turn-start prompts: armNextItemTransfer holds itself back while the Poison check
    // or a peek/dead-pick/armor prompt is up (Rules Note 2026-07-08 — Poison first).
    const [firstModal, ...modalChoiceQueue] = sot.modals;
    return {
      pending: null, pendingPlay: null,
      game: armNextItemTransfer({ ...newGame,
        pendingPeek: firstPeek, pendingPeekQueue: peekQueue,
        pendingDeadPick: firstDeadPick ?? null, pendingDeadPickQueue: deadPickQueue,
        pendingArmor: armorRes.pendingArmor,
        pendingPoison,
        // Start-of-turn modal choices (Pyre) — the ModalChoiceHost render-gates behind
        // the Poison/peek/dead-pick prompts so the dialogs never stack.
        pendingModalChoice: firstModal ?? null,
        pendingModalChoiceQueue: modalChoiceQueue,
        pendingItemTransferQueue: [...newGame.pendingItemTransferQueue, ...readyTransfers] }),
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
  })),
  {
    name: 'twilight-game',
    partialize: (s) => ({ savedGame: s.savedGame }),
  }
  ))
);
