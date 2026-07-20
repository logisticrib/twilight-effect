import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { recordActions } from './recordMiddleware';
import type { BoardEntity, Card, TapState } from '../types/card';
import type { Effect } from '../types/effects';
import { CATALOG, SORCERER_WARRIOR_CARDS, WIZARD_BUILDER_CARDS } from '../data/catalog';
import { recomputeStatics, isImmuneToSplash, HIT_RUN_STATUS,
         isPhysicalConstruct, parseEnterTrigger, type EnterTriggerKind,
         isCharacter, firstItemOf, allItemsOf, canHoldItem, effectiveAttack, effectiveKeywords, effectiveMaxHp, wardedLines,
         canPlayActionCard, specialActionActor, minorActionReason, actionTypeOf, currentWillpower, parseBanes,
         POISONED_STATUS, parseAnimateMagic, hasBackLineAttackAura,
         attackRestrictedBy, moveRestrictedBy,
         canAttackFromPosition, isLegalAttackTarget, bindingGuardianIds, legalAttackTargetIds } from './keywords';

// Everything relocated to the headless engine stays importable from this module —
// external import sites don't churn during the extraction (see src/engine/index.ts).
export * from '../engine';
import { ADJ, FRONT_SLOTS, BACK_SLOTS, isFront, findSlot, type SlotId, type Board,
         type Phase, type PlayerState, type GameState,
         type PendingCoercion, type PendingDeadPick,
         type AttackCtx, type ArmorChoiceData,
         type PendingItemTransfer, type StackEntry,
         gatherParanoia, gatherReactive, gatherOwnPlay, pushStack, setStack, resolveReactiveEntry,
         orderedForStack, resolveCombatTriggers, combatTriggerEffects,
         findEntityAnywhere, updateEntity, removeEntity, deadCardsOf,
         itemTransferOf, itemProfileOf, itemTransferCandidates, armNextItemTransfer,
         setPcHp, payPcHp, pcIdOf, charsOf,
         ownPhysicalConstructIds,
         eligibleTargets, effectsWouldAffectSomething, actionTargetSpec, twoStepKind,
         permanentEffects, gatherActivated, abilityUsedTag, magicCtx,
         destroyEntity, fireSacrificeTriggers, applyDamage, applyCombatHit, driveAttack, optionalAttackAbility,
         attackDamageBonus, resolveActionEffects, armPrompts, armNextArmorChoice,
         applyArmorCounter, applyPreventionOrder, armNextPreventOrder,
         freshActs, uid, computeWillpower, makeNewGame, nextPeek, buildPeek, resolveStartOfTurn,
         controlsPreventAnchorDecay, equipOnto, kitDests } from '../engine';

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
  pending: null, pendingPlay: null, pendingTrigger: null, pendingKit: null,
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
function commitAttack(s: StackRunCtx, game: GameState, charId: string, targetEntityId: string, bonusDmg: number):
  { game: GameState; local: Partial<GameStoreState>; toastMsgs: string[] } {
  const attLoc = findEntityAnywhere(game, charId);
  const tgtLoc = findEntityAnywhere(game, targetEntityId);
  if (!attLoc || !tgtLoc) return { game, local: {}, toastMsgs: [] };
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
  // attacker's own onAttack clauses queue FIRST, traps above them (the ruled queue
  // order, 2026-07-12) — so the traps resolve first, the attacker's clauses after.
  const declReactive = attacker.kind === 'companion' && tgtLoc.ent.kind === 'companion'
    ? gatherReactive(newGame, 'oppCompanionAttacksCompanion', { id: charId, name: attacker.name, controller: attLoc.player })
    : [];
  const hasOwnAttack = combatTriggerEffects(attacker, 'onAttack').length > 0;

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
    // >1 simultaneous reactive trigger — the ACTIVE player orders them (canon:
    // Rules_Taxonomy Tier 5 #9 / Tier 3 #18; reconfirmed by the owner 2026-07-12
    // over the in-session trap-controller suggestion).
    g = { ...g, pendingTriggerOrder: { lp: g.activePlayer, items: declReactive, picked: [] } };
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
export function reactiveHold(game: GameState, localPlayer: 'p1' | 'p2'): string | null {
  const dp = game.pendingDeadPick;
  if (dp && dp.lp !== localPlayer) return dp.source;
  // A Coercion prompt is the VICTIM's decision — the player who played the coercer
  // (and anyone else) waits for it.
  const co = game.pendingCoercion;
  if (co && co.victim !== localPlayer) return `${co.source} (Coercion)`;
  // An opponent-owned deck peek: normally their own-turn scry (holding the inactive
  // peer is harmless), but with Paranoia the ACTIVE player's companion play arms a
  // peek OWNED by the inactive controller — the placer must wait for the decision.
  const pk = game.pendingPeek;
  if (pk && pk.lp !== localPlayer) return `${pk.source} (deck peek)`;
  // A mid-combat Armor choice owned by the opponent (defender) holds the attacker
  // until it resolves, so the attacker's broadcasts don't clobber the resolution.
  const pa = game.pendingArmor;
  if (pa && pa.defender !== localPlayer) return `${pa.entityName}'s armor`;
  // The opponent's pre-attack pay-HP choice (Mara) — same clobber risk.
  const pac = game.pendingAttackChoice;
  if (pac && pac.lp !== localPlayer) return `${pac.sourceName} (attack choice)`;
  // The opponent's Item Transfer window (e.g. the defender rescuing a killed bearer's
  // items) — the active player waits so broadcasts don't clobber the resolution.
  const it = game.pendingItemTransfer;
  if (it && it.lp !== localPlayer) return `${it.sourceName}'s items (Item Transfer)`;
  // The opponent's simultaneous-trigger ordering pick (trigger stack, 2026-07-12) —
  // the ACTIVE player orders; everyone else waits.
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
    const canSacrifice = Object.values(g[opp].board).some(e => e && e.kind !== 'pc');
    if (canDiscard || canSacrifice) {
      pendingCoercion = { source: card.name, victim: opp };
      enterMsg = `${card.name}: Coercion — opponent must discard a card or sacrifice a permanent.`;
    } else {
      enterMsg = `${card.name} enters — the opponent has nothing to coerce.`;
    }
  }

  // Structured on-enter effects (the non-keyword "When this enters, …" text).
  // Only when no keyword trigger already claimed the enter (avoids double pending).
  const onEnter = (card.effects ?? []).filter(c => c.trigger === 'onEnter').flatMap(c => c.effects);
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
          game: { ...g, pendingPeek: { source: card.name, lp, deckSide: lp, cards, dests: enterPeek.dests, maxHand: enterPeek.maxHand } },
          local: { ...local, pendingTrigger: null, pendingKit: null },
          msg: `${card.name} enters — look at your deck.`,
        };
      }
    }
    const spec = actionTargetSpec(onEnter);
    if (spec) {
      const eligibleIds = eligibleTargets(g, lp, spec).filter(eid => eid !== entId);
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
 * Drive the trigger stack (GameState.triggerStack, top = last) until it drains or
 * PAUSES: on a Paranoia peek (the controller decides), on a simultaneous-trigger
 * ordering pick (the active player decides), on a mid-combat Armor choice, or on an
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
      const r = resolveReactiveEntry(g, top, deadSink, armorSink);
      g = r.game;
      toastMsgs.push(r.toast);
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
      const reactive = top.ent.kind === 'companion'
        ? gatherReactive(g, 'oppCompanionEnters', { id: top.ent.id, name: top.ent.name, controller: top.controller })
        : [];
      if (reactive.length > 1) {
        // >1 simultaneous trigger — the ACTIVE player (here: the entering player)
        // decides the order they go on the stack (Rules_Taxonomy Tier 5 #9 / Tier 3
        // #18; owner-reconfirmed 2026-07-12).
        g = { ...pushStack(g, batch), pendingTriggerOrder: { lp: g.activePlayer, items: reactive, picked: [] } };
        break; // PAUSE — resolveTriggerOrder resumes
      }
      g = pushStack(g, [...batch, ...reactive]);
      continue;
    }

    if (top.kind === 'ownAttack') {
      g = setStack(g, stack.slice(0, -1));
      // Declaration-window clauses resolve from the queued SNAPSHOT — they fire even
      // if the attacker died to a trap that resolved above them (R1).
      const ct = resolveCombatTriggers(g, top.attacker, top.side, [], armorSink, ['onAttack']);
      g = ct.game;
      if (ct.msgs.length) toastMsgs.push(ct.msgs.join(' | '));
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

    // top.kind === 'ownEnter': arms store-LOCAL prompts, so in multiplayer only the
    // controller's client may resolve it — everyone else leaves it on the stack
    // (reactiveHold covers them; the controller's client resumes via resumeStack).
    if (sCtx.conn.mode !== 'solo' && top.controller !== sCtx.localPlayer) break;
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
  drawCard: (player) => set(s => {
    if (gameIsOver(s.game)) return s;
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
    if (gameIsOver(s.game)) return s;
    const { currentPhase } = s.game;
    // Only advances draw→cz. CZ→action must go through completeCzPhase.
    const next: Phase = currentPhase === 'draw' ? 'cz' : currentPhase;
    return { game: { ...s.game, currentPhase: next } };
  }),

  /** CZ phase → Action phase. Called by CZExchangePanel after any valid choice (exchange or pass). */
  completeCzPhase: () => set(s => {
    if (gameIsOver(s.game)) return s;
    if (s.game.currentPhase !== 'cz') return s;
    return { game: { ...s.game, currentPhase: 'action' as Phase } };
  }),

  // Move active player to End Phase (they confirm before passing the turn)
  endTurnToEndPhase: () => set(s => {
    if (gameIsOver(s.game)) return s;
    return { game: { ...s.game, currentPhase: 'end' as Phase } };
  }),

  // ── Equip item ─────────────────────────────────────────────────────────────
  equipItem: (entityId, handCardId) => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
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
    if (reactiveHold(s.game, s.localPlayer)) return s;
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

    const onPlay = (card.effects ?? []).filter(c => c.trigger === 'onPlay').flatMap(c => c.effects);

    // Two-step action: pick one of your characters first (then a slot or an enemy).
    const ts = twoStepKind(onPlay);
    if (ts) {
      const eligibleIds = charsOf(g0, lp);
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

    // Deck-peek action: move to Dead Zone and open the scry modal.
    const peek = onPlay.find(e => e.op === 'deckPeek');
    if (peek && peek.op === 'deckPeek') {
      const cards = g0[lp].deck.slice(0, peek.look);
      const newHand = g0[lp].hand.filter(c => c.id !== handCardId);
      if (cards.length === 0) {
        return { game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] } }, pendingPlay: null, toasts: [...s.toasts, ...mkToasts(riderMsgs), mkToast(`${card.name} — deck is empty.`)] };
      }
      return {
        game: { ...g0, [lp]: { ...g0[lp], hand: newHand, dead: [...g0[lp].dead, card] },
          pendingPeek: { source: card.name, lp, deckSide: lp, cards, dests: peek.dests, maxHand: peek.maxHand } },
        pendingPlay: null,
        toasts: [...s.toasts, ...mkToasts(riderMsgs)],
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
    if (gameIsOver(s.game)) return s;
    const pa = s.pendingActionTarget;
    if (!pa || pa.twoStep !== 'reposition' || !pa.firstId || !pa.eligibleSlots?.includes(slot)) return s;
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
        finalGame = { ...finalGame, pendingTriggerOrder: { lp: finalGame.activePlayer, items: reactive, picked: [] } };
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
    if (spec && eligibleTargets(s.game, player, spec).filter(t => t !== entityId).length === 0) {
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
        look: peekEff.look, dests: peekEff.dests, maxHand: peekEff.maxHand, deck: peekEff.deck });
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
      const eligibleIds = eligibleTargets(g, player, spec).filter(t => t !== entityId);
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
    if (gameIsOver(s.game)) return s;
    const loc = findEntityAnywhere(s.game, entityId);
    if (!loc || loc.ent.kind === 'pc') return s; // never the PC (losing it ends the game)
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
    if (pa.source === 'action' && pa.card) {
      return {
        pendingActionTarget: null,
        game: { ...s.game, [pa.lp]: { ...s.game[pa.lp], hand: [...s.game[pa.lp].hand, pa.card] } },
      };
    }
    return { pendingActionTarget: null };
  }),

  // ── Simultaneous-trigger ordering (trigger stack, owner-ratified 2026-07-12) ──
  // Canon: the ACTIVE player decides the order simultaneous triggers go on the
  // stack (Rules_Taxonomy Tier 5 #9 / Tier 3 #18 — reconfirmed 2026-07-12: active
  // player, NOT the trap controller). Picks are BLIND: the order is decided at
  // queue time and nothing resolves between picks.
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
    const g = pushStack({ ...s.game, pendingTriggerOrder: undefined }, orderedForStack(po.items, picked));
    const r = runStack(g, s);
    return { ...r.local, game: r.game, toasts: [...s.toasts, ...mkToasts(r.toastMsgs)] };
  }),

  resumeStack: () => set(s => {
    if (gameIsOver(s.game)) return s;
    const stack = s.game.triggerStack;
    const top = stack?.[stack.length - 1];
    if (!top) return s;
    if (s.game.pendingTriggerOrder || s.game.pendingPeek || s.game.pendingArmor || s.game.pendingPreventOrder) return s; // paused on a prompt, not a hand-off
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
      return { game: armNextItemTransfer({ ...s.game, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest }) };
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
        return { game: armNextItemTransfer({ ...s.game, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest }) };
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
    return { game: armNextItemTransfer({ ...g, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest }), toasts: [...s.toasts, { id, msg: `${dp.source}: ${msgs.join(' | ')}` }] };
  }),

  cancelDeadPick: () => set(s => {
    const dp = s.game.pendingDeadPick;
    if (!dp) return s;
    // Owner-only, like cancelPeek — an Escape on the other client must not wipe the
    // opponent's recovery pick. (The owner keeps the escape-hatch cancel.)
    if (s.conn.mode !== 'solo' && dp.lp !== s.localPlayer) return s;
    const [next, ...rest] = s.game.pendingDeadPickQueue;
    return { game: armNextItemTransfer({ ...s.game, pendingDeadPick: next ?? null, pendingDeadPickQueue: rest }) };
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
    if (spec && eligibleTargets(s.game, pm.lp, spec).filter(t => t !== pm.sourceId).length === 0) {
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
      const eligibleIds = eligibleTargets(g, pm.lp, spec).filter(t => t !== pm.sourceId);
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
    if (reactiveHold(s.game, s.localPlayer)) return s;
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
        // >1 simultaneous trigger — the ACTIVE player (the mover) orders them.
        return { pending: null, game: { ...moved, pendingTriggerOrder: { lp: moved.activePlayer, items: reactive, picked: [] } } };
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
      return { ...toast(`${ent.name} cannot attack — ${restricted} (opposing aura).`) };
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
    if (reactiveHold(s.game, s.localPlayer)) return s;
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
      return { pending: null, toasts: [...s.toasts, pushToast(`${attacker.name} cannot attack — ${restricted} (opposing aura).`)] };
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
      const r = applyArmorCounter(s.game, pa.entityId, pieceId);
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
    if (reactiveHold(s.game, s.localPlayer)) return s;
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

    const newHand = game[lp].hand.filter(c => c.id !== pendingPlay.cardId);

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
      ...(sp.pcId ? activationPatch(game, sp.pcId) : {}),
      [lp]: { ...game[lp], hand: newHand, classZone: newCZ, willpower: newWillpower },
    };
    const paranoia = isCompanion ? gatherParanoia(paidGame, lp) : [];
    // On-play listeners (arc 4, owner 2026-07-15): "When you play a Magical
    // Construct…" — own-side listeners, from-hand plays ONLY (this reducer IS the
    // from-hand path; conversions/placements never emit a play event, R1). A
    // companion play can only queue Paranoia, a construct play only on-play
    // listeners — the two windows never coexist in one play.
    const onPlay = isConstruct && card.subtype === 'Incantation'
      ? gatherOwnPlay(paidGame, 'ownPlaysMagicalConstruct', { id: newEnt.id, name: card.name, controller: lp })
      : [];
    const playWindow = [...paranoia, ...onPlay];
    const g = pushStack(paidGame, [{ kind: 'enter', ent: newEnt, card, slot, controller: lp }]);
    if (playWindow.length > 1) {
      // >1 simultaneous play-window trigger — the ACTIVE player orders them.
      return { pendingPlay: null, pendingTrigger: null, pendingKit: null,
        game: { ...g, pendingTriggerOrder: { lp: g.activePlayer, items: playWindow, picked: [] } } };
    }
    const r = runStack(pushStack(g, playWindow), s);
    return {
      pendingPlay: null,
      pendingTrigger: null,
      pendingKit: null,
      ...r.local,
      game: r.game,
      toasts: [...s.toasts, ...mkToasts(r.toastMsgs)],
    };
  }),

  // ── Action bookkeeping ─────────────────────────────────────────────────────
  markAction: (entityId, type) => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
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
        g = updateEntity(g, o.id, { poison: 0, statuses: loc.ent.statuses.filter(st => st !== POISONED_STATUS), exhausted: false, tapped: 'none' as TapState });
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

  // ── Coercion resolution (the VICTIM's choice: discard or sacrifice) ────────
  resolveCoercionDiscard: (cardId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const co = s.game.pendingCoercion;
    if (!co) return s;
    if (s.conn.mode !== 'solo' && co.victim !== s.localPlayer) return s; // victim-only
    const ps = s.game[co.victim];
    const card = ps.hand.find(c => c.id === cardId);
    if (!card) return s;
    const g: GameState = { ...s.game, pendingCoercion: null,
      [co.victim]: { ...ps, hand: ps.hand.filter(c => c.id !== cardId), dead: [...ps.dead, card] } };
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { game: g, toasts: [...s.toasts, { id, msg: `${co.source}: ${card.name} discarded (Coercion)` }] };
  }),

  resolveCoercionSacrifice: (entityId) => set(s => {
    if (gameIsOver(s.game)) return s;
    const co = s.game.pendingCoercion;
    if (!co) return s;
    if (s.conn.mode !== 'solo' && co.victim !== s.localPlayer) return s; // victim-only
    const loc = findEntityAnywhere(s.game, entityId);
    // Only the victim's own permanents qualify, and never the PC (a forced game
    // loss is not a cost).
    if (!loc || loc.player !== co.victim || loc.ent.kind === 'pc') return s;
    const deadSink: PendingDeadPick[] = [];
    const armorSink: ArmorChoiceData[] = [];
    // Sacrifice IS a death (ruled 2026-07-08) — destroyEntity fires the triggers.
    const d = destroyEntity({ ...s.game, pendingCoercion: null }, entityId, deadSink, armorSink, 'sacrifice');
    const g = d.game;
    const msgs = [`${loc.ent.name} is sacrificed (Coercion)`, ...d.msgs];
    const id = ++toastId;
    setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 4000);
    return { game: recomputeStatics(armPrompts(g, deadSink, armorSink)),
      toasts: [...s.toasts, { id, msg: `${co.source}: ${msgs.join(' | ')}` }] };
  }),

  // ── HP nudge ──────────────────────────────────────────────────────────────
  adjustHp: (entityId, delta) => set(s => {
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

  // ── Turn end / ready phase ────────────────────────────────────────────────
  endTurn: () => set(s => {
    if (reactiveHold(s.game, s.localPlayer)) return s;
    if (gameIsOver(s.game)) return s;
    // Unresolved triggers hold the turn: the stack must drain (and any simultaneous-
    // trigger ordering pick must resolve) before the turn can pass (R1, 2026-07-12).
    // Likewise an open prevention ordering / deferred prevention queue (R3, 2026-07-14).
    if (s.game.triggerStack?.length || s.game.pendingTriggerOrder) return s;
    if (s.game.pendingPreventOrder || s.game.preventOrderQueue?.length) return s;
    const g = s.game;
    const nextPlayer: 'p1' | 'p2' = g.activePlayer === 'p1' ? 'p2' : 'p1';
    const nextTurn = nextPlayer === 'p1' ? g.turn + 1 : g.turn;

    // Cards leaving the board at ready phase used to vanish silently — surface each one.
    const readyNotices: string[] = [];
    const readyTransfers: PendingItemTransfer[] = [];
    const decayedSacs: BoardEntity[] = []; // decay = sacrifice (canon) -> on-sacrifice listeners (arc 5)
    const whose = nextPlayer === s.localPlayer ? 'Your' : "Opponent's";

    const readyPlayer = (ps: PlayerState): PlayerState => {
      // Flip CZ cards face-up → recalculate willpower
      const newCZ = ps.classZone.map(c => ({ ...c, faceDown: false }));
      const newWillpower = computeWillpower(newCZ);
      // Fleeing checks read THE current Willpower (Dismayed-adjusted), evaluated
      // against the just-recomputed base. Dismay pressure can cause fleeing — intended
      // (owner ruling 2026-07-04).
      const effWP = currentWillpower({ ...ps, willpower: newWillpower });
      // Master of Foundations: this player's Physical Constructs skip anchor decay.
      const noPhysicalDecay = controlsPreventAnchorDecay(ps);
      const newBoard: Board = {};
      // Entities that leave during ready (decayed constructs, fleeing companions) go to
      // the Dead Zone with their items; a tucked Oathsworn card returns to hand.
      const buried: Card[] = [];
      const returnedSworn: Card[] = [];
      const bury = (ent: BoardEntity) => {
        buried.push(...deadCardsOf(ent));
        if (ent.sworn) returnedSworn.push(ent.sworn);
        // A ready-phase exit (fleeing companion) opens an Item Transfer window for the
        // readied player. Constructs return null (they carry no items).
        const t = itemTransferOf(ent, nextPlayer);
        if (t) readyTransfers.push(t);
      };
      for (const [slot, ent] of Object.entries(ps.board)) {
        if (!ent) continue;
        // Anchor decay for constructs (also ready them: clear exhaust/tap + once-per-turn
        // markers, so "exhaust until your next turn" effects like Library of Memory expire).
        if (ent.kind === 'construct') {
          const skipDecay = noPhysicalDecay && isPhysicalConstruct(ent);
          const newAnchors = skipDecay ? (ent.anchors ?? 0) : (ent.anchors ?? 0) - 1;
          if (newAnchors <= 0) { // last anchor decayed — sacrificed
            bury(ent);
            decayedSacs.push(ent);
            readyNotices.push(`${whose} ${ent.name} crumbles — its last Anchor decayed.`);
            continue;
          }
          newBoard[slot as SlotId] = {
            ...ent, anchors: newAnchors, acts: freshActs(), tapped: 'none' as TapState, exhausted: false,
            fresh: false, // entry turn is over (2026-07-15 — see placeCard)
            statuses: ent.statuses.filter(st => !st.startsWith('ability-used:')),
          };
          continue;
        }
        // Companion fleeing: level > effective willpower
        if (ent.kind === 'companion' && ent.level > effWP) {
          bury(ent);
          readyNotices.push(`${whose} ${ent.name} flees — Level ${ent.level} exceeds Willpower ${effWP}.`);
          continue;
        }
        // Ready the entity (drop unused Hit & Run marker + once-per-turn ability markers).
        // A Poisoned character does NOT ready here — the start-of-turn Poison check
        // (PoisonModal → resolvePoison) decides whether it cleanses+readies or stays
        // exhausted, so its tap/exhaust state is left for that check to resolve.
        const poisoned = (ent.poison ?? 0) > 0;
        // Items ready alongside their controller's characters (Rules Note 2026-07-15).
        // Hash discipline: only items actually exhausted are touched — the exhausted
        // key is REMOVED (never written false), so exhaustion-free games keep their
        // exact loadout shape. (Poison holds the CHARACTER's readying, not the item's.)
        const lo = ent.loadout;
        const readyItem = (it: typeof lo extends undefined ? never : NonNullable<typeof lo>['weapon']) => {
          if (!it?.exhausted) return it;
          const { exhausted: _spent, ...rest } = it;
          return rest;
        };
        const readiedLoadout = lo && [lo.weapon, ...lo.gear].some(it => it?.exhausted)
          ? { weapon: readyItem(lo.weapon), gear: lo.gear.map(readyItem) }
          : lo;
        newBoard[slot as SlotId] = {
          ...ent, fresh: false, acts: freshActs(),
          tapped: poisoned ? ent.tapped : 'none' as TapState,
          exhausted: poisoned ? ent.exhausted : false,
          ...(readiedLoadout !== lo ? { loadout: readiedLoadout } : {}),
          statuses: ent.statuses.filter(st => st !== HIT_RUN_STATUS && !st.startsWith('ability-used:')),
        };
      }
      return { ...ps, classZone: newCZ, willpower: newWillpower, board: newBoard,
        dead: buried.length ? [...ps.dead, ...buried] : ps.dead,
        hand: returnedSworn.length ? [...ps.hand, ...returnedSworn] : ps.hand };
    };

    const readied = readyPlayer(g[nextPlayer]);
    // Ready-phase decay is a SACRIFICE (canon: "sacrifice when last removed") — fire
    // on-sacrifice listeners (arc 5, 2026-07-15) on the readied state, BEFORE the
    // turn draw (Ready precedes Draw). Listeners gather from the PRE-ready board:
    // the decayed construct's own listener fires (R3), and same-ready sacrifices
    // hear each other (simultaneous decay — engine reading, flagged to the owner).
    // NOTE: listener effects needing prompt sinks (dead-picks/armor) would need
    // sinks threaded here; the shipped listener (draw) needs none.
    let readiedGame: GameState = { ...g, [nextPlayer]: readied };
    if (decayedSacs.length) {
      const preBoard = g[nextPlayer].board;
      for (const dy of decayedSacs) {
        const st = fireSacrificeTriggers(readiedGame, dy, nextPlayer, preBoard);
        readiedGame = st.game;
        readyNotices.push(...st.msgs);
      }
    }
    const readiedPost = readiedGame[nextPlayer];
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
      ...readiedGame,
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
    const sotToasts = [...readyNotices, ...sot.msgs].map(msg => {
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
