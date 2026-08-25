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
              PendingModalChoice, PeekRequest, ArmorChoiceData, PendingHauntReturn } from './state';
import type { Board, SlotId } from './geometry';
import { FRONT_SLOTS, BACK_SLOTS } from './geometry';
import { HIT_RUN_STATUS, currentWillpower, isPhysicalConstruct, isVocalConstruct, hasAnchorCounters, recomputeStatics, hasModifier, effectiveKeywords } from './stats';
import { CATALOG } from '../data/catalog';
import { deadCardsOf, itemTransferOf, fireSacrificeTriggers } from './entities';
import { hasRemovalTrigger, resolveRemovalTriggers } from './combat';
import { freshActs, computeWillpower, controlsPreventAnchorDecay, vocalDecaySkippedFor, resolveStartOfTurn } from './lifecycle';
import { permanentEffects, resolveActionEffects } from './interpreter';

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
    // Skip-refresh (Arc H 2026-08-04, Whispered Accusation): a live 'doesNotReady'
    // modifier holds the CHARACTER's tap/exhaust exactly like Poison does — items
    // still ready alongside (the Poison discipline: the hold is the character's,
    // not the item's). No `game` arg: hasModifier without game conservatively skips
    // DORMANT (pendingUntilTurnOf) entries — correct here, since a dormant window
    // belongs to a LATER turn start; the entry governing THIS ready step was armed
    // by the buff-boundary pass that ran just before this phase. Consumption is the
    // anchor's own expiry (turnEnd of this controller) — nothing is mutated here.
    const skipReady = hasModifier(ent, 'doesNotReady');
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
    // Arc E: per-turn attack tally (Vielle's attackTwice) resets at the ready —
    // key STRIPPED, never written 0 (fixture-hash discipline).
    const { attacksUsed: _spentAttacks, ...entRest } = ent;
    newBoard[slot as SlotId] = {
      ...entRest, fresh: false, acts: freshActs(),
      tapped: poisoned || skipReady ? ent.tapped : 'none' as TapState,
      exhausted: poisoned || skipReady ? ent.exhausted : false,
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
  /** EVERY Ready Phase sacrifice — decayed permanents AND fled companions
   *  (re-rule 2026-07-20: fleeing IS a sacrifice), in board slot order. */
  sacrificed: BoardEntity[];
  /** The FLEE subset of `sacrificed` (Arc C, 2026-07-23): flee-specific listeners
   *  (Dread Chorister's "whenever an opposing companion flees") fire for these and
   *  ONLY these — narrow is OWNER-RULED 2026-07-23 ("flees" means flees). `kind`
   *  alone cannot identify a flee: a Manifest is a companion that can also DECAY. */
  fled: BoardEntity[];
}

/** Step 3 — Ready Phase removals, run AFTER start-of-turn triggers (last gasp):
 *  Anchor decay (sacrifice at zero; Master-of-Foundations exemption) + Willpower
 *  flee exits. BOTH are SACRIFICES (decay: canon "sacrifice when last removed";
 *  flee: re-rule 2026-07-20 — "fleeing is a sacrifice", superseding the arc-5
 *  audit's non-sacrifice classification). Exits go to the Dead Zone with their
 *  items; a tucked Oathsworn card returns to hand (canon, verbatim: "When this
 *  permanent leaves the encounter, return the sworn card to your hand." — death
 *  and flee are both leaves); a fleeing companion opens an Item Transfer window. */
