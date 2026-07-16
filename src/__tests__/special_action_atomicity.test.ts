// Special Actions × atomic activation (bugfix, owner-ratified 2026-07-15).
// Canon (Card_Design_Parameters §24, quoted verbatim): "Activation is atomic: a
// character resolves Move/Minor/Major as a unit before any other character is
// activated" — and Special Actions are step 4 of the PC's OWN activation. The bug:
// companion/construct placement never registered as PC activation, so the PC could
// play → let companions act → play MORE. Ruling: within the PC's own activation,
// Specials interleave freely with its Move/Minor/Major; once any OTHER character
// acts, the PC is sealed — Specials included. Shared gate: specialActionActor
// (stats.ts), consulted by beginPlay, placeCard, and the hand UI alike.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkCz } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const czCards = CATALOG.slice(20, 25);
const compCard = CATALOG.find(c => c.type === 'Companion')!;
const mkHandComp = (id: string, name: string): Card => ({
  id, name, level: 1, type: 'Companion', subtype: '', rarity: 'Common', class1: 'Builder',
  class2: '', attack: 2, hp: 3, anchor: null, actionSub: '', actionPM: '', itemKind: '',
  keywords: [], text: '', flavor: '',
} as unknown as Card);

/** PC on board, two companions in hand, Builder CZ, action phase. */
function seed(extraBoard: Record<string, ReturnType<typeof mkComp>> = {}, p2Board: Record<string, ReturnType<typeof mkComp>> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: [mkHandComp('hc-a', 'Recruit A'), mkHandComp('hc-b', 'Recruit B')],
      deck: CATALOG.slice(30, 33), board: { f2: mkPc('pc-1', { atk: 2 }), ...extraBoard },
      classZone: czCards.map((c, i) => mkCz(c, 'Builder', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2Board, hand: [] },
  } }));
}
const play = (cardId: string, slot: string) => { gs.getState().beginPlay(cardId); gs.getState().placeCard(slot as never); };
const p1 = () => gs.getState().game.p1;

describe('Special Actions are part of the PC\'s atomic activation (Rules Note 2026-07-15)', () => {
  it('EXPLOIT CLOSED: PC plays → the companion MOVES → the PC\'s second play is refused (hand + CZ untouched)', () => {
    seed();
    play('hc-a', 'b1');
    expect(p1().board.b1?.name, 'first play landed').toBe('Recruit A');
    // The freshly played companion moves — another character acts → the PC seals.
    gs.setState({ pending: { action: 'move', charId: p1().board.b1!.id } });
    gs.getState().resolveMove('b2' as never);
    expect(p1().board.b2?.name, 'companion moved').toBe('Recruit A');
    const handBefore = p1().hand.length;
    const faceDownBefore = p1().classZone.filter(c => c.faceDown).length;
    play('hc-b', 'b1');
    expect(p1().board.b1, 'second play REFUSED').toBeUndefined();
    expect(gs.getState().toasts.at(-1)?.msg).toContain('Activation already finished');
    expect(p1().hand.length, 'card stays in hand').toBe(handBefore);
    expect(p1().classZone.filter(c => c.faceDown).length, 'no CZ card spent').toBe(faceDownBefore);
    expect(gs.getState().pendingPlay, 'arming refused too (beginPlay gate)').toBeNull();
  });

  it('Zealous variant: the played companion ATTACKS instead — same seal, same refusal', () => {
    seed({}, { f1: mkComp('tgt', compCard.name, { hp: 9 }) });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      hand: [{ ...mkHandComp('hc-z', 'Zealous Recruit'), keywords: ['Zealous'] } as Card, mkHandComp('hc-b', 'Recruit B')] } } }));
    play('hc-z', 'b1');
    const zid = p1().board.b1!.id;
    gs.setState({ pending: { action: 'attack', charId: zid } });
    gs.getState().resolveAttack('tgt');
    expect(gs.getState().game.p2.board.f1?.hp, 'Zealous attack landed').toBe(7);
    play('hc-b', 'b2');
    expect(p1().board.b2, 'post-attack play refused').toBeUndefined();
    expect(gs.getState().toasts.at(-1)?.msg).toContain('Activation already finished');
  });

  it('INTERLEAVE WITHIN the PC\'s activation stays legal: play → PC attacks → play again (ruling: no intra-activation ordering on Specials)', () => {
    seed({}, { f1: mkComp('tgt', compCard.name, { hp: 9 }) });
    play('hc-a', 'b1');
    gs.setState({ pending: { action: 'attack', charId: 'pc-1' } });
    gs.getState().resolveAttack('tgt');
    expect(gs.getState().game.p2.board.f1?.hp, 'PC attack landed mid-activation').toBe(7);
    play('hc-b', 'b3');
    expect(p1().board.b3?.name, 'second Special after the PC\'s own Major — legal').toBe('Recruit B');
  });

  it('SYMMETRY: a companion mid-activation is sealed by the PC\'s Special Action, like any character switch', () => {
    seed({ f1: mkComp('vet', compCard.name, { atk: 2, fresh: false }) }, { f1: mkComp('tgt', compCard.name, { hp: 9 }) });
    // The companion moves (mid-activation: currentActor = vet, not yet finished).
    // f1's adjacent empty slot is b1 (f2 holds the PC).
    gs.setState({ pending: { action: 'move', charId: 'vet' } });
    gs.getState().resolveMove('b1' as never);
    expect(p1().board.b1?.name, 'companion moved').toBe(compCard.name);
    // The PC takes a Special Action → the companion's activation is sealed.
    play('hc-a', 'b3');
    expect(p1().board.b3?.name, 'PC Special legal (PC was not sealed)').toBe('Recruit A');
    gs.getState().beginAttack('vet');
    expect(gs.getState().pending, 'sealed companion cannot act further').toBeNull();
    expect(gs.getState().toasts.at(-1)?.msg).toContain('already finished its activation');
  });

  it('resets next turn: after the seal, a full round later the PC plays normally again', () => {
    seed();
    play('hc-a', 'b1');
    gs.setState({ pending: { action: 'move', charId: p1().board.b1!.id } });
    gs.getState().resolveMove('b2' as never);
    play('hc-b', 'b1');
    expect(p1().board.b1, 'sealed this turn').toBeUndefined();
    gs.getState().endTurn(); // p1 → p2
    gs.getState().endTurn(); // p2 → p1 (finishedActors reset each endTurn)
    gs.setState(s => ({ game: { ...s.game, currentPhase: 'action' } }));
    play('hc-b', 'b1');
    expect(p1().board.b1?.name, 'fresh turn — the PC acts again').toBe('Recruit B');
  });
});
