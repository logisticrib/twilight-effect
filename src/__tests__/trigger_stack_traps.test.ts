// Trap reactive-trigger system — pinning tests for the 2026-07-12 owner-ratified
// rulings (R1–R4) and the three authored trap cards (Tripwire Snare / Pit Trap /
// Iron Spikes, effectsFlags removed in the same change).
//
// Canon quoted verbatim (docs/Card_Design_Parameters.md §13/§21):
//   "Use a stack - multiple triggers resolve in order (most recent first)"
//   "Resolve most recent first (last in, first out)"
//   "Your trigger can cause opponent's trigger, which resolves first"
// Dated Rules Notes: docs/Game_Rules_Updated.md §Core Mechanics, "Triggered
// Abilities & The Trigger Stack" (2026-07-12).
//
// R1 — playing a card puts it on the stack; "plays" and "enters" are distinct
//      sequential events; queued triggers resolve even if source/subject died.
// R2 — attack declaration and damage are separate steps; declaration-window
//      triggers resolve before damage is queued; dead attacker → the attack fizzles.
// R3 — Paranoia peek-before-enter: pinned in keyword_paranoia.test.ts (rewritten).
// R4 — Pit Trap is movement-only; mandatory triggers fire even when their effects
//      no-op; Iron Spikes fires at declaration. ORDERING RE-RULED 2026-07-22
//      (supersedes the 2026-07-12 active-player reconfirmation): each player
//      orders their OWN simultaneous triggers — the prompt goes to the batch's
//      controller (the once-rejected trap-controller reading is now the rule).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkCz } from './helpers';
import { reactiveHold } from '../store/gameStore';
import { orderedForStack, batchOrderer } from '../engine';
import type { ReactiveStackEntry } from '../engine';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const czCards = CATALOG.slice(20, 25);

/** Synthetic hand companion — deterministic stats, optional structured effects. */
const mkHandComp = (id: string, name: string, hp: number, effects?: unknown): Card => ({
  id, name, level: 1, type: 'Companion', subtype: '', rarity: 'Common', class1: 'Warrior',
  class2: '', attack: 2, hp, anchor: null, actionSub: '', actionPM: '', itemKind: '',
  keywords: [], text: '', flavor: '',
  ...(effects ? { effects } : {}),
} as unknown as Card);

/** p1 (local, active) holds `hand`; boards as given; known 3-card deck for draw checks. */
function seed(hand: Card[], p2Board: Record<string, ReturnType<typeof mkComp>>, p1Board: Record<string, ReturnType<typeof mkComp>> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand, deck: CATALOG.slice(30, 33), board: p1Board,
      classZone: czCards.map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2Board, hand: [] },
  } }));
}

const play = (card: Card, slot = 'b1' as const) => {
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};
const tripwire = (id: string) => mkConstruct(id, 'Tripwire Snare', 2, { subtype: 'Trap' });
const pitTrap = (id: string) => mkConstruct(id, 'Pit Trap', 2, { subtype: 'Trap' });
const spikes = (id: string) => mkConstruct(id, 'Iron Spikes', 2, { subtype: 'Trap' });

afterEach(() => vi.restoreAllMocks());

