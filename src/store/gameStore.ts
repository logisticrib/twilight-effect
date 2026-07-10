import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { rng } from './rng';
import { recordActions } from './recordMiddleware';
import type { BoardEntity, Card, TapState, Acts } from '../types/card';
import type { Effect } from '../types/effects';
import { CATALOG, SORCERER_WARRIOR_CARDS, WIZARD_BUILDER_CARDS } from '../data/catalog';
import { recomputeStatics, isImmuneToSplash, HIT_RUN_STATUS,
         isPhysicalConstruct, parseEnterTrigger, type EnterTriggerKind,
         isCharacter, firstItemOf, allItemsOf, canHoldItem, effectiveAttack, effectiveKeywords, effectiveMaxHp, wardedLines,
         canPlayActionCard, actionTypeOf, currentWillpower, parseBanes,
         POISONED_STATUS, parseAnimateMagic, hasBackLineAttackAura } from './keywords';

// Everything relocated to the headless engine stays importable from this module —
// external import sites don't churn during the extraction (see src/engine/index.ts).
export * from '../engine';
import { ADJ, FRONT_SLOTS, BACK_SLOTS, isFront, findSlot, type SlotId, type Board,
         type Phase, type ClassZoneCard, type PlayerState, type GameState,
         type PendingPeek, type PeekRequest, type PendingCoercion, type PendingDeadPick,
         type AttackCtx, type ArmorChoiceData,
         type PendingItemTransfer, type PendingModalChoice,
         findEntityAnywhere, updateEntity, removeEntity, deadCardsOf,
         itemTransferOf, itemProfileOf, itemTransferCandidates, armNextItemTransfer,
         setPcHp, payPcHp, pcIdOf, charsOf,
         ownPhysicalConstructIds,
         eligibleTargets, effectsWouldAffectSomething, actionTargetSpec, twoStepKind,
         permanentEffects, effectsOfCard, gatherActivated, abilityUsedTag, magicCtx,
         destroyEntity, applyDamage, applyCombatHit, driveAttack, optionalAttackAbility,
         attackDamageBonus, resolveActionEffects, armPrompts, armNextArmorChoice,
         applyArmorCounter, shuffle } from '../engine';

export type PlayPhase = 'lobby' | 'setup' | 'game';
/** 'placing-pc' = waiting for the local player to choose a Back Line slot */
export type SetupStep = 'mulligan' | 'classbonus' | 'placing-pc' | 'done';


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

/** Commit a finished attack: seal activation, clear selection, and arm any deferred
 *  Dead-Zone picks + Armor choices (the latter from combat triggers). */
function finalizeAttack(game: GameState, ctx: AttackCtx): GameState {
  return recomputeStatics({
    ...armPrompts(game, ctx.deadSink, ctx.armorSink),
    ...activationPatch(game, ctx.charId),
    selected: null,
  });
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
  const res = driveAttack(newGame, ctx);
  if (!res.done) return { paused: true, game: { ...res.game, pendingArmor: res.pendingArmor } };
  return { paused: false, game: finalizeAttack(res.game, res.ctx), msg: res.ctx.msgs.join(' | ') };
}

/** Unique entity/card id. Draws from the rng boundary (not Date.now) so the id is captured
 *  by the replay recorder and reproduced on replay; still effectively unique in normal play. */
