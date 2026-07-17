// ─── Turn lifecycle + game construction ─────────────────────────────────────────
// Start-of-turn resolution, peek building, game construction, and equip/kit
// helpers. Moved verbatim from src/store/gameStore.ts (extraction plan, slices
// 5-6; shuffle/rollD6 arrived early because resolveActionEffects calls them).
// NOT here: the ready-phase decay/poison/flee logic — it lives in `readyPlayer`,
// an inline closure inside the store's endTurn that writes into closure-captured
// notice/transfer sinks; extracting it would mean inventing a new signature,
// which the extraction plan's move-only rule forbids.
import { rng } from './rng';
import type { BoardEntity, Card, Acts } from '../types/card';
import { CATALOG } from '../data/catalog';
import type { GameState, PlayerState, ClassZoneCard, PendingPeek, PeekRequest,
              PendingDeadPick, ArmorChoiceData, PendingModalChoice } from './state';
import { findEntityAnywhere, updateEntity, itemProfileOf } from './entities';
import { isCharacter, canHoldItem } from './stats';
import { permanentEffects, effectsOfCard, actionTargetSpec, eligibleTargets,
         resolveActionEffects } from './interpreter';

// Fisher-Yates; exported for UI shuffles (mulligan redeal, Bard's Encore!) so no
// component reinvents it with the biased sort(() => Math.random() - 0.5) trick.
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rollD6(): number { return 1 + Math.floor(rng.next() * 6); }

/** Display label for a player seat from the local viewer's perspective. Stored
 *  player names are perspective placeholders ('You'/'Opponent'), and the whole
 *  GameState is broadcast wholesale in multiplayer, so each peer must derive the
 *  label from the seat vs its own `localPlayer` — never read `game[side].name`. */
export function seatName(side: 'p1' | 'p2', localPlayer: 'p1' | 'p2'): string {
  return side === localPlayer ? 'You' : 'Opponent';
}

export function freshActs(): Acts { return { move: false, minor: false, major: false }; }

/** Unique entity/card id. Draws from the rng boundary (not Date.now) so the id is captured
 *  by the replay recorder and reproduced on replay; still effectively unique in normal play. */
export function uid(prefix: string): string { return `${prefix}-${Math.floor(rng.next() * 0xffffffff).toString(16)}`; }

/** Slice a peek request against the current deck into a live PendingPeek (or null
 *  if that deck is now empty). Re-sliced at arm time so a prior reorder can't stale it. */
export function buildPeek(game: GameState, req: PeekRequest): PendingPeek | null {
  // "Any deck" (2026-07-16 — Lens of Foretelling / Runic Convergence Staff): the
  // deck is not sliced yet — the modal first asks the CONTROLLER which deck, then
  // resolvePeekDeck slices it. Skipped only when BOTH decks are empty.
  if (req.deck === 'any') {
    if (game.p1.deck.length === 0 && game.p2.deck.length === 0) return null;
    return { source: req.source, lp: req.lp, deckSide: req.lp, cards: [], dests: req.dests, maxHand: req.maxHand, chooseDeck: true, look: req.look };
  }
  const cards = game[req.deckSide].deck.slice(0, req.look);
  if (cards.length === 0) return null;
  return { source: req.source, lp: req.lp, deckSide: req.deckSide, cards, dests: req.dests, maxHand: req.maxHand };
}

/** Pop the next valid peek off a queue, skipping any whose deck is now empty. */
export function nextPeek(game: GameState, queue: PeekRequest[]): { peek: PendingPeek | null; rest: PeekRequest[] } {
  const rest = [...queue];
  while (rest.length) {
    const p = buildPeek(game, rest.shift()!);
    if (p) return { peek: p, rest };
  }
  return { peek: null, rest: [] };
}

/** Does any permanent (card or item) this player controls project `preventAnchorDecay`
 *  (Master of Foundations)? Their Physical Constructs then skip start-of-turn decay. */
export function controlsPreventAnchorDecay(ps: PlayerState): boolean {
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

/**
 * Fire all start-of-turn effects for `side` (constructs and companions). A single
 * interactive enemy target is auto-picked (start of turn does not prompt — interim;
 * could become a choice later). Deck-peek and Dead-Zone-recovery ops are NOT resolved
 * here — they are collected for interactive modals queued after endTurn finishes.
 * Sources are snapshotted since the board may change.
 */
export function resolveStartOfTurn(game: GameState, side: 'p1' | 'p2'): { game: GameState; msgs: string[]; peeks: PeekRequest[]; deadPicks: PendingDeadPick[]; armorChoices: ArmorChoiceData[]; modals: PendingModalChoice[] } {
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
      if (e.op === 'deckPeek') peeks.push({ source: loc.ent.name, lp: side, deckSide: side, look: e.look, dests: e.dests, maxHand: e.maxHand, deck: e.deck });
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
export function equipOnto(game: GameState, lp: 'p1' | 'p2', entityId: string, card: Card): GameState {
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
export function kitDests(game: GameState, controller: 'p1' | 'p2', exceptId: string, isWeapon: boolean, heavy: boolean): string[] {
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

// (There is exactly ONE "current Willpower" — see currentWillpower in engine/stats.ts.
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

/** The ordered setup sequence both players walk through before turn 1. */
const SETUP_SEQUENCE = [
  'mulligan:p1', 'mulligan:p2',
  'classbonus:p1', 'classbonus:p2',
  'place-pc:p1', 'place-pc:p2',
];

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
