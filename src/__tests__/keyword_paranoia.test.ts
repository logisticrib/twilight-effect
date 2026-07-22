// Paranoia — canonical definition (docs/Master_Keyword_List.md, Ashglow March):
// "Whenever an opponent plays a Companion, look at the top card of that player's deck.
//  You may put that card on the top or bottom of their deck."
// The choice belongs to Paranoia's CONTROLLER; the placing player makes no decision and
// (by default) never sees the card — the PendingPeek is owned by the controller (lp) and
// the placing player is reactive-held until it resolves.
//
// RE-RULED 2026-07-12 (R3, trigger-stack arc — supersedes the 2026-07-04 batch-2 order
// ruling): Paranoia triggers on the PLAY. Playing a card puts it on the stack; it does
// not enter the encounter until the stack empties down to it (R1), so the peek resolves
// BEFORE the companion enters and before its on-enter effects. Owner: "Peek first 100%."
// The old pins below that asserted the companion was already placed while the peek was
// up, and that the placer's own on-enter scry resolved first, were REWRITTEN in this
// change — not silently edited; each carries a dated re-rule note.
import { describe, it, expect, beforeEach } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkPc, mkCz } from './helpers';
import { reactiveHold } from '../store/gameStore';
import { CATALOG } from '../data/catalog';

const emberAdept = CATALOG.find(c => c.name === 'Ember Adept')!;       // Companion, no on-enter prompt
const tripwire = CATALOG.find(c => c.name === 'Tripwire Snare')!;      // Construct, no effects
const [d1, d2, d3] = CATALOG.slice(30, 33);                            // known deck order

/** p1 (local, active) holds `handCard` and a known 3-card deck; p2's board is given. */
function seed(handCard: typeof emberAdept, p2Board: Record<string, ReturnType<typeof mkComp>>, p1Board: Record<string, ReturnType<typeof mkComp>> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: [handCard], deck: [d1, d2, d3], board: p1Board,
      classZone: CATALOG.slice(20, 25).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)), willpower: 5 },
    // p2's hand must be KNOWN-empty: the dealt hand is a random slice of CATALOG(0..50),
    // which contains d1/d2/d3 — a dealt copy of d1 made the "not stolen to the
    // controller's hand" id-assertion flake (rng-dependent) before this pin.
    p2: { ...s.game.p2, board: p2Board, hand: [] },
  } }));
}

const play = (card: typeof emberAdept, slot = 'b1' as const) => {
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};

const watcher = (id: string) => mkComp(id, `Watcher-${id}`, { keywords: ['Paranoia'] });

describe('Paranoia (canonical: triggers when an OPPONENT plays a Companion)', () => {
  beforeEach(() => seed(emberAdept, { f1: watcher('par-1') }));

  it('opponent-owned peek over the placing player\'s deck, top/bottom only — BEFORE the companion enters (re-ruled 2026-07-12)', () => {
    play(emberAdept);
    const g = gs.getState().game;
    // R1/R3 (2026-07-12): the played companion sits ON THE STACK while the peek is
    // up — it has NOT entered yet. (The pre-re-rule pin asserted it was already
    // placed here; that order is superseded.)
    expect(g.p1.board.b1, 'companion has NOT entered while the peek is unresolved').toBeUndefined();
    expect(g.triggerStack?.some(e => e.kind === 'enter'), 'it is waiting on the trigger stack').toBe(true);
    const pk = g.pendingPeek!;
    expect(pk, 'peek armed').toBeTruthy();
    expect(pk.lp, 'choice belongs to the Paranoia CONTROLLER (p2)').toBe('p2');
    expect(pk.deckSide, 'looks at the PLACING player\'s deck (p1)').toBe('p1');
    expect(pk.cards.map(c => c.id), 'sees exactly the top card').toEqual([d1.id]);
    expect(pk.dests, 'top/bottom only — never to hand').toEqual(['top', 'bottom']);
    gs.getState().resolvePeek(['top']);
    expect(gs.getState().game.p1.board.b1?.name, 'the companion enters once the stack empties down to it').toBe('Ember Adept');
  });

  it('controller may bottom the card (opponent deck reordered, no card gained)', () => {
    play(emberAdept);
    const p2HandBefore = gs.getState().game.p2.hand.length;
    gs.getState().resolvePeek(['bottom']);
    const g = gs.getState().game;
    expect(g.p1.deck.map(c => c.id), 'top card sent to the bottom').toEqual([d2.id, d3.id, d1.id]);
    expect(g.p2.hand.length, 'controller gains nothing').toBe(p2HandBefore);
    expect(g.pendingPeek, 'prompt cleared').toBeNull();
  });

  it('controller may leave the card on top (deck unchanged)', () => {
    play(emberAdept);
    gs.getState().resolvePeek(['top']);
    expect(gs.getState().game.p1.deck.map(c => c.id)).toEqual([d1.id, d2.id, d3.id]);
  });

  it('a destination the peek does not offer is coerced to top — the card is never lost', () => {
    play(emberAdept);
    gs.getState().resolvePeek(['hand']);
    const g = gs.getState().game;
    expect(g.p1.deck.map(c => c.id), 'card stays on top of the deck').toEqual([d1.id, d2.id, d3.id]);
    expect(g.p2.hand.some(c => c.id === d1.id), 'not stolen to the controller\'s hand').toBe(false);
    expect(g.p1.hand.some(c => c.id === d1.id), 'not returned to the placer\'s hand').toBe(false);
  });

  it('the placing player is reactive-held until the controller resolves', () => {
    play(emberAdept);
    let g = gs.getState().game;
    expect(reactiveHold(g, 'p1'), 'placer (p1) is held').toContain('Watcher-par-1');
    expect(reactiveHold(g, 'p2'), 'the owner is never held by their own peek').toBeNull();
    const turnBefore = g.activePlayer;
    gs.getState().endTurn();
    expect(gs.getState().game.activePlayer, 'held player cannot end the turn').toBe(turnBefore);
    gs.getState().resolvePeek(['top']);
    g = gs.getState().game;
    expect(reactiveHold(g, 'p1'), 'hold lifts on resolve').toBeNull();
  });
});