function uid(prefix: string): string { return `${prefix}-${Math.floor(rng.next() * 0xffffffff).toString(16)}`; }

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
function resolveStartOfTurn(game: GameState, side: 'p1' | 'p2'): { game: GameState; msgs: string[]; peeks: PeekRequest[]; deadPicks: PendingDeadPick[]; armorChoices: ArmorChoiceData[]; modals: PendingModalChoice[] } {
  let g = game;
  const msgs: string[] = [];
  const peeks: PeekRequest[] = [];
  const deadPicks: PendingDeadPick[] = [];
  const armorChoices: ArmorChoiceData[] = [];
  const modals: PendingModalChoice[] = [];
  const ids = Object.values(g[side].board).filter((e): e is BoardEntity => !!e).map(e => e.id);
  for (const id of ids) {
    const loc = findEntityAnywhere(g, id);
    if (!loc) continue; // removed by an earlier effect this step
    const allEffs = permanentEffects(loc.ent, 'startOfTurn');
    if (allEffs.length === 0) continue;
    // Defer MODAL clauses (Pyre of the Unbound) as an interactive choice prompt — the
    // clause is read un-flattened because its optionality and sacrificeSelf cost are
    // clause-level. The cost is paid at RESOLUTION (declining pays nothing).
    for (const ce of effectsOfCard(loc.ent.name)) {
      if (ce.trigger !== 'startOfTurn') continue;
      const modalEff = ce.effects.find(e => e.op === 'modal');
      if (!modalEff || modalEff.op !== 'modal') continue;
      modals.push({ lp: side, sourceName: loc.ent.name, sourceId: id, options: modalEff.options,
        cost: ce.cost?.kind === 'sacrificeSelf' ? 'sacrificeSelf' : undefined, optional: !!ce.optional });
    }
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
    // minus deck-peeks and deferred modal choices). Library has none here; most
    // start-of-turn sources hit this path.
    const cutoff = rfdIdx >= 0 ? rfdIdx : allEffs.length;
    const effs = allEffs.slice(0, cutoff).filter(e => e.op !== 'deckPeek' && e.op !== 'modal');
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
  return { game: g, msgs, peeks, deadPicks, armorChoices, modals };
}

/**
 * Equip a hand item `card` onto `entityId`: weapon → weapon slot (old weapon back to
 * hand), gear → first empty gear slot (heavy fills both). Removes the item from `lp`'s
 * hand. Does NOT spend an action — callers add the action cost when appropriate (the
 * normal Minor-action equip does; on-enter "equip from hand" does not).
 */
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

// (There is exactly ONE "current Willpower" — see currentWillpower in store/keywords.ts.
//  Every check reads it; player.willpower is only the base Class-Zone-count stat.)

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
    pendingCoercion: null,
    pendingArmor: null,
    pendingAttackChoice: null,
    pendingModalChoice: null,
    pendingModalChoiceQueue: [],
    pendingItemTransfer: null,
    pendingItemTransferQueue: [],
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
  /** Sandbox affordance: sacrifice a permanent outright — a REAL exit (destroyEntity:
   *  card + items to Dead Zone, sworn returns, Item Transfer window queues). The old
   *  ✕-Sacrifice button faked this with adjustHp(-999), which clamps to 0 HP and
   *  removes NOTHING — a silent no-op behind a success toast. */
  sacrificeEntity: (entityId: string) => void;

  // Deck-peek (scry) resolution
  resolvePeek: (assignments: ('hand' | 'top' | 'bottom')[]) => void;
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
    if (gameIsOver(s.game)) return s;
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
      const deadSink: PendingDeadPick[] = []; const armorSink: ArmorChoiceData[] = [];
      const srcLoc = findEntityAnywhere(g, pa.firstId);
      const dstLoc = findEntityAnywhere(g, targetId);
      if (srcLoc && dstLoc) {
        const moved = Math.min(count, srcLoc.ent.anchors ?? 0);
        g = updateEntity(g, targetId, { anchors: (dstLoc.ent.anchors ?? 0) + moved });
        const srcNext = (srcLoc.ent.anchors ?? 0) - moved;
        if (srcNext <= 0) {
          const d = destroyEntity(g, pa.firstId, deadSink, armorSink); // sacrifice = death (fires triggers)
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

    // Activating an ability is a Major Action for a character (PC/companion):
    // gate it on the same budget rules an attack uses. Constructs are not bound by
    // character action economy — their abilities cost only what the card states.
    if (isCharacter(loc.ent)) {
      const isExhausted = loc.ent.tapped === 'major' || loc.ent.exhausted;
      const reason = isSealed(s.game, entityId) ? 'Activation already finished'
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
    if (cost && !['exhaustSelf', 'sacrificeSelf', 'payHP', 'removeAnchor'].includes(cost.kind)) {
      return refuse(`Can't activate ${ability.sourceName}: its cost kind ("${(cost as { kind: string }).kind}") is not supported by the engine.`);
    }
    if (cost?.kind === 'exhaustSelf' && (loc.ent.exhausted || loc.ent.tapped === 'major')) {
      return refuse(`Can't activate ${ability.sourceName}: already exhausted — the exhaust cost can't be paid.`);
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
        const d = destroyEntity(g, entityId, deadSink, armorSink);
        g = d.game; costMsgs.push(...d.msgs);
        sacrificedSelf = true;
      }
    } else if (cost?.kind === 'exhaustSelf') {
      g = updateEntity(g, entityId, { exhausted: true, tapped: 'major', acts: { ...loc.ent.acts, major: true } });
    } else if (cost?.kind === 'payHP') {
      g = updateEntity(g, entityId, { hp: Math.max(0, loc.ent.hp - cost.amount) });
    } else if (cost?.kind === 'removeAnchor') {
      const left = (loc.ent.anchors ?? 0) - cost.count;
      // Paying the LAST anchor sacrifices the construct — consistent with the anchor
      // effect op and the decay rule ("sacrifice when last removed"). Engine default;
      // no shipped card pays this cost yet (flagged to the owner).
      if (left <= 0) {
        const d = destroyEntity(g, entityId, deadSink, armorSink); // sacrifice = death
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

    // Consume the character's Major Action (exhaust). Skip if the entity was
    // sacrificed as the cost, if exhaustSelf already did it, or for constructs.
    if (isCharacter(loc.ent) && !sacrificedSelf && cost?.kind !== 'exhaustSelf') {
      const cur = findEntityAnywhere(g, entityId);
      if (cur) g = updateEntity(g, entityId, { acts: { ...cur.ent.acts, major: true }, exhausted: true, tapped: 'major' });
    }

    // Atomic activation: activating a character's ability seals its activation
    // (and any other character mid-activation). Constructs are exempt.
    if (isCharacter(loc.ent)) g = { ...g, ...activationPatch(s.game, entityId) };

    // The source may have left play paying its cost (sacrificeSelf, last-anchor pay).
    const selfId = findEntityAnywhere(g, entityId) ? entityId : undefined;

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
    const d = destroyEntity(s.game, entityId, deadSink, armorSink); // sacrifice = death (ruled 2026-07-08)
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
    const newGame = { ...s.game, [side]: { ...ps, deck: newDeck, hand: pk.lp === side ? [...s.game[pk.lp].hand, ...toHand] : ps.hand } };
    const { peek, rest } = nextPeek(newGame, s.game.pendingPeekQueue); // advance any queued start-of-turn peeks
    return {
      game: armNextItemTransfer({ ...newGame, pendingPeek: peek, pendingPeekQueue: rest }),
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
    return { game: armNextItemTransfer({ ...s.game, pendingPeek: peek, pendingPeekQueue: rest }) };
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
      const d = destroyEntity(g, pm.sourceId, deadSink, armorSink); // sacrifice = death (fires triggers)
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
    const hasRanged = effectiveKeywords(ent, s.game).includes('Ranged');
    const towerCovered = ent.kind === 'companion' && hasBackLineAttackAura(s.game, attLoc.player);
    if (!hasRanged && !towerCovered && !isFront(attLoc.slot)) {
      return { ...toast('Must be in the Front Line to attack (no Ranged).') };
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
    if (gameIsOver(s.game)) return s;
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

    // Non-combat deferred choice: apply the counter, then arm the next queued one.
    if (!pa.ctx) {
      const r = applyArmorCounter(s.game, pa.entityId, pieceId);
      const next = armNextArmorChoice(r.game, pa.queue ?? []);
      return { game: armNextItemTransfer({ ...next.game, pendingArmor: next.pendingArmor }), toasts: [...s.toasts, mkToast(r.msgs.join(' | '))] };
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
  beginPlay: (cardId) => set(s => {
    if (gameIsOver(s.game)) return s;
    if (notActionPhase(s.game)) {
      const id = ++toastId;
      setTimeout(() => set(s2 => ({ toasts: s2.toasts.filter(t => t.id !== id) })), 3000);
      return { toasts: [...s.toasts, { id, msg: 'Not in the Action Phase — resolve the Class Zone Exchange (or Skip) first.' }] };
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
        const d = destroyEntity(game, targetId, deadSink, armorSink); // sacrifice = death (fires triggers)
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

    // Paranoia (Master_Keyword_List): "Whenever an opponent plays a Companion, look at
    // the top card of that player's deck. You may put that card on the top or bottom of
    // their deck." The peek is OWNED by the Paranoia controller (this player's opponent)
    // and looks at THIS player's deck; the placing player makes no choice and never sees
    // the card (PeekModal renders only for the owner). One trigger per Paranoia
    // permanent; extras queue and re-slice the live deck when they become active.
    const oppSide: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
    const paranoiaReqs: PeekRequest[] = isCompanion
      ? (Object.values(game[oppSide].board) as (BoardEntity | undefined)[])
          .filter((e): e is BoardEntity => !!e && effectiveKeywords(e, game).includes('Paranoia'))
          .map(e => ({ source: e.name, lp: oppSide, deckSide: lp, look: 1, dests: ['top', 'bottom'] }))
      : [];
    /** Fold the Paranoia peeks into whatever game the return path built (queue behind
     *  an already-armed peek so the placer's own scry resolves first). */
    const armParanoia = (g: GameState): GameState => {
      if (paranoiaReqs.length === 0) return g;
      if (g.pendingPeek) return { ...g, pendingPeekQueue: [...g.pendingPeekQueue, ...paranoiaReqs] };
      const { peek, rest } = nextPeek(g, paranoiaReqs);
      return peek ? { ...g, pendingPeek: peek, pendingPeekQueue: [...g.pendingPeekQueue, ...rest] } : g;
    };
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

    // Scavenger (on-enter, optional): return an Item card from your Dead Zone and
    // attach it to this companion. Rides the existing Dead-Zone prompt with an attach
    // destination (resolveDeadPick equips instead of returning to hand). No items in
    // the Dead Zone → fizzles with a note rather than blocking.
    let scavengerPick: PendingDeadPick | null = null;
    if (isCompanion && card.keywords.includes('Scavenger')) {
      const options = game[lp].dead
        .map((c, idx) => ({ card: c, idx }))
        .filter(o => o.card.type === 'Item');
      if (options.length > 0) {
        scavengerPick = { source: card.name, lp, options, postEffects: [], optional: true,
          attachTo: { id: newEnt.id, name: card.name } };
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
      const eligibleIds = (Object.values(game[lp].board) as (BoardEntity | undefined)[])
        .filter((e): e is BoardEntity => !!e && e.kind === 'construct' && e.subtype === 'Incantation')
        .map(e => e.id);
      if (eligibleIds.length > 0) {
        animatePick = { source: 'enter', sourceName: card.name, lp,
          effects: [{ op: 'animate', atk: animateX, hp: animateX, target: 'magicalConstruct' }],
          eligibleIds, sourceId: newEnt.id };
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
      const victim: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
      const canDiscard = game[victim].hand.length > 0;
      const canSacrifice = Object.values(game[victim].board).some(e => e && e.kind !== 'pc');
      if (canDiscard || canSacrifice) {
        pendingCoercion = { source: card.name, victim };
        enterMsg = `${card.name}: Coercion — opponent must discard a card or sacrifice a permanent.`;
      } else {
        enterMsg = `${card.name} enters — the opponent has nothing to coerce.`;
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
    if (!pendingTrigger && !pendingKit && !scavengerPick && !animatePick && !pendingCoercion && onEnter.length > 0) {
      // Equip-from-hand (Veteran of the Ashgrove): pick an item from hand for this character.
      if (onEnter.some(e => e.op === 'equipFromHand')) {
        const items = placedGame[lp].hand.filter(c => c.type === 'Item');
        if (items.length > 0) {
          return {
            pendingPlay: null, oathContext: newOathCtx, modalQueue: newModals, game: armParanoia(placedGame),
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
            pendingPlay: null, oathContext: newOathCtx, modalQueue: newModals, game: armParanoia(placedGame),
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
            game: armParanoia({ ...placedGame, pendingPeek: { source: card.name, lp, deckSide: lp, cards, dests: enterPeek.dests, maxHand: enterPeek.maxHand } }),
            toasts: [...s.toasts, { id, msg: `${card.name} enters — look at your deck.` }],
          };
        }
      }
      const spec = actionTargetSpec(onEnter);
      if (spec) {
        const eligibleIds = eligibleTargets(placedGame, lp, spec).filter(eid => eid !== newEnt.id);
        if (eligibleIds.length > 0) {
          return {
            pendingPlay: null, oathContext: newOathCtx, modalQueue: newModals, game: armParanoia(placedGame),
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
          game: armParanoia(armPrompts(r.game, [], armorSink)),
          toasts: [...s.toasts, { id, msg: r.msgs.length ? `${card.name} enters! ${r.msgs.join(' | ')}` : enterMsg }],
        };
      }
    }

    // Scavenger's prompt joins the game-level Dead-Zone queue (behind any active pick).
    const withScavenger: GameState = !scavengerPick ? placedGame
      : placedGame.pendingDeadPick
        ? { ...placedGame, pendingDeadPickQueue: [...placedGame.pendingDeadPickQueue, scavengerPick] }
        : { ...placedGame, pendingDeadPick: scavengerPick };
    const withCoercion: GameState = pendingCoercion ? { ...withScavenger, pendingCoercion } : withScavenger;

    return {
      pendingPlay: null,
      pendingTrigger,
      pendingKit,
      // Only claim the pendingActionTarget slot when Animate Magic armed one — a null
      // here must not clobber an unrelated pending target.
      ...(animatePick ? { pendingActionTarget: animatePick } : {}),
      oathContext: newOathCtx,
      modalQueue: newModals,
      game: armParanoia(withCoercion),
      toasts: [...s.toasts, { id, msg: enterMsg }],
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
    const d = destroyEntity({ ...s.game, pendingCoercion: null }, entityId, deadSink, armorSink);
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
    const g = s.game;
    const nextPlayer: 'p1' | 'p2' = g.activePlayer === 'p1' ? 'p2' : 'p1';
    const nextTurn = nextPlayer === 'p1' ? g.turn + 1 : g.turn;

    // Cards leaving the board at ready phase used to vanish silently — surface each one.
    const readyNotices: string[] = [];
    const readyTransfers: PendingItemTransfer[] = [];
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
            readyNotices.push(`${whose} ${ent.name} crumbles — its last Anchor decayed.`);
            continue;
          }
          newBoard[slot as SlotId] = {
            ...ent, anchors: newAnchors, acts: freshActs(), tapped: 'none' as TapState, exhausted: false,
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
        newBoard[slot as SlotId] = {
          ...ent, fresh: false, acts: freshActs(),
          tapped: poisoned ? ent.tapped : 'none' as TapState,
          exhausted: poisoned ? ent.exhausted : false,
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
