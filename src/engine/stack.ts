// ─── The trigger stack (reactive-trigger arc, owner-ratified 2026-07-12) ────────
// Canon (docs/Card_Design_Parameters.md §13/§21, quoted verbatim):
//   "Use a stack - multiple triggers resolve in order (most recent first)"
//   "Resolve most recent first (last in, first out)"
//   "Your trigger can cause opponent's trigger, which resolves first"
//   ""May" choices made when trigger resolves (no holding)"
// This is an INTERNAL automatic trigger queue — LIFO resolution, no player priority
// windows. Nothing in the game allows casting in response; all reactions are
// automatic triggers. Player decisions (Paranoia's top/bottom, active-player
// ordering of simultaneous triggers, "may" choices) surface via the existing
// pending-prompt machinery when their trigger RESOLVES — not via priority.
//
// R1 (2026-07-12): playing a card puts it on the stack; it does not enter the
// encounter until the stack empties down to it. "Plays" and "enters" are distinct
// sequential events. Once queued, a trigger resolves even if its source or subject
// has since died.
//
// The stack itself lives in GameState (`triggerStack`, top = last element) so pauses
// (a Paranoia peek, a trigger-order prompt, a multiplayer hand-off) survive across
// reducers and sync over the wire. This module holds the headless primitives; the
// store's `runStack` drives resolution (it owns finalizeAttack + the on-enter
// machinery, which arm store-local prompts).
import type { Trigger } from '../types/effects';
import type { BoardEntity } from '../types/card';
import { FRONT_SLOTS, BACK_SLOTS } from './geometry';
import type { GameState, StackEntry, ReactiveStackEntry, PendingDeadPick, ArmorChoiceData } from './state';
import { effectiveKeywords } from './stats';
import { effectsOfCard, resolveActionEffects, conditionMet } from './interpreter';

/** Write the stack back, keeping the OPTIONAL-field invariant: `undefined` (not `[]`)
 *  when empty, so games that never queue a trigger — and games after every stack
 *  drains — hash identically to pre-arc state (stableStringify omits undefined keys;
 *  committed replay fixtures must not all retire over a phantom field). */
export function setStack(game: GameState, stack: StackEntry[]): GameState {
  return { ...game, triggerStack: stack.length ? stack : undefined };
}

/** Push entries onto the stack (later elements end up nearer the top). */
export function pushStack(game: GameState, entries: StackEntry[]): GameState {
  if (!entries.length) return game;
  return setStack(game, [...(game.triggerStack ?? []), ...entries]);
}

/** The subject-side deterministic scan order for a board (front then back). */
const SLOT_SCAN = [...FRONT_SLOTS, ...BACK_SLOTS];

/**
 * Gather the reactive triggers an event queues: permanents on the board OPPOSING the
 * event's subject whose card carries a clause with this trigger (the trap windows —
 * 'oppCompanionEnters' / 'oppCompanionMovesToFront' / 'oppCompanionAttacksCompanion').
 * Scanned in deterministic slot order; when more than one fires at once, their
 * OWNER orders them via PendingTriggerOrder before they go on the stack
 * (Rules Note 2026-07-22 — each player orders their own simultaneous triggers).
 */
export function gatherReactive(
  game: GameState, trigger: Trigger,
  subject: { id: string; name: string; controller: 'p1' | 'p2' },
): ReactiveStackEntry[] {
  const opp: 'p1' | 'p2' = subject.controller === 'p1' ? 'p2' : 'p1';
  const out: ReactiveStackEntry[] = [];
  for (const slot of SLOT_SCAN) {
    const ent = game[opp].board[slot];
    if (!ent) continue;
    if (effectsOfCard(ent.name).some(c => c.trigger === trigger)) {
      out.push({ kind: 'reactive', sourceId: ent.id, sourceName: ent.name, controller: opp,
        trigger, subjectId: subject.id, subjectName: subject.name });
    }
  }
  return out;
}

/**
 * Item-hosted declaration-window triggers (Arc E, 2026-07-23 — Caltrop Pouch):
 * gather 'onEquippedAttacked' clauses from the ATTACKED character's equipped items.
 * The BEARER anchors the trigger — this reads the target's LIVE loadout, so a
 * Kit-Master move carries the trigger with the item, and an unequipped/buried item
 * fires nothing. Text-literal scope ("Whenever equipped character is attacked"):
 * fires for ANY attacker and ANY attacked character (PC bearer included) — unlike
 * the board-trap window's companion-vs-companion R4 scope. Entries are name-keyed
 * like every reactive (resolveReactiveEntry resolves the ITEM card's clauses by
 * sourceName); sourceId is the BEARER's entity id (the anchor for any 'self'-ish
 * effect); controller = the bearer's side, so a mixed batch with Iron Spikes
 * stays single-controller (batchOrderer's construction holds). One entry per
 * carrying item — two pouches are two triggers, ordered by their owner (>1 arms
 * the standing PendingTriggerOrder prompt).
 */
