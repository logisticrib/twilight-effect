// REQUIEM deck — Arc B (CRESCENDO), 2026-08-25. Seven cards convert from DEV
// NOT-IMPLEMENTED to live: Emberlight Busker (conditional Ranged), Satyr of the Reel
// (the OWNER-RULED mid-combat target pick), Skald of the Long Dusk (startOfTurn
// conditional draw), Duskmere Siren (entry-snapshot bounce, levelAtMost), Encore of
// the Dawn (additive-'instead' cast-time gate), Standing Ovation (ready up-to-two,
// maxIf), Gilded Lute (bearer-controller item clause).
//
// RULES UNDER TEST:
// - CRESCENDO (MKL, ratified 2026-08-25): "While you control a Vocal Construct in
//   the encounter, your characters are in Crescendo." CONTROLLER-scoped (the
//   opponent's songs never help you), KEYWORD-INDEPENDENT, derived on read.
// - Vocal family = subtype ∈ {Chant, Song, Rite, Blessing, Utterance, Dirge} — a
//   Druid Rite powers a Bard's Crescendo (isVocalConstruct, one classifier).
// - The mid-combat pick (owner-ruled this arc): a targeted onAttack clause pauses
//   the DECLARED attack on the stack (pendingCombatPick, the forced-sacrifice
//   discipline); damage resolves only after the pick (R2 order).
// Assertions read real state (keywords/attack/hand/deck/board), never toasts alone.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { effectiveKeywords, effectiveAttack, inCrescendo } from '../store/gameStore';
import { resolveStartOfTurn } from '../engine';
import { CATALOG, REQUIEM_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';
import type { SlotId } from '../engine';

const rc = (name: string): Card => {
  const c = REQUIEM_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`Requiem card missing: ${name}`);
  return c;
};
const czCards = CATALOG.slice(20, 25);
const song = (id = 'song') => mkConstruct(id, 'Song of Hearthlight', 3, { subtype: 'Song' });

function seed(p1board: Record<string, ReturnType<typeof mkComp>>,
              p2board: Record<string, ReturnType<typeof mkComp>> = { b2: mkPc('pc-2') },
              p1over: { hand?: Card[]; deck?: Card[] } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: p1over.hand ?? [], board: p1board,
      deck: p1over.deck ?? s.game.p1.deck,
      classZone: czCards.map((c, i) => mkCz(c, 'Bard', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2board },
  } }));
}
const g = () => gs.getState().game;
const place = (card: Card, slot: SlotId) => {
  gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};
const play = (card: Card) => {
  // playAction reads the acting character from the live selection — select the PC.
  gs.setState(s => ({ game: { ...s.game, selected: 'pc-1', p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().playAction(card.id);
};
const filler = CATALOG.filter(c => c.type === 'Companion' && !c.dev).slice(0, 6);

describe('the CRESCENDO predicate — controller-scoped, keyword-independent, Vocal-family-wide', () => {
  it('false with no construct; true with an own Song; FALSE when only the OPPONENT has one', () => {
    seed({ b3: mkPc('pc-1') });
    expect(inCrescendo(g(), 'p1')).toBe(false);
    seed({ b3: mkPc('pc-1'), f2: song() });
    expect(inCrescendo(g(), 'p1')).toBe(true);
    seed({ b3: mkPc('pc-1') }, { b2: mkPc('pc-2'), f2: song('opp-song') });
    expect(inCrescendo(g(), 'p1'), "the opponent's song is THEIR performance").toBe(false);
    expect(inCrescendo(g(), 'p2'), '…and powers THEIR Crescendo').toBe(true);
  });

  it("a Druid RITE counts — the Vocal family, not the Bard's subtypes alone", () => {
    seed({ b3: mkPc('pc-1'), f2: mkConstruct('rite', 'Chorus of the Understory', 2, { subtype: 'Rite' }) });
    expect(inCrescendo(g(), 'p1')).toBe(true);
  });

  it('a MAGIC construct (Incantation) does not count', () => {
    seed({ b3: mkPc('pc-1'), f2: mkConstruct('inc', 'Lingering Spark', 2, { subtype: 'Incantation' }) });
    expect(inCrescendo(g(), 'p1')).toBe(false);
  });
});

describe('Emberlight Busker — conditional Ranged, derived on read (nothing stamped)', () => {
  it('has Ranged only while a song stands; the grant vanishes when the song leaves', () => {
    seed({ b3: mkPc('pc-1'), b1: mkComp('busker', 'Emberlight Busker', { atk: 1, hp: 1 }), f2: song() });
    const busker = () => g().p1.board.b1!;
    expect(effectiveKeywords(busker(), g())).toContain('Ranged');
    // The song leaves — no cleanup step, the next read simply answers differently.
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { b3: s.game.p1.board.b3!, b1: s.game.p1.board.b1! } } } }));
    expect(effectiveKeywords(busker(), g())).not.toContain('Ranged');
  });
});