describe('Paranoia — non-triggers', () => {
  it('playing a CONSTRUCT does not trigger it', () => {
    seed(tripwire, { f1: watcher('par-1') });
    play(tripwire, 'b1');
    const g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'construct placed').toBe('Tripwire Snare');
    expect(g.pendingPeek, 'no peek').toBeNull();
  });

  it('no opposing Paranoia permanent → no peek', () => {
    seed(emberAdept, { f1: mkComp('plain', 'Plain Watcher') });
    play(emberAdept);
    expect(gs.getState().game.pendingPeek).toBeNull();
  });

  it('a keyword-suppressed Paranoia companion (Binding Sigil, front line) does not trigger', () => {
    // p1's Binding Sigil suppresses OPPOSING front-line companions' keywords.
    seed(emberAdept, { f1: watcher('par-front') }, { f2: mkConstruct('sig', 'Binding Sigil', 2, { subtype: 'Incantation' }) });
    play(emberAdept);
    expect(gs.getState().game.pendingPeek, 'front-line Paranoia suppressed').toBeNull();
  });

  it('the same Paranoia companion on the BACK line still triggers (suppression is positional)', () => {
    seed(emberAdept, { b2: watcher('par-back') }, { f2: mkConstruct('sig', 'Binding Sigil', 2, { subtype: 'Incantation' }) });
    play(emberAdept);
    expect(gs.getState().game.pendingPeek?.lp).toBe('p2');
  });
});