export function applyReadyRemovals(game: GameState, side: 'p1' | 'p2', whose: string): ReadyRemovalsResult {
  const ps = game[side];
  const notices: string[] = [];
  const transfers: PendingItemTransfer[] = [];
  const sacrificed: BoardEntity[] = [];
  const fled: BoardEntity[] = [];
  const haunts: PendingHauntReturn[] = [];
  const reprisedToHand: Card[] = [];
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
      // Arc E (2026-08-25): the Anthem of the Unbroken — the VOCAL twin of the
      // Master-of-Foundations skip, with an 'other' exclusion (the Anthem itself
      // still decays; the live Satyr can sustain it instead).
      const skipDecay = (noPhysicalDecay && isPhysicalConstruct(ent))
        || (isVocalConstruct(ent) && vocalDecaySkippedFor(ps, ent));
      const newAnchors = skipDecay ? (ent.anchors ?? 0) : (ent.anchors ?? 0) - 1;
      if (newAnchors <= 0) { // last anchor decayed — sacrificed (it already ticked)
        // REPRISE (Arc E): a Vocal Construct with effective Reprise LEAVES to its
        // owner's hand instead of dying — no bury, no sacrifice listeners, no Dead
        // Zone (the ratified leaves-but-never-dies). Sworn card returns with it.
        if (isVocalConstruct(ent) && effectiveKeywords(ent, game).includes('Reprise')) {
          const card = CATALOG.find(c => c.name === ent.name);
          if (card) {
            reprisedToHand.push(...(ent.sworn ? [card, ent.sworn] : [card]));
            notices.push(`${whose} ${ent.name}: Reprise — it returns to hand instead of being sacrificed.`);
            continue;
          }
        }
        bury(ent);
        sacrificed.push(ent);
        notices.push(`${whose} ${ent.name} crumbles — its last Anchor decayed.`);
        continue;
      }
      cur = { ...ent, anchors: newAnchors };
    }
    // Companion fleeing: level > effective willpower (it already fired its trigger).
    // FLEEING IS A SACRIFICE (re-rule, owner 2026-07-20): the fleeing companion is
    // sacrificed — death triggers fire and sacrifice listeners can hear it, subject
    // to their own scope (Siegeworks stays Physical-Construct-scoped). This also
    // dissolves the c367630 Manifest flag natively: a decay-surviving Manifest that
    // fails the Willpower check is SACRIFICED — its "if it would leave the
    // encounter, sacrifice it instead" clause is satisfied, not contradicted.
    if (cur.kind === 'companion' && cur.level > effWP) {
      bury(cur);
      sacrificed.push(cur);
      fled.push(cur);
      // HAUNT (Requiem Arc C, 2026-08-25): a FLEE is a death (2026-07-20) and canon
      // rules it triggers Haunt — checked on the PRE-removal entity exactly like the
      // destroyEntity site. Self-balancing by design: the return re-enters exhausted
      // and, if its Level still exceeds Willpower, it simply flees again next check.
      // (DECAY deaths above deliberately do NOT check: only constructs and Manifests
      // decay, Haunt is companion-side, and the one corner — a decayed Manifest
      // wearing the Crown — has no carrier scenario in any deck. Dated exclusion,
      // not an oversight; revisit if a Wizard deck ever meets the Crown.)
      if ((cur.memoryCounters ?? 0) === 0 && effectiveKeywords(cur, game).includes('Haunt')) {
        const card = CATALOG.find(c => c.name === cur.name);
        if (card) haunts.push({ lp: cur.stolenFrom ?? side, cardId: card.id, cardName: card.name });
      }
      notices.push(`${whose} ${cur.name} flees — Level ${cur.level} exceeds Willpower ${effWP}.`);
      continue;
    }
    newBoard[slot as SlotId] = cur;
  }
  return { game: { ...game, [side]: { ...ps, board: newBoard,
    dead: buried.length ? [...ps.dead, ...buried] : ps.dead,
    hand: returnedSworn.length || reprisedToHand.length
      ? [...ps.hand, ...returnedSworn, ...reprisedToHand] : ps.hand },
    ...(haunts.length ? { pendingHauntQueue: [...(game.pendingHauntQueue ?? []), ...haunts] } : {}) },
    notices, transfers, sacrificed, fled };
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
 *  removals → arc-5 on-sacrifice listeners, resolved SEQUENTIALLY (Rules Note
 *  2026-07-21 — simultaneous events resolve one at a time; listeners and game
 *  state are evaluated as of each individual event, so a permanent removed by an
 *  earlier event is off the board for later ones. Overrules the arc-5 flagged
 *  mutual-hearing reading).
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
  // SEQUENTIAL RESOLUTION (Rules Note 2026-07-21): the batch's events resolve one
  // at a time in deterministic slot-scan order (the arc-5 listener convention) —
  // an auto-ordering STOPGAP, not the full rule: canon gives the ORDER choice to
  // the owning player (active player across owners). No shipped card makes that
  // choice outcome-relevant; the moment one does, a full ordering prompt becomes
  // necessary (HANDOFF design note 2026-07-21). Each event's listeners are
  // gathered from `eventBoard` — the board as of THAT event: the dying permanent
  // itself is still present (its own listener fires, R3), permanents removed by
  // EARLIER events in the sequence are gone.
  const slotOrder = [...FRONT_SLOTS, ...BACK_SLOTS];
  const slotOf = (ent: BoardEntity) => slotOrder.findIndex(s => preRemovalBoard[s]?.id === ent.id);
  const events = [...rem.sacrificed].sort((a, b) => slotOf(a) - slotOf(b));
  let eventBoard: Board = preRemovalBoard;
  for (const dy of events) {
    // EVERY Ready Phase exit is a SACRIFICE — decayed permanents (canon) and fled
    // companions (re-rule, owner 2026-07-20) — and a sacrifice is a death (RULED
    // 2026-07-08). This loop applies the same death machinery destroyEntity
    // applies for the sacrifice cause, in its engine-default order: the dying
    // permanent's own death/destroy triggers first (a fleeing Memory-Stone bearer
    // arms its recovery pick via the dead-pick sink; no shipped CONSTRUCT carries
    // one, so construct decay stays byte-neutral — the fixture oracle holds),
    // then the on-sacrifice listeners (fled companions pass through the
    // listeners' own scope filters — Siegeworks is Physical-Construct-scoped and
    // stays silent for them).
    if (hasRemovalTrigger(dy)) {
      // Ready-phase exits are SACRIFICES — a death-cause-conditional trigger
      // ("if it died to damage", Cult Fanatic) stays silent here (Arc C).
      const rt = resolveRemovalTriggers(g, dy, side, sot.deadPicks, sot.armorChoices, 'sacrifice');
      g = rt.game;
      notices.push(...rt.msgs);
    }
    const st = fireSacrificeTriggers(g, dy, side, eventBoard);
    g = st.game;
    notices.push(...st.msgs);
    // FLEE-specific listeners (Arc C, 2026-07-23 — Dread Chorister): fire the
    // OPPONENT's 'oppCompanionFlees' carriers per flee event. NARROW is
    // OWNER-RULED (2026-07-23): "flees" means flees — flee-is-a-sacrifice governs
    // what a flee IS, not what "flees" wording listens to. SETTLED; the decay/
    // sacrifice-silent pins are the permanent guard.
    // Ordering note: fired after the event's own death machinery, within the same
    // sequential event — the existing auto-order STOPGAP (design note 2026-07-21)
    // extended to the cross-owner pair; no outcome-relevant ordering exists among
    // shipped/dev listeners today (draw vs dead-pick are independent).
    if (rem.fled.some(f => f.id === dy.id)) {
      const opp: 'p1' | 'p2' = side === 'p1' ? 'p2' : 'p1';
      for (const listener of Object.values(g[opp].board)) {
        if (!listener) continue;
        const effs = permanentEffects(listener, 'oppCompanionFlees');
        if (!effs.length) continue;
        const fr = resolveActionEffects(g, opp, listener.name, effs, undefined, listener.id, undefined, sot.deadPicks, sot.armorChoices);
        g = fr.game;
        if (fr.msgs.length) notices.push(`${listener.name}: ${fr.msgs.join(' | ')}`);
      }
    }
    // This event has resolved — its permanent is not on the board for later events.
    eventBoard = Object.fromEntries(
      Object.entries(eventBoard).filter(([, e]) => e?.id !== dy.id)) as Board;
  }
  return { game: g, sotMsgs: sot.msgs, notices, transfers: rem.transfers,
    peeks: sot.peeks, deadPicks: sot.deadPicks, armorChoices: sot.armorChoices, modals: sot.modals };
}