describe('Skald of the Long Dusk — startOfTurn draw, clause-if honored through permanentEffects', () => {
  it('draws the extra card only in Crescendo', () => {
    const [A, B] = filler;
    seed({ b3: mkPc('pc-1'), f1: mkComp('skald', 'Skald of the Long Dusk') }, undefined, { deck: [A, B] });
    let r = resolveStartOfTurn(g(), 'p1');
    expect(r.game.p1.hand.length, 'no song — no extra draw').toBe(0);
    seed({ b3: mkPc('pc-1'), f1: mkComp('skald', 'Skald of the Long Dusk'), f2: song() }, undefined, { deck: [A, B] });
    r = resolveStartOfTurn(g(), 'p1');
    expect(r.game.p1.hand.map(c => c.id), 'in Crescendo — the additional draw').toEqual([A.id]);
  });

  it('COLLISION with Arc A: the extra draw at an empty deck is a MANDATORY draw — the Skald deck-outs his own controller', () => {
    seed({ b3: mkPc('pc-1'), f1: mkComp('skald', 'Skald of the Long Dusk'), f2: song() }, undefined, { deck: [] });
    const r = resolveStartOfTurn(g(), 'p1');
    expect(r.game.gameOver, 'any mandatory draw at 0 cards loses (owner-ruled)').toBe('p2');
  });
});

describe('Duskmere Siren — entry-snapshot Crescendo + bounce levelAtMost 3', () => {
  it('with a song: the bounce pick arms and a level-4 opposing companion is EXCLUDED', () => {
    seed({ b3: mkPc('pc-1'), f2: song() },
      { b2: mkPc('pc-2'), f1: mkComp('small', filler[0].name, { level: 2 }), f3: mkComp('big', filler[1].name, { level: 4 }),
        f2: mkComp('edge', filler[2].name, { level: 3 }) });
    place(rc('Duskmere Siren'), 'b1');
    const pa = gs.getState().pendingActionTarget;
    expect(pa?.source, 'the targeted enter armed').toBe('enter');
    expect(pa?.eligibleIds).toContain('small');
    expect(pa?.eligibleIds, 'level 3 IS "3 or less" — boundary included').toContain('edge');
    expect(pa?.eligibleIds, 'level 4 > levelAtMost 3').not.toContain('big');
    gs.getState().resolveActionTarget('small');
    expect(g().p2.board.f1 ?? null, 'bounced off the board').toBeFalsy();
    expect(g().p2.hand.some(c => c.name === filler[0].name), "…to its owner's hand").toBe(true);
  });

  it('without a song: the SNAPSHOT fails — plain enter, no pick, and a song arriving later changes nothing', () => {
    seed({ b3: mkPc('pc-1') }, { b2: mkPc('pc-2'), f1: mkComp('small', filler[0].name, { level: 2 }) });
    place(rc('Duskmere Siren'), 'b1');
    expect(g().p1.board.b1?.name).toBe('Duskmere Siren');
    expect(gs.getState().pendingActionTarget ?? null, 'no pick — the enter clause was gated out').toBeFalsy();
    expect(g().p2.board.f1?.name, 'nothing bounced').toBe(filler[0].name);
  });
});

describe('Encore of the Dawn — additive-instead, gated at CAST time (onPlayEffects)', () => {
  it('draws 1 without a song, 2 with one', () => {
    const [A, B, C] = filler;
    seed({ b3: mkPc('pc-1') }, undefined, { deck: [A, B, C] });
    play(rc('Encore of the Dawn'));
    expect(g().p1.hand.map(c => c.id), 'no song: the base draw only').toEqual([A.id]);
    seed({ b3: mkPc('pc-1'), f2: song() }, undefined, { deck: [A, B, C] });
    play(rc('Encore of the Dawn'));
    expect(g().p1.hand.map(c => c.id), 'in Crescendo: "draw two instead"').toEqual([A.id, B.id]);
  });
});

describe('Standing Ovation — ready up to two while in Crescendo (readyUpTo, maxIf)', () => {
  const exhausted = (id: string, name: string) => mkComp(id, name, { exhausted: true, tapped: 'major' as const });

  it('without a song: a single ready, no second offer', () => {
    seed({ b3: mkPc('pc-1'), f1: exhausted('a', 'Weary A'), f3: exhausted('b', 'Weary B') });
    play(rc('Standing Ovation'));
    const pa = gs.getState().pendingActionTarget;
    expect(pa?.twoStep).toBe('readyUpTo');
    gs.getState().resolveActionTarget('a');
    expect(g().p1.board.f1?.exhausted, 'first target readied').toBe(false);
    expect(gs.getState().pendingActionTarget ?? null, 'maxIf failed — no second pick').toBeFalsy();
    expect(g().p1.board.f3?.exhausted, 'the other stays weary').toBe(true);
  });

  it('with a song: the second pick is OFFERED and works', () => {
    seed({ b3: mkPc('pc-1'), f1: exhausted('a', 'Weary A'), f3: exhausted('b', 'Weary B'), f2: song() });
    play(rc('Standing Ovation'));
    gs.getState().resolveActionTarget('a');
    const pa = gs.getState().pendingActionTarget;
    expect(pa?.firstId, 'second pick armed').toBe('a');
    expect(pa?.eligibleIds).not.toContain('a');
    gs.getState().resolveActionTarget('b');
    expect(g().p1.board.f1?.exhausted).toBe(false);
    expect(g().p1.board.f3?.exhausted).toBe(false);
  });

  it('the second pick is OPTIONAL — declining commits ("up to two" that took one)', () => {
    seed({ b3: mkPc('pc-1'), f1: exhausted('a', 'Weary A'), f3: exhausted('b', 'Weary B'), f2: song() });
    play(rc('Standing Ovation'));
    gs.getState().resolveActionTarget('a');
    gs.getState().cancelActionTarget();
    expect(g().p1.board.f1?.exhausted, 'the first ready STAYS').toBe(false);
    expect(g().p1.board.f3?.exhausted).toBe(true);
    expect(g().p1.dead.some(c => c.name === 'Standing Ovation'), 'the action is spent, never refunded').toBe(true);
  });
});