// ─── R1 + Tripwire Snare ────────────────────────────────────────────────────────
describe('R1 / Tripwire Snare — "When an opposing companion enters the encounter, deal 1 damage to it. Sacrifice this construct."', () => {
  it('fires on the enter: 1 damage to the enterer; the trap self-sacrifice is a DEATH (card to Dead Zone)', () => {
    seed([mkHandComp('hc-1', 'Sturdy Recruit', 3)], { f1: tripwire('tw-1') });
    play(mkHandComp('hc-1', 'Sturdy Recruit', 3));
    const g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'enterer damaged for 1').toBe(2);
    expect(g.p2.board.f1, 'Tripwire sacrificed off the board').toBeUndefined();
    expect(g.p2.dead.map(c => c.name), 'sacrifice routes through the shared exit path (locked 2026-07-08)').toContain('Tripwire Snare');
    expect(g.triggerStack ?? undefined, 'stack drained back to undefined (fixture-hash invariant)').toBeUndefined();
  });

  it('R1: queued triggers survive death — Tripwire kills the entering 1-HP companion; its queued on-enter STILL resolves (ruled example verbatim)', () => {
    // Ruled sequence (2026-07-12, verbatim for Tripwire): companion's enter trigger
    // queues → Tripwire triggers → Tripwire resolves → the enter ability resolves.
    const frail = mkHandComp('hc-2', 'Frail Scout', 1, [{ trigger: 'onEnter', effects: [{ op: 'draw', count: 1 }] }]);
    seed([frail], { f1: tripwire('tw-1') });
    const handBefore = 1, deckBefore = 3;
    play(frail);
    const g = gs.getState().game;
    expect(g.p1.board.b1, 'the 1-HP enterer died to the trap').toBeUndefined();
    expect(g.p1.dead.length, 'no CATALOG entry for the synthetic card, but it left the board').toBeGreaterThanOrEqual(0);
    expect(g.p1.deck.length, 'the already-queued on-enter draw STILL resolved').toBe(deckBefore - 1);
    expect(g.p1.hand.length, 'drawn card in hand (the played card itself left the hand)').toBe(handBefore - 1 + 1);
    expect(g.p2.board.f1, 'Tripwire sacrificed').toBeUndefined();
  });

  it('ruled queue order is OBSERVABLE: the trap resolves BEFORE the enter ability (a self-heal on-enter heals the trap damage back)', () => {
    // Ruled sequence (2026-07-12): enter trigger queues → Tripwire queues above →
    // Tripwire resolves → the enter ability resolves. With a "heal self 1" on-enter
    // on a full-HP enterer the order is state-visible: trap-then-heal ends at full
    // HP; heal-then-trap (the WRONG order) would end 1 down (the pre-damage heal
    // no-ops at max HP).
    const healer = mkHandComp('hc-h', 'Field Medic', 3, [{ trigger: 'onEnter', effects: [{ op: 'heal', amount: 1, target: 'self' }] }]);
    seed([healer], { f1: tripwire('tw-1') });
    play(healer);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'trap damage (3→2) then the queued heal (2→3)').toBe(3);
    expect(g.p2.board.f1, 'Tripwire fired and sacrificed').toBeUndefined();
  });

  it('does not fire when a CONSTRUCT enters, and Pit Trap does not fire on ENTRY at all (R4: movement only)', () => {
    const wizTripwire = CATALOG.find(c => c.name === 'Tripwire Snare')!;
    seed([wizTripwire], { f1: tripwire('tw-1'), f2: pitTrap('pt-1') });
    play(wizTripwire, 'b1'); // constructs may enter any empty slot; b1 is fine
    const g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'own trap placed (the authored card is playable)').toBe('Tripwire Snare');
    expect(g.p2.board.f1?.name, 'opposing Tripwire untouched — a construct entering is not "an opposing companion enters"').toBe('Tripwire Snare');
    expect(g.p2.board.f2?.name, 'Pit Trap untouched — entering is not moving').toBe('Pit Trap');
  });

  it('R4: a companion ENTERING does not trip Pit Trap — only movement into the front line does', () => {
    // Companions enter on the Back Line, so "entering directly onto the front line"
    // has no from-hand path today; this pins the window split at its executable
    // boundary: the enter event gathers ONLY 'oppCompanionEnters' triggers.
    const comp = mkHandComp('hc-3', 'Sturdy Recruit', 3);
    seed([comp], { f1: pitTrap('pt-1') });
    play(comp);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.exhausted, 'enterer not exhausted').toBe(false);
    expect(g.p2.board.f1?.name, 'Pit Trap did not fire').toBe('Pit Trap');
  });
});

