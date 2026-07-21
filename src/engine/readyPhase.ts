// ─── Ready Phase (extracted from gameStore.endTurn, 2026-07-20 — debt #2 closed) ──
// The canonical Ready Phase, in the ruled order (Rules Note 2026-07-20 — LAST GASP):
//   1. ready permanents + flip Class Zone cards (readyAndFlip — NO removals)
//   2. start-of-turn triggered abilities FIRE — before any removal: a construct
//      on its last Anchor ticks once more; a companion about to flee fires first
//   3. Anchor decay (sacrifice at zero → arc-5 on-sacrifice listeners) +
//      Willpower flee exits
// Pure move of the store logic (behaviorally invisible — the committed replay
// fixture is the oracle); endTurn is now orchestration: end-of-turn buff expiry,
// runReadyPhase, the turn draw, and prompt arming.
import type { BoardEntity, Card, TapState } from '../types/card';
import type { GameState, PlayerState, PendingItemTransfer, PendingDeadPick,
              PendingModalChoice, PeekRequest, ArmorChoiceData } from './state';
import type { Board, SlotId } from './geometry';
import { HIT_RUN_STATUS, currentWillpower, isPhysicalConstruct, hasAnchorCounters, recomputeStatics } from './stats';
import { deadCardsOf, itemTransferOf, fireSacrificeTriggers } from './entities';
import { hasRemovalTrigger, resolveRemovalTriggers } from './combat';
import { freshActs, computeWillpower, controlsPreventAnchorDecay, resolveStartOfTurn } from './lifecycle';