describe('Satyr of the Reel — the mid-combat target pick (owner-ruled 2026-08-25)', () => {
  const board = () => ({
    b3: mkPc('pc-1'),
    f1: mkComp('satyr', 'Satyr of the Reel', { atk: 2 }),
    f2: song('song-a'),
    b1: mkConstruct('song-b', 'Chant of Returning', 2, { subtype: 'Chant' }),
  });

  it('attack in Crescendo: the attack SUSPENDS on pendingCombatPick; the pick offers OWN Vocal Constructs only; damage lands only after the pick (R2)', () => {
    seed(board(), { b2: mkPc('pc-2'), f1: mkComp('vic', 'Victim', { hp: 5 }) });
    gs.getState().beginAttack('satyr');
    gs.getState().resolveAttack('vic');
    const pcp = g().pendingCombatPick;
    expect(pcp?.source, 'the pick armed').toBe('Satyr of the Reel');
    expect(pcp?.lp, "…for the ATTACKER's controller").toBe('p1');
    expect(pcp?.eligibleIds?.sort(), 'own Vocal Constructs only').toEqual(['song-a', 'song-b']);
    expect(g().p2.board.f1?.hp, 'damage NOT yet dealt — the attack is paused beneath the pick').toBe(5);
    expect(g().triggerStack?.some(e => e.kind === 'attackDamage'), 'the damage step waits on the stack').toBe(true);
    gs.getState().resolveCombatPick('song-b');
    expect(g().p1.board.b1?.anchors, 'the chosen Chant gained the anchor').toBe(3);
    expect(g().p1.board.f2?.anchors, 'the un-chosen Song did not').toBe(3);
    expect(g().p2.board.f1?.hp, 'the attack then completed — damage dealt').toBe(3);
    expect(g().pendingCombatPick ?? null).toBeFalsy();
  });

  it('NOT in Crescendo: no pause, no anchor — a plain attack (the clause is condition-gated)', () => {
    seed({ b3: mkPc('pc-1'), f1: mkComp('satyr', 'Satyr of the Reel', { atk: 2 }) },
      { b2: mkPc('pc-2'), f1: mkComp('vic', 'Victim', { hp: 5 }) });
    gs.getState().beginAttack('satyr');
    gs.getState().resolveAttack('vic');
    expect(g().pendingCombatPick ?? null, 'no pick').toBeFalsy();
    expect(g().p2.board.f1?.hp, 'damage dealt straight through').toBe(3);
  });

  it('the fizzle path is unreachable for the Satyr: in Crescendo REQUIRES a song, so an armed pick always has ≥1 option', () => {
    // Structural pin, not a scenario: the clause's gate (crescendo) and its target
    // pool (own Vocal Constructs) are the SAME set — if the gate passed, the pool is
    // non-empty. Asserted via the armed pick in the first test; here we pin that no
    // pick ever arms with zero options by construction.
    seed(board(), { b2: mkPc('pc-2'), f1: mkComp('vic', 'Victim', { hp: 5 }) });
    gs.getState().beginAttack('satyr');
    gs.getState().resolveAttack('vic');
    expect((g().pendingCombatPick?.eligibleIds?.length ?? 0) > 0).toBe(true);
    gs.getState().resolveCombatPick(g().pendingCombatPick!.eligibleIds[0]);
  });
});

describe('Gilded Lute — bearer-controller item clause (selfItemStat + crescendo)', () => {
  it('+1 attack only while the BEARER\'s controller is in Crescendo', () => {
    const bearer = mkComp('bard', 'Emberlight Busker', { atk: 1, hp: 1,
      loadout: { weapon: null, gear: [mkItem('lute', 'Gilded Lute')] } });
    seed({ b3: mkPc('pc-1'), b1: bearer, f2: song() });
    expect(effectiveAttack(g().p1.board.b1!, g()), 'song out: printed 1 + lute 1').toBe(2);
    seed({ b3: mkPc('pc-1'), b1: bearer });
    expect(effectiveAttack(g().p1.board.b1!, g()), 'no song: printed only').toBe(1);
  });
});