// ─── R4 + Pit Trap ──────────────────────────────────────────────────────────────
describe('R4 / Pit Trap — "When an opposing companion moves into the front line, exhaust it and sacrifice this construct."', () => {
  it('fires on movement into the front line: exhausts the mover, sacrifices itself', () => {
    seed([], { f2: pitTrap('pt-1') }, { b1: mkComp('mv-1', 'Mover') });
    gs.getState().beginMove('mv-1');
    gs.getState().resolveMove('f1');
    const g = gs.getState().game;
    expect(g.p1.board.f1?.id, 'move landed').toBe('mv-1');
    expect(g.p1.board.f1?.exhausted, 'mover exhausted').toBe(true);
    expect(g.p2.board.f2, 'Pit Trap sacrificed').toBeUndefined();
    expect(g.p2.dead.map(c => c.name), 'trap card to its owner\'s Dead Zone').toContain('Pit Trap');
  });

  it('MANDATORY: an already-exhausted mover still trips it — the exhaust is a no-op, the trap still sacrifices itself', () => {
    // R4 (2026-07-12): the universal pre-cost refusal rule applies to ACTIVATED
    // abilities, not mandatory triggers. (Exhaustion blocks attacks and abilities,
    // not movement — Rules Note 2026-07-08.)
    seed([], { f2: pitTrap('pt-1') }, { b1: mkComp('mv-2', 'Weary Mover', { exhausted: true, tapped: 'major' }) });
    gs.getState().beginMove('mv-2');
    gs.getState().resolveMove('f1');
    const g = gs.getState().game;
    expect(g.p1.board.f1?.exhausted, 'mover stays exhausted (no-op exhaust)').toBe(true);
    expect(g.p2.board.f2, 'the trap STILL fired and sacrificed itself').toBeUndefined();
    expect(g.p2.dead.map(c => c.name)).toContain('Pit Trap');
  });

  it('a lateral front→front step does not trip it (the mover never left the front line) — pins current ENGINE reading of "moves into"', () => {
    seed([], { f2: pitTrap('pt-1') }, { f1: mkComp('mv-3', 'Sidestepper') });
    gs.getState().beginMove('mv-3');
    gs.getState().resolveMove('f2');
    const g = gs.getState().game;
    expect(g.p1.board.f2?.id, 'move landed').toBe('mv-3');
    expect(g.p1.board.f2?.exhausted).toBe(false);
    expect(g.p2.board.f2?.name, 'Pit Trap did not fire').toBe('Pit Trap');
  });

  it('batchOrderer GUARD: a mixed-owner batch fails loudly by name (chokepoint, not a comment — 2026-07-22 follow-up)', () => {
    const entry = (id: string, controller: 'p1' | 'p2') => ({
      kind: 'reactive', sourceId: id, sourceName: 'Synthetic Trap', controller,
      trigger: 'oppCompanionEnters', subjectId: 'x', subjectName: 'X',
    }) as never;
    // Homogeneous batch: returns the batch's controller (the 2026-07-22 chooser).
    expect(batchOrderer([entry('a', 'p2'), entry('b', 'p2')] as never)).toBe('p2');
    // Mixed-owner batch: no shipped card can create one (gathers are single-side by
    // construction) — if a future card does, the guard names the missing machinery
    // (the 2026-07-22 structural queue order + per-owner prompts) instead of
    // silently handing one owner's triggers to the other.
    expect(() => batchOrderer([entry('a', 'p1'), entry('b', 'p2')] as never))
      .toThrow(/MIXED-OWNER.*2026-07-22|2026-07-22.*MIXED-OWNER|MIXED-OWNER[\s\S]*2026-07-22/);
  });

  // RETIRED + REWRITTEN 2026-07-22: the old pin asserted lp 'p1' per the superseded
  // active-player tiebreaker (2026-07-12). Rules Note 2026-07-22: each player orders
  // their OWN simultaneous triggers — the prompt goes to the TRAP CONTROLLER.
  it('two Pit Traps: their CONTROLLER orders them (Rules Note 2026-07-22); the mover is HELD; BOTH mandatory triggers fire', () => {
    seed([], { f2: pitTrap('pt-1'), f3: pitTrap('pt-2') }, { b1: mkComp('mv-4', 'Mover') });
    gs.getState().beginMove('mv-4');
    gs.getState().resolveMove('f1');
    let g = gs.getState().game;
    expect(g.pendingTriggerOrder?.items.length, '>1 simultaneous trigger → ordering prompt').toBe(2);
    expect(g.pendingTriggerOrder?.lp, 'ordered by the traps\' OWNER, not the mover (2026-07-22)').toBe('p2');
    // MP hold direction flips with the chooser: the ACTIVE mover now waits.
    expect(reactiveHold(g, 'p1'), 'the mover (p1) is the held peer').not.toBeNull();
    expect(reactiveHold(g, 'p2'), 'the owner (p2) is never held by their own prompt').toBeNull();
    gs.getState().resolveTriggerOrder(1); // one pick fully orders two items (sandbox drives both seats)
    g = gs.getState().game;
    expect(g.pendingTriggerOrder ?? null).toBeFalsy();
    expect(g.p1.board.f1?.exhausted, 'mover exhausted (second exhaust was a no-op)').toBe(true);
    expect(g.p2.board.f2, 'both traps sacrificed').toBeUndefined();
    expect(g.p2.board.f3).toBeUndefined();
    expect(g.p2.dead.filter(c => c.name === 'Pit Trap').length, 'both trap cards buried').toBe(2);
  });
});

