// Paranoia — canonical definition (docs/Master_Keyword_List.md, Ashglow March):
// "Whenever an opponent plays a Companion, look at the top card of that player's deck.
//  You may put that card on the top or bottom of their deck."
// The choice belongs to Paranoia's CONTROLLER; the placing player makes no decision and
// (by default) never sees the card — the PendingPeek is owned by the controller (lp) and
// the placing player is reactive-held until it resolves.
import { describe, it, expect, beforeEach } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkCz } from './helpers';
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
    p2: { ...s.game.p2, board: p2Board },
  } }));
}

const play = (card: typeof emberAdept, slot = 'b1' as const) => {
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};

const watcher = (id: string) => mkComp(id, `Watcher-${id}`, { keywords: ['Paranoia'] });

describe('Paranoia (canonical: triggers when an OPPONENT plays a Companion)', () => {
  beforeEach(() => seed(emberAdept, { f1: watcher('par-1') }));

  it('opponent-owned peek over the placing player\'s deck, top/bottom only', () => {
    play(emberAdept);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'companion placed').toBe('Ember Adept');
    const pk = g.pendingPeek!;
    expect(pk, 'peek armed').toBeTruthy();
    expect(pk.lp, 'choice belongs to the Paranoia CONTROLLER (p2)').toBe('p2');
    expect(pk.deckSide, 'looks at the PLACING player\'s deck (p1)').toBe('p1');
    expect(pk.cards.map(c => c.id), 'sees exactly the top card').toEqual([d1.id]);
    expect(pk.dests, 'top/bottom only — never to hand').toEqual(['top', 'bottom']);
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

describe('Paranoia — multiple permanents each trigger (queued, re-sliced)', () => {
  it('two Paranoia permanents → one peek armed + one queued; the second sees the post-decision top', () => {
    seed(emberAdept, { f1: watcher('par-1'), f2: watcher('par-2') });
    play(emberAdept);
    let g = gs.getState().game;
    expect(g.pendingPeek, 'first peek armed').toBeTruthy();
    expect(g.pendingPeekQueue.length, 'second queued').toBe(1);

    gs.getState().resolvePeek(['bottom']);          // first: d1 → bottom
    g = gs.getState().game;
    expect(g.pendingPeek?.cards.map(c => c.id), 'second re-slices the NEW top').toEqual([d2.id]);

    gs.getState().resolvePeek(['top']);             // second: keep d2 on top
    g = gs.getState().game;
    expect(g.pendingPeek, 'all resolved').toBeNull();
    expect(g.p1.deck.map(c => c.id)).toEqual([d2.id, d3.id, d1.id]);
  });
});