export function gatherEquippedAttacked(
  target: BoardEntity, defenderSide: 'p1' | 'p2',
  subject: { id: string; name: string },
): ReactiveStackEntry[] {
  const out: ReactiveStackEntry[] = [];
  const lo = target.loadout;
  if (!lo) return out;
  for (const it of [lo.weapon, ...lo.gear]) {
    if (!it) continue;
    if (effectsOfCard(it.name).some(c => c.trigger === 'onEquippedAttacked')) {
      out.push({ kind: 'reactive', sourceId: target.id, sourceName: it.name, controller: defenderSide,
        trigger: 'onEquippedAttacked', subjectId: subject.id, subjectName: subject.name });
    }
  }
  return out;
}

/**
 * Gather the Paranoia play-window triggers for a companion being PLAYED from hand
 * (canon: "Whenever an opponent plays a Companion, look at the top card of that
 * player's deck.") — one trigger per opposing Paranoia permanent (effectiveKeywords,
 * so suppression is honored). R3 (re-ruled 2026-07-12): these queue ABOVE the played
 * card and resolve BEFORE it enters the encounter.
 */
export function gatherParanoia(game: GameState, placer: 'p1' | 'p2'): ReactiveStackEntry[] {
  const opp: 'p1' | 'p2' = placer === 'p1' ? 'p2' : 'p1';
  const out: ReactiveStackEntry[] = [];
  for (const slot of SLOT_SCAN) {
    const ent = game[opp].board[slot];
    if (ent && effectiveKeywords(ent, game).includes('Paranoia')) {
      out.push({ kind: 'paranoia', sourceName: ent.name, controller: opp, deckSide: placer });
    }
  }
  return out;
}

/**
 * Gather OWN-SIDE on-play listeners for a card being PLAYED from hand (arc 4,
 * owner-ratified 2026-07-15): permanents on the PLACER'S OWN board whose card
 * carries a clause with this trigger ("When YOU play …" — 'ownPlaysMagicalConstruct',
 * Patient Conjurer). "Play" means from hand, universally (R1 2026-07-15): only the
 * from-hand play path calls this — conversions, placements, and every other
 * entry-into-play route never emit a play event. Queues ABOVE the played card
 * (the gatherParanoia discipline), so it resolves BEFORE the played card enters.
 */
export function gatherOwnPlay(
  game: GameState, trigger: Trigger,
  subject: { id: string; name: string; controller: 'p1' | 'p2' },
): ReactiveStackEntry[] {
  const out: ReactiveStackEntry[] = [];
  for (const slot of SLOT_SCAN) {
    const ent = game[subject.controller].board[slot];
    if (!ent) continue;
    if (effectsOfCard(ent.name).some(c => c.trigger === trigger)) {
      out.push({ kind: 'reactive', sourceId: ent.id, sourceName: ent.name, controller: subject.controller,
        trigger, subjectId: subject.id, subjectName: subject.name });
    }
  }
  return out;
}

/**
 * Resolve one queued 'reactive' entry: run the source CARD's matching clauses with
 * the event subject bound to 'eventSubject'. Mandatory triggers fire regardless of
 * whether their effects do anything (R4: an already-exhausted mover still trips Pit
 * Trap — the exhaust is a no-op, the trap still sacrifices itself); the universal
 * pre-cost refusal rule applies to ACTIVATED abilities, not mandatory triggers.
 * Fires even if source or subject has died since queueing (R1) — effects that need
 * a gone entity no-op individually. Returns a toast line naming the trap and what
 * it did (no silent outcomes — every trap fire surfaces a toast).
 */
export function resolveReactiveEntry(
  game: GameState, entry: Extract<ReactiveStackEntry, { kind: 'reactive' }>,
  deadSink: PendingDeadPick[], armorSink: ArmorChoiceData[],
): { game: GameState; toast: string } {
  let g = game;
  const msgs: string[] = [];
  for (const clause of effectsOfCard(entry.sourceName)) {
    if (clause.trigger !== entry.trigger) continue;
    if (clause.if && !conditionMet(g, entry.controller, clause.if)) continue;
    const r = resolveActionEffects(g, entry.controller, entry.sourceName, clause.effects,
      undefined, entry.sourceId, { subjectId: entry.subjectId }, deadSink, armorSink);
    g = r.game;
    msgs.push(...r.msgs);
  }
  return { game: g, toast: `${entry.sourceName} triggers${msgs.length ? `: ${msgs.join(' | ')}` : ''}` };
}