// ─── R2 + Iron Spikes ───────────────────────────────────────────────────────────
describe('R2 / Iron Spikes — "Whenever an opposing companion attacks one of your companions, deal 1 damage to the attacker."', () => {
  it('fires at declaration and PERSISTS (no self-sacrifice; it fires repeatedly)', () => {
    seed([], { f1: mkComp('df-1', 'Defender', { hp: 9, maxHp: 9 }), f2: spikes('is-1') },
      { f1: mkComp('at-1', 'Attacker A', { atk: 3, hp: 5 }), f2: mkComp('at-2', 'Attacker B', { atk: 3, hp: 5 }) });
    gs.getState().beginAttack('at-1');
    gs.getState().resolveAttack('df-1');
    let g = gs.getState().game;
    expect(g.p1.board.f1?.hp, 'attacker took the Spikes damage').toBe(4);
    expect(g.p2.board.f1?.hp, 'attack damage still landed after the trigger').toBe(6);
    expect(g.p2.board.f2?.name, 'Iron Spikes persists — its bound is anchor decay').toBe('Iron Spikes');
    gs.getState().beginAttack('at-2');
    gs.getState().resolveAttack('df-1');
    g = gs.getState().game;
    expect(g.p1.board.f2?.hp, 'fires again on the next attack').toBe(4);
    expect(g.p2.board.f1?.hp).toBe(3);
  });

  it('R2 fizzle (ruled example): a 1-HP attacker dies to the Spikes damage and deals NOTHING — damage is never queued', () => {
    seed([], { f1: mkComp('df-2', 'Defender', { hp: 5 }), f2: spikes('is-1') },
      { f1: mkComp('at-3', 'Glass Cannon', { atk: 5, hp: 1 }) });
    gs.getState().beginAttack('at-3');
    gs.getState().resolveAttack('df-2');
    const g = gs.getState().game;
    expect(g.p1.board.f1, 'attacker died at declaration').toBeUndefined();
    expect(g.p2.board.f1?.hp, 'the attack fizzled — target untouched').toBe(5);
    expect(g.p2.board.f2?.name, 'Spikes persists').toBe('Iron Spikes');
  });

  it('window is exact: an attack on the PC is not "attacks one of your companions" — no trigger', () => {
    seed([], { f1: mkComp('pc-shell', 'PC Stand-in', { hp: 9, maxHp: 9, kind: 'pc' as const }), f2: spikes('is-1') },
      { f1: mkComp('at-4', 'Attacker', { atk: 2, hp: 5 }) });
    gs.getState().beginAttack('at-4');
    gs.getState().resolveAttack('pc-shell');
    const g = gs.getState().game;
    expect(g.p1.board.f1?.hp, 'no Spikes damage to the attacker').toBe(5);
  });

  it('R1+R2: the attacker\'s own queued onAttack trigger still resolves after Spikes kills it — then the attack fizzles', () => {
    // Queue order at declaration (ruled 2026-07-12): the attacker's own "when this
    // attacks" clause queues FIRST, the reactive trap above it — so the trap
    // resolves first (killing the 1-HP attacker), the queued clause still resolves
    // from its snapshot (R1: queued triggers survive death), and the damage step
    // then fizzles (R2). Vael's on-attack (dieCheck 6 → 3 to all enemies) is the
    // only shipped resolving onAttack clause; the die is pinned to 6.
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // every d6 rolls 6
    seed([], { f1: mkComp('df-3', 'Target', { hp: 5 }), b1: mkComp('by-1', 'Bystander', { hp: 5 }), f2: spikes('is-1') },
      { f1: mkComp('vl-1', 'Vael, the Unchecked', { atk: 5, hp: 1 }) });
    gs.getState().beginAttack('vl-1');
    gs.getState().resolveAttack('df-3');
    const g = gs.getState().game;
    expect(g.p1.board.f1, 'Vael died to the Spikes at declaration').toBeUndefined();
    expect(g.p1.dead.map(c => c.name), 'a real death — card buried').toContain('Vael, the Unchecked');
    expect(g.p2.board.f1?.hp, 'queued onAttack AoE (3) landed; the 5-damage attack itself never did').toBe(2);
    expect(g.p2.board.b1?.hp, 'bystander hit by the AoE proves the dead attacker\'s clause resolved').toBe(2);
  });
});