describe('Paranoia — trigger order (RE-RULED 2026-07-12) & "plays a Companion" scope (2026-07-04)', () => {
  // RE-RULE (R3, owner 2026-07-12: "Peek first 100%"): Paranoia triggers on the PLAY,
  // so its peek resolves BEFORE the companion enters — and therefore before the
  // companion's own on-enter scry. This test previously pinned the SUPERSEDED
  // 2026-07-04 batch-2 order ("placer's own on-enter scry first, Paranoia peek
  // after"); it was rewritten in the 2026-07-12 change, not silently edited.
  it("the Paranoia peek resolves FIRST — before the companion enters; its on-enter scry follows (re-ruled 2026-07-12)", () => {
    const apprentice = CATALOG.find(c => c.name === 'Tower Apprentice')!;
    seed(apprentice, { f1: watcher('par-1') });
    play(apprentice);
    let g = gs.getState().game;
    expect([g.pendingPeek?.source, g.pendingPeek?.lp, g.pendingPeek?.deckSide],
      "Paranoia is the active prompt, over the PLACER's deck").toEqual(['Watcher-par-1', 'p2', 'p1']);
    expect(g.p1.board.b1, 'the companion has not entered yet').toBeUndefined();

    gs.getState().resolvePeek(['top']);
    g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'the companion enters after the peek').toBe('Tower Apprentice');
    expect([g.pendingPeek?.source, g.pendingPeek?.lp, g.pendingPeek?.deckSide],
      'its own on-enter scry resolves after entering').toEqual(['Tower Apprentice', 'p1', 'p1']);
    gs.getState().resolvePeek(['top']);
    expect(gs.getState().game.pendingPeek, 'all resolved').toBeNull();
  });

  // Ruling (b): "plays a Companion" = from hand only.
  it('PC placement is not "playing a Companion" — no trigger', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      setupQueue: ['place-pc:p1'],
      p1: { ...s.game.p1, _pc: mkPc('pc-1'), board: {} },
      p2: { ...s.game.p2, board: { f1: watcher('par-1') } },
    } }));
    gs.getState().placePc('b1', 'p1');
    const g = gs.getState().game;
    expect(g.p1.board.b1?.kind, 'PC placed').toBe('pc');
    expect(g.pendingPeek, 'no Paranoia peek').toBeNull();
  });

  it('an Animate Magic conversion is not "playing a Companion" — no trigger', () => {
    freshGame();
    const animateAction = {
      id: 'an-1', name: 'Synthetic Animation', level: 1, type: 'Action', subtype: '', rarity: '',
      class1: '', class2: '', attack: 0, hp: 0, anchor: null, actionSub: '', actionPM: 'Minor',
      itemKind: '', keywords: [], text: '', flavor: '', cls: '',
      effects: [{ trigger: 'onPlay', effects: [{ op: 'animate', atk: 2, hp: 2, target: 'magicalConstruct' }] }],
    } as unknown as (typeof emberAdept);
    gs.setState(s => ({ game: { ...s.game, selected: 'caster',
      p1: { ...s.game.p1, willpower: 9, hand: [animateAction], board: {
        f1: mkComp('caster', 'Synthetic Caster'),
        f2: mkConstruct('inc-1', 'Existing Incantation', 2, { subtype: 'Incantation' }),
      } },
      p2: { ...s.game.p2, board: { f1: watcher('par-1') } },
    } }));
    gs.getState().playAction(animateAction.id);
    gs.getState().resolveActionTarget('inc-1');
    const g = gs.getState().game;
    expect(g.p1.board.f2?.kind, 'construct became a companion').toBe('companion');
    expect(g.p1.board.f2?.subtype, 'a Manifest one').toBe('Manifest');
    expect(g.pendingPeek, 'a companion ENTERING by conversion is not one being PLAYED — no peek').toBeNull();
  });
});

describe('Paranoia — multiple permanents each trigger (stacked, re-sliced)', () => {
  // REWRITTEN 2026-07-12 (trigger-stack arc); chooser RETIRED + REWRITTEN 2026-07-22:
  // the old pin asserted the placer (active player) orders per the superseded
  // tiebreaker. Rules Note 2026-07-22: each player orders their OWN simultaneous
  // triggers — both Paranoias belong to their controller, who orders them before
  // anything resolves; the peeks then resolve one after another off the stack,
  // each re-slicing the live deck.
  it('two Paranoia permanents → their CONTROLLER orders them (2026-07-22), then sequential peeks; the second sees the post-decision top', () => {
    seed(emberAdept, { f1: watcher('par-1'), f2: watcher('par-2') });
    play(emberAdept);
    let g = gs.getState().game;
    expect(g.pendingTriggerOrder?.items.length, 'ordering prompt over the two simultaneous triggers').toBe(2);
    expect(g.pendingTriggerOrder?.lp, "Paranoia's controller orders — not the placer (2026-07-22)").toBe('p2');
    expect(g.pendingPeek, 'nothing resolves before the order is decided').toBeNull();

    gs.getState().resolveTriggerOrder(0);           // one pick fully orders two items
    g = gs.getState().game;
    expect(g.pendingTriggerOrder ?? null, 'order decided').toBeFalsy();
    expect(g.pendingPeek, 'first peek armed').toBeTruthy();
    expect(g.p1.board.b1, 'companion still on the stack under both peeks').toBeUndefined();

    gs.getState().resolvePeek(['bottom']);          // first: d1 → bottom
    g = gs.getState().game;
    expect(g.pendingPeek?.cards.map(c => c.id), 'second re-slices the NEW top').toEqual([d2.id]);

    gs.getState().resolvePeek(['top']);             // second: keep d2 on top
    g = gs.getState().game;
    expect(g.pendingPeek, 'all resolved').toBeNull();
    expect(g.p1.deck.map(c => c.id)).toEqual([d2.id, d3.id, d1.id]);
    expect(g.p1.board.b1?.name, 'the companion finally enters').toBe('Ember Adept');
  });
});