/** Step 1 — ready all permanents + flip the Class Zone (no removals here). */
export function readyAndFlip(ps: PlayerState): PlayerState {
  // Flip CZ cards face-up → recalculate willpower
  const newCZ = ps.classZone.map(c => ({ ...c, faceDown: false }));
  const newWillpower = computeWillpower(newCZ);
  const newBoard: Board = {};
  for (const [slot, ent] of Object.entries(ps.board)) {
    if (!ent) continue;
    // Ready constructs (clear exhaust/tap + once-per-turn markers, so "exhaust
    // until your next turn" effects like Library of Memory expire). Anchor decay
    // happens AFTER start-of-turn triggers (last gasp) — not here.
    if (ent.kind === 'construct') {
      newBoard[slot as SlotId] = {
        ...ent, acts: freshActs(), tapped: 'none' as TapState, exhausted: false,
        fresh: false, // entry turn is over (2026-07-15 — see placeCard)
        statuses: ent.statuses.filter(st => !st.startsWith('ability-used:')),
      };
      continue;
    }
    // Ready the character (drop unused Hit & Run marker + once-per-turn ability
    // markers). A Poisoned character does NOT ready here — the start-of-turn
    // Poison check (PoisonModal → resolvePoison) decides whether it cleanses+
    // readies or stays exhausted, so its tap/exhaust state is left for that check.
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
  return { ...ps, classZone: newCZ, willpower: newWillpower, board: newBoard };
}

export interface ReadyRemovalsResult {
  game: GameState;
  notices: string[];
  transfers: PendingItemTransfer[];
  decayedSacs: BoardEntity[];
}

/** Step 3 — Ready Phase removals, run AFTER start-of-turn triggers (last gasp):
 *  Anchor decay (sacrifice at zero; Master-of-Foundations exemption) + Willpower
 *  flee exits. Exits go to the Dead Zone with their items; a tucked Oathsworn
 *  card returns to hand; a fleeing companion opens an Item Transfer window. */
export function applyReadyRemovals(game: GameState, side: 'p1' | 'p2', whose: string): ReadyRemovalsResult {
  const ps = game[side];
  const notices: string[] = [];
  const transfers: PendingItemTransfer[] = [];
  const decayedSacs: BoardEntity[] = [];
  // Fleeing checks read THE current Willpower (Dismayed-adjusted; base was
  // recomputed at the flip). Dismay pressure can cause fleeing — intended
  // (owner ruling 2026-07-04).
  const effWP = currentWillpower(ps);
  // Master of Foundations: this player's Physical Constructs skip anchor decay.
  const noPhysicalDecay = controlsPreventAnchorDecay(ps);
  const newBoard: Board = {};
  const buried: Card[] = [];
  const returnedSworn: Card[] = [];
  const bury = (ent: BoardEntity) => {
    buried.push(...deadCardsOf(ent));
    if (ent.sworn) returnedSworn.push(ent.sworn);
    // A ready-phase exit (fleeing companion) opens an Item Transfer window for the
    // readied player. Constructs return null (they carry no items).
    const t = itemTransferOf(ent, side);
    if (t) transfers.push(t);
  };
  for (const [slot, ent] of Object.entries(ps.board)) {
    if (!ent) continue;
    // Decay keys on ANCHOR COUNTERS, not card type (Rules Note 2026-07-20): every
    // permanent carrying counters decays — an animated Manifest "retains its …
    // Anchor counters" and they remain its LIFESPAN. The Master-of-Foundations
    // exemption stays Physical-Construct-scoped (owner-confirmed 2026-07-20: it
    // does NOT protect Manifests — its text names Physical Constructs).
    let cur = ent;
    if (hasAnchorCounters(ent)) {
      const skipDecay = noPhysicalDecay && isPhysicalConstruct(ent);
      const newAnchors = skipDecay ? (ent.anchors ?? 0) : (ent.anchors ?? 0) - 1;
      if (newAnchors <= 0) { // last anchor decayed — sacrificed (it already ticked)
        bury(ent);
        decayedSacs.push(ent);
        notices.push(`${whose} ${ent.name} crumbles — its last Anchor decayed.`);
        continue;
      }
      cur = { ...ent, anchors: newAnchors };
    }
    // Companion fleeing: level > effective willpower (it already fired its trigger).
    // A decay-SURVIVING Manifest is still a companion and still faces this check —
    // pre-existing behavior, unchanged by the 2026-07-20 ruling (flagged in HANDOFF
    // as an unruled edge: flee-vs-leave-as-sacrifice for Manifests).
    if (cur.kind === 'companion' && cur.level > effWP) {
      bury(cur);
      notices.push(`${whose} ${cur.name} flees — Level ${cur.level} exceeds Willpower ${effWP}.`);
      continue;
    }
    newBoard[slot as SlotId] = cur;
  }
  return { game: { ...game, [side]: { ...ps, board: newBoard,
    dead: buried.length ? [...ps.dead, ...buried] : ps.dead,
    hand: returnedSworn.length ? [...ps.hand, ...returnedSworn] : ps.hand } },
    notices, transfers, decayedSacs };
}

export interface ReadyPhaseResult {
  game: GameState;
  /** Trigger messages — these events fire FIRST (toast order mirrors the ruling). */
  sotMsgs: string[];
  /** Removal + on-sacrifice-listener messages (fire after the triggers). */
  notices: string[];
  transfers: PendingItemTransfer[];
  peeks: PeekRequest[];
  deadPicks: PendingDeadPick[];
  armorChoices: ArmorChoiceData[];
  modals: PendingModalChoice[];
}

/** The whole Ready Phase for `side`, in the ruled order: readyAndFlip →
 *  start-of-turn triggers (last gasp; statics recomputed around the window — a
 *  trigger could remove a Dismay source before the flee check reads Willpower) →
 *  removals → arc-5 on-sacrifice listeners for decay sacrifices (gathered from
 *  the event-time, pre-removal board: the decayed construct's own listener fires
 *  (R3) and same-ready sacrifices hear each other — flagged engine reading).
 *  NOTE: listener effects needing prompt sinks (dead-picks/armor) would need
 *  sinks threaded here; the shipped listener (draw) needs none. */
export function runReadyPhase(game: GameState, side: 'p1' | 'p2', whose: string): ReadyPhaseResult {
  let g: GameState = recomputeStatics({ ...game, [side]: readyAndFlip(game[side]) });
  const sot = resolveStartOfTurn(g, side);
  g = recomputeStatics(sot.game);
  const preRemovalBoard = g[side].board;
  const rem = applyReadyRemovals(g, side, whose);
  g = rem.game;
  const notices = [...rem.notices];
  for (const dy of rem.decayedSacs) {
    // Death/destroy triggers fire on a decay sacrifice like any other death
    // (RULED 2026-07-08: sacrifice IS a death). No shipped CONSTRUCT carries one
    // (byte-neutral there — the fixture oracle holds), but a decayed MANIFEST can:
    // Memory Stone on the animated body arms its recovery pick via the dead-pick
    // sink. Order mirrors destroyEntity's engine default: the dying permanent's
    // own removal triggers first, then the on-sacrifice listeners.
    if (hasRemovalTrigger(dy)) {
      const rt = resolveRemovalTriggers(g, dy, side, sot.deadPicks, sot.armorChoices);
      g = rt.game;
      notices.push(...rt.msgs);
    }
    const st = fireSacrificeTriggers(g, dy, side, preRemovalBoard);
    g = st.game;
    notices.push(...st.msgs);
  }
  return { game: g, sotMsgs: sot.msgs, notices, transfers: rem.transfers,
    peeks: sot.peeks, deadPicks: sot.deadPicks, armorChoices: sot.armorChoices, modals: sot.modals };
}