// ─── Simultaneous ordering + the endTurn gate ───────────────────────────────────
// RETIRED + REWRITTEN 2026-07-22: this block pinned the active-player tiebreaker
// ("canon STANDS, reconfirmed 2026-07-12"). SUPERSEDED — Rules Note 2026-07-22:
// each player orders their own simultaneous triggers.
describe('Simultaneous triggers — owner ordering (Rules Note 2026-07-22, supersedes the active-player tiebreaker)', () => {
  it('two defender-owned Tripwires on the active player\'s companion entering are ordered by the TRAP CONTROLLER', () => {
    const comp = mkHandComp('hc-4', 'Sturdy Recruit', 3);
    seed([comp], { f1: tripwire('tw-1'), f2: tripwire('tw-2') });
    play(comp);
    let g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'the companion has ENTERED (the traps are enter-triggers, queued above its own)').toBe('Sturdy Recruit');
    expect(g.pendingTriggerOrder?.lp, 'ordered by the traps\' owner, not the entering player (2026-07-22)').toBe('p2');
    expect(g.pendingTriggerOrder?.items.map(i => i.kind === 'reactive' ? i.sourceName : ''), 'both traps queued')
      .toEqual(['Tripwire Snare', 'Tripwire Snare']);

    // Unresolved triggers hold the turn (R1): endTurn refuses while the order is pending.
    const before = g.activePlayer;
    gs.getState().endTurn();
    expect(gs.getState().game.activePlayer, 'endTurn refused mid-stack').toBe(before);

    gs.getState().resolveTriggerOrder(0);
    g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'both mandatory triggers fired (2 damage total)').toBe(1);
    expect(g.p2.dead.filter(c => c.name === 'Tripwire Snare').length, 'both traps sacrificed').toBe(2);
    expect(g.triggerStack ?? undefined, 'stack drained').toBeUndefined();
  });

  it('orderedForStack: first-picked resolves FIRST — i.e. it is pushed LAST (canon: "Resolve most recent first (last in, first out)")', () => {
    const A: ReactiveStackEntry = { kind: 'reactive', sourceId: 'a', sourceName: 'A', controller: 'p2', trigger: 'oppCompanionEnters', subjectId: 's', subjectName: 'S' };
    const B: ReactiveStackEntry = { kind: 'reactive', sourceId: 'b', sourceName: 'B', controller: 'p2', trigger: 'oppCompanionEnters', subjectId: 's', subjectName: 'S' };
    // The player picked item 1 (B) to resolve first → push order must be [A, B]
    // (B last = top of the LIFO stack = resolves first).
    expect(orderedForStack([A, B], [1]).map(e => (e as typeof A).sourceId)).toEqual(['a', 'b']);
    expect(orderedForStack([A, B], [0]).map(e => (e as typeof A).sourceId)).toEqual(['b', 'a']);
  });
});
