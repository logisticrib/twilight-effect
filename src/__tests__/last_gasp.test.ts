// LAST GASP (owner ruling 2026-07-20): "At the start of your turn" triggered
// abilities of ALL permanents in the encounter at the start of the turn fire
// BEFORE the Ready Phase removals — Anchor decay sacrifices AND Willpower flee
// exits (both exits, one rule). A construct on its last counter ticks one final
// time before it dies; a companion about to flee fires before it goes. The
// engine previously ran removals-first inside the ready pass (the last-counter
// construct never ticked) — this was the unruled gap, now ruled and encoded.
// Rules Note (2026-07-20) in Game_Rules_Updated §Turn Structure Ready Phase.
import { describe, it, expect, afterEach } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const compCard = CATALOG.find(c => c.type === 'Companion')!;

afterEach(() => {
  for (let i = CATALOG.length - 1; i >= 0; i--) {
    if (String(CATALOG[i].id).startsWith('syn-lg-')) CATALOG.splice(i, 1);
  }
});

/** p1 ends the turn; p2 is the readied player whose Ready Phase we observe. */
function seedP2(board: Record<string, ReturnType<typeof mkComp>>, dead: Card[] = []) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board, dead } } }));
  return { hand: gs.getState().game.p2.hand.length };
}
const p2 = () => gs.getState().game.p2;
const deadNames = () => p2().dead.map(c => c.name);

describe('LAST GASP — start-of-turn triggers fire before Ready Phase removals (owner 2026-07-20)', () => {
  it('pin 1 — a construct on its LAST Anchor ticks once more, then crumbles (real card: Convergence Sigil, "At the start of your turn, draw a card.")', () => {
    const before = seedP2({ f1: mkConstruct('sigil', 'Convergence Sigil', 1, { subtype: 'Incantation' }) });
    gs.getState().endTurn();
    expect(p2().hand.length, 'sigil tick draw + turn draw').toBe(before.hand + 2);
    expect(p2().board.f1, 'sigil still crumbles after its last gasp').toBeUndefined();
    expect(deadNames(), 'sacrificed to the Dead Zone').toContain('Convergence Sigil');
  });

  it('pin 2 — decay still applies AFTER the trigger: a 2-Anchor Sigil ticks and survives at 1 (removal regression)', () => {
    const before = seedP2({ f1: mkConstruct('sigil', 'Convergence Sigil', 2, { subtype: 'Incantation' }) });
    gs.getState().endTurn();
    expect(p2().hand.length, 'tick draw + turn draw').toBe(before.hand + 2);
    expect(p2().board.f1?.anchors, 'decay applied after the trigger').toBe(1);
  });

  it('pin 3 — the deferred prompt variant: Library of Memory on its last Anchor arms its Dead-Zone pick, then crumbles (the retired-t9 board)', () => {
    const bait = CATALOG.find(c => c.type === 'Action')!;
    seedP2({ f1: mkConstruct('lib', 'Library of Memory', 1, { subtype: 'Incantation' }) }, [bait]);
    gs.getState().endTurn();
    const dp = gs.getState().game.pendingDeadPick;
    expect(dp?.source, 'recovery pick armed by the dying Library').toBe('Library of Memory');
    expect(deadNames(), 'Library still crumbles after arming it').toContain('Library of Memory');
  });

  it('pin 4 — a companion about to FLEE fires its start-of-turn ability before it goes (both exits, one rule)', () => {
    CATALOG.push({ id: 'syn-lg-herald', name: 'Doomed Herald', level: 9, type: 'Companion',
      subtype: '', rarity: 'Common', class1: 'Warrior', class2: '', attack: 1, hp: 3,
      anchor: null, actionSub: '', actionPM: '', itemKind: '', keywords: [], text: '', flavor: '',
      effects: [{ trigger: 'startOfTurn', effects: [{ op: 'draw', count: 1 }] }],
    } as unknown as Card);
    const before = seedP2({ f1: mkComp('herald', 'Doomed Herald', { level: 9 }) });
    gs.getState().endTurn();
    expect(p2().hand.length, 'herald fires (draw) + turn draw').toBe(before.hand + 2);
    expect(p2().board.f1, 'then it still flees — Level 9 exceeds any Willpower here').toBeUndefined();
    expect(deadNames()).toContain('Doomed Herald');
  });

  it('pin 5 — arc-5 interop: a last-counter PHYSICAL construct under a Siegeworks both TICKS and triggers the on-sacrifice draw', () => {
    CATALOG.push({ id: 'syn-lg-spike', name: 'Doomed Spikework', level: 2, type: 'Construct',
      subtype: 'Fortification', rarity: 'Common', class1: 'Builder', class2: '', attack: 0, hp: 0,
      anchor: 1, actionSub: '', actionPM: '', itemKind: '', keywords: [], text: '', flavor: '',
      effects: [{ trigger: 'startOfTurn', effects: [{ op: 'draw', count: 1 }] }],
    } as unknown as Card);
    const before = seedP2({
      f1: mkConstruct('spike', 'Doomed Spikework', 1, { subtype: 'Fortification' }),
      f2: mkConstruct('siege', 'Siegeworks', 4, { subtype: 'Fortification' }),
    });
    gs.getState().endTurn();
    expect(p2().hand.length, 'spike tick + Siegeworks on-sacrifice draw + turn draw').toBe(before.hand + 3);
    expect(deadNames(), 'spikework sacrificed').toContain('Doomed Spikework');
    expect(p2().board.f2?.anchors, 'Siegeworks itself decayed 4 → 3').toBe(3);
  });
});
