// Anchor decay keys on COUNTERS, not card type (owner ruling 2026-07-20 —
// "Manifests are mortal"). Canon ANIMATE MAGIC (Master_Keyword_List, verbatim):
// "…It is no longer a Construct but retains its text and Anchor counters. If it
// would leave the encounter, sacrifice it instead." — "retains its … Anchor
// counters" means the counters remain the permanent's LIFESPAN: an animated
// Manifest keeps decaying and is sacrificed at zero. GRU Ready Phase step 3
// reworded (permanent-that-has-Anchor-counters) + Rules Note 2026-07-20.
// Confirmed NON-interactions (owner 2026-07-20, texts verbatim):
//   Master of Foundations — "Your Physical Constructs do not lose Anchor
//   counters." (Physical-Construct-scoped; does NOT protect Manifests.)
//   Siegeworks — "When one of your Physical Constructs is sacrificed, draw a
//   card." (a Manifest is not a Physical Construct; no draw for its decay.)
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkItem } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const baitCard = CATALOG.find(c => c.type === 'Action')!;

/** The animate op's output shape (interpreter `animate`): a COMPANION with subtype
 *  Manifest + the 'manifest' status, RETAINING the construct's anchors. Real card
 *  names so effectsOf/deadCardsOf resolve (Translocation Circle = activated-only
 *  text, inert here; Echoing Glyph = "At the start of your turn, draw a card."). */
const mkManifest = (id: string, name: string, anchors: number, over: Parameters<typeof mkComp>[2] = {}) =>
  ({ ...mkComp(id, name, { subtype: 'Manifest', statuses: ['manifest'], ...over }), anchors });

/** p1 ends the turn; p2 is the readied player whose Ready Phase we observe. */
function seedP2(board: Record<string, ReturnType<typeof mkComp>>, dead: Card[] = []) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board, dead } } }));
  return { hand: gs.getState().game.p2.hand.length };
}
const p2 = () => gs.getState().game.p2;
const deadNames = () => p2().dead.map(c => c.name);

describe('anchor decay keys on counters — Manifests are mortal (owner 2026-07-20)', () => {
  it('pin 1 — a Manifest decays one Anchor at its controller\'s turn start, like the construct it was', () => {
    seedP2({ f1: mkManifest('mani', 'Translocation Circle', 2) });
    gs.getState().endTurn();
    expect(p2().board.f1?.anchors, 'Manifest 2 → 1').toBe(1);
    expect(p2().board.f1?.kind, 'still the animated companion').toBe('companion');
  });

  it('pin 2 — at zero it dies by SACRIFICE: Dead Zone routing, death triggers (Memory Stone) fire, item transfer window opens', () => {
    seedP2({ f1: mkManifest('mani', 'Translocation Circle', 1, {
      loadout: { weapon: null, gear: [mkItem('ms', 'Memory Stone'), null] },
    }) }, [baitCard]);
    gs.getState().endTurn();
    const g = gs.getState().game;
    expect(g.p2.board.f1, 'Manifest crumbled — leave-as-sacrifice consistent').toBeUndefined();
    expect(deadNames(), 'its card in the Dead Zone').toContain('Translocation Circle');
    expect(deadNames(), 'equipped Memory Stone buried with it').toContain('Memory Stone');
    expect(g.pendingDeadPick?.source, 'Memory Stone onDestroy FIRED on the decay sacrifice').toBe('Memory Stone');
    expect(g.pendingItemTransferQueue.length, 'a character exit opens the transfer window').toBeGreaterThan(0);
  });

  it('pin 3 — LAST GASP composes: an animated Echoing Glyph on its last Anchor draws, THEN crumbles', () => {
    const before = seedP2({ f1: mkManifest('glyph', 'Echoing Glyph', 1) });
    gs.getState().endTurn();
    expect(p2().hand.length, 'glyph tick draw + turn draw').toBe(before.hand + 2);
    expect(p2().board.f1, 'then it still dies').toBeUndefined();
    expect(deadNames()).toContain('Echoing Glyph');
  });

  it('pin 4 — Master of Foundations does NOT protect a Manifest (Physical-Construct-scoped text)', () => {
    seedP2({
      f1: mkComp('mof', 'Master of Foundations'),
      f2: mkConstruct('fort', 'Reinforced Gate', 2, { subtype: 'Fortification' }),
      b1: mkManifest('mani', 'Translocation Circle', 2),
    });
    gs.getState().endTurn();
    expect(p2().board.f2?.anchors, 'Physical Construct protected — 2 stays 2').toBe(2);
    expect(p2().board.b1?.anchors, 'the Manifest is NOT protected — 2 → 1').toBe(1);
  });

  it('pin 5 — Siegeworks does NOT draw for a decaying Manifest (Physical-Construct-scoped text)', () => {
    const before = seedP2({
      f1: mkConstruct('siege', 'Siegeworks', 4, { subtype: 'Fortification' }),
      b1: mkManifest('mani', 'Translocation Circle', 1),
    });
    gs.getState().endTurn();
    expect(deadNames(), 'Manifest sacrificed').toContain('Translocation Circle');
    expect(p2().hand.length, 'turn draw ONLY — no Siegeworks draw for a non-Physical sacrifice').toBe(before.hand + 1);
    expect(p2().board.f1?.anchors, 'Siegeworks itself decayed 4 → 3').toBe(3);
  });

  it('pin 6 — ordinary construct decay unchanged (regression): 3 → 2, and a last-counter construct still dies', () => {
    seedP2({ f1: mkConstruct('wall', 'Test Wall', 3), f2: mkConstruct('gone', 'Reinforced Gate', 1, { subtype: 'Fortification' }) });
    gs.getState().endTurn();
    expect(p2().board.f1?.anchors, 'survivor decrements').toBe(2);
    expect(p2().board.f2, 'last-counter construct sacrificed').toBeUndefined();
    expect(deadNames()).toContain('Reinforced Gate');
  });

  it('pin 7 — a Manifest killed in combat before decay leaves normally (no double handling at the next ready)', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('att', compCard.name, { atk: 5 }) } },
      p2: { ...s.game.p2, board: { f1: mkManifest('mani', 'Translocation Circle', 3, { hp: 2, maxHp: 2 }) } },
    }, pending: { action: 'attack', charId: 'att' } }));
    gs.getState().resolveAttack('mani');
    expect(gs.getState().game.p2.board.f1, 'combat death removes it').toBeUndefined();
    expect(deadNames().filter(n => n === 'Translocation Circle').length, 'buried exactly once').toBe(1);
    gs.getState().endTurn(); // p2's ready phase — nothing left to decay or double-bury
    expect(deadNames().filter(n => n === 'Translocation Circle').length, 'still exactly once after the ready').toBe(1);
  });
});