/** Display label for a queued reactive trigger (the ordering prompt's option rows). */
export function reactiveLabel(e: ReactiveStackEntry): string {
  if (e.kind === 'paranoia') return `${e.sourceName} (Paranoia peek)`;
  if (e.kind === 'enterUnit') {
    // Same-owner enter triggers (Arc G): name WHAT each choice is — the order can be
    // information-relevant (hand seen pre- vs post-Coercion), so the rows must say
    // more than the card name.
    if (e.unit === 'scavenger') return `${e.sourceName} — Scavenger (attach an item from your Dead Zone)`;
    if (e.unit === 'coercion') return `${e.sourceName} — Coercion (opponent discards or sacrifices)`;
    const ops = effectsOfCard(e.sourceName)
      .filter(c => c.trigger === 'onEnter').flatMap(c => c.effects).map(x => x.op);
    const what = ops.includes('revealHand') ? "look at the opponent's hand"
      : ops.includes('returnFromDead') ? 'return a card from your Dead Zone'
      : 'enter ability';
    return `${e.sourceName} — ${what}`;
  }
  return `${e.sourceName} → ${e.subjectName}`;
}

/**
 * Fold a completed ordering pick into stack order. `picked` holds item indices in
 * RESOLUTION order (first pick resolves first); LIFO means the FIRST-resolving item
 * is pushed LAST. Any indices the player never picked (the implied final item)
 * follow in scan order at the bottom of the batch.
 */
export function orderedForStack(items: ReactiveStackEntry[], picked: number[]): ReactiveStackEntry[] {
  const rest = items.map((_, i) => i).filter(i => !picked.includes(i));
  const resolutionOrder = [...picked, ...rest];      // first element resolves first
  return resolutionOrder.map(i => items[i]).reverse(); // push order: last-resolving first
}

/**
 * The orderer for a simultaneous-trigger batch (Rules Note 2026-07-22): each player
 * orders their OWN simultaneous triggers, so the ordering prompt goes to the batch's
 * CONTROLLER — not the active player (supersedes the 2026-07-12/13 active-player
 * notes and Rules_Taxonomy Tier 5 #9 / Tier 3 #18's tiebreaker). Mixed-owner windows
 * are handled UPSTREAM since Arc G (2026-08-04): the play window segments its batch
 * by controller via `segmentBatch` (the active player's segment queues onto the
 * stack first, the non-active player's above — theirs resolve first), with
 * serialized per-owner ordering prompts (PendingTriggerOrder.next). Every OTHER
 * gather site stays single-controller by construction (gatherReactive/gatherParanoia
 * scan only the subject's opponent; gatherOwnPlay only the subject's own side).
 * A mixed batch REACHING this function is therefore a construction bug — it still
 * fails loudly by name (detection over enumeration, 2026-07-22 follow-up): route
 * mixed windows through segmentBatch, never through a single prompt.
 */
export function batchOrderer(items: ReactiveStackEntry[]): 'p1' | 'p2' {
  const owner = items[0].controller;
  const stray = items.find(it => it.controller !== owner);
  if (stray) {
    throw new Error(
      `batchOrderer: MIXED-OWNER simultaneous-trigger batch reached a single-owner ` +
      `ordering prompt — a construction bug since Arc G (2026-08-04). Segment the ` +
      `window by controller first (segmentBatch: the active player's triggers queue ` +
      `onto the stack first, the non-active player's above them — theirs resolve ` +
      `first; per-owner prompts serialized via PendingTriggerOrder.next). ` +
      `Batch: ${items.map(it => `${it.sourceName ?? it.kind}@${it.controller}`).join(', ')}`);
  }
  return owner;
}

/**
 * Segment a (possibly mixed-owner) simultaneous-trigger window into the 2026-07-22
 * structural queue order (Arc G 2026-08-04, first mixer: Echo-Keeper's own-play
 * listener sharing a companion play with opposing Paranoia). Returns segments in
 * PUSH order: the ACTIVE player's triggers queue onto the stack first, the
 * non-active player's above them — theirs resolve first (LIFO). Within a segment
 * the owner orders when it holds >1 trigger; a singleton needs no prompt. Empty
 * segments are omitted, so a single-owner window returns exactly one segment —
 * byte-identical arming to the pre-Arc-G path.
 */
export function segmentBatch(
  items: ReactiveStackEntry[], active: 'p1' | 'p2',
): { controller: 'p1' | 'p2'; items: ReactiveStackEntry[] }[] {
  const mine = items.filter(it => it.controller === active);
  const theirs = items.filter(it => it.controller !== active);
  const out: { controller: 'p1' | 'p2'; items: ReactiveStackEntry[] }[] = [];
  if (mine.length) out.push({ controller: active, items: mine });
  if (theirs.length) out.push({ controller: active === 'p1' ? 'p2' : 'p1', items: theirs });
  return out;
}
