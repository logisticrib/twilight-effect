// FLEEING IS A SACRIFICE (re-rule, owner 2026-07-20). A companion that flees
// (Level > current Willpower at turn start) is SACRIFICED — it dies: death
// triggers fire, the exit carries the sacrifice cause, and everything in the
// Dead Zone died to get there. SUPERSEDES the arc-5 audit's classification of
// fleeing as a non-sacrifice exit (b7eb834 era — that classification lived in
// the audit record and GRU's sacrifice-events note, both amended dated; no test
// ever pinned flee-fires-nothing, so these are the first flee-event pins).
// Rules Note (2026-07-20) in GRU §Companion Fleeing.
// Scope texts, verbatim: Siegeworks — "When one of your Physical Constructs is
// sacrificed, draw a card." (a fleeing companion is not a Physical Construct);
// OATHSWORN — "When this permanent leaves the encounter, return the sworn card
// to your hand." (death and flee are both leaves — same handling, canon-backed).
import { describe, it, expect, afterEach } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkItem } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const baitCard = CATALOG.find(c => c.type === 'Action')!;

const mkManifest = (id: string, name: string, anchors: number, over: Parameters<typeof mkComp>[2] = {}) =>
  ({ ...mkComp(id, name, { subtype: 'Manifest', statuses: ['manifest'], ...over }), anchors });

afterEach(() => {
  for (let i = CATALOG.length - 1; i >= 0; i--) {
    if (String(CATALOG[i].id).startsWith('syn-fs-')) CATALOG.splice(i, 1);
  }
});

/** p1 ends the turn; p2 is the readied player whose flee check we observe.
 *  Level 9 always exceeds any Willpower these games reach. */
function seedP2(board: Record<string, ReturnType<typeof mkComp>>, dead: Card[] = []) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board, dead } } }));
  return { hand: gs.getState().game.p2.hand.length };
}
const p2 = () => gs.getState().game.p2;
const deadNames = () => p2().dead.map(c => c.name);

describe('fleeing is a sacrifice (re-rule, owner 2026-07-20)', () => {
  it('pin 1 — death triggers FIRE on a flee: the fleeing Memory Stone bearer arms its recovery pick, and the transfer window still opens (2026-07-08: all exits)', () => {
    seedP2({ f1: mkComp('bearer', compCard.name, { level: 9,
      loadout: { weapon: null, gear: [mkItem('ms', 'Memory Stone'), null] },
    }) }, [baitCard]);
    gs.getState().endTurn();
    const g = gs.getState().game;
    expect(g.p2.board.f1, 'bearer fled — sacrificed off the board').toBeUndefined();
    expect(deadNames(), 'bearer died to get to the Dead Zone').toContain(compCard.name);
    expect(deadNames(), 'its Memory Stone buried with it').toContain('Memory Stone');
    expect(g.pendingDeadPick?.source, 'Memory Stone onDestroy FIRED on the flee-sacrifice').toBe('Memory Stone');
    expect(g.pendingItemTransferQueue.length, 'the Item Transfer window still opens (all exits)').toBeGreaterThan(0);
  });

  it('pin 2 — Siegeworks does NOT draw for a fleeing companion (Physical-Construct-scoped text)', () => {
    const before = seedP2({
      f1: mkConstruct('siege', 'Siegeworks', 4, { subtype: 'Fortification' }),
      b1: mkComp('coward', compCard.name, { level: 9 }),
    });
    gs.getState().endTurn();
    expect(deadNames(), 'companion fled (sacrificed)').toContain(compCard.name);
    expect(p2().hand.length, 'turn draw ONLY — the flee-sacrifice is not a Physical Construct').toBe(before.hand + 1);
    expect(p2().board.f1?.anchors, 'Siegeworks itself decayed 4 → 3').toBe(3);
  });

  it('pin 3 — the Manifest collision dissolves: a decay-surviving Manifest that fails the Willpower check is SACRIFICED (leave-as-sacrifice satisfied), death triggers included', () => {
    seedP2({ f1: mkManifest('mani', 'Translocation Circle', 3, { level: 9,
      loadout: { weapon: null, gear: [mkItem('ms', 'Memory Stone'), null] },
    }) }, [baitCard]);
    gs.getState().endTurn();
    const g = gs.getState().game;
    expect(g.p2.board.f1, 'Manifest survived decay (3→2) but fled — sacrificed').toBeUndefined();
    expect(deadNames()).toContain('Translocation Circle');
    expect(g.pendingDeadPick?.source, 'its Memory Stone death trigger fired — a real sacrifice').toBe('Memory Stone');
  });

  it('pin 4 — LAST GASP still composes: the doomed companion fires its start-of-turn ability BEFORE the flee-sacrifice', () => {
    CATALOG.push({ id: 'syn-fs-herald', name: 'Sworn Herald', level: 9, type: 'Companion',
      subtype: '', rarity: 'Common', class1: 'Warrior', class2: '', attack: 1, hp: 3,
      anchor: null, actionSub: '', actionPM: '', itemKind: '', keywords: [], text: '', flavor: '',
      effects: [{ trigger: 'startOfTurn', effects: [{ op: 'draw', count: 1 }] }],
    } as unknown as Card);
    const before = seedP2({ f1: mkComp('herald', 'Sworn Herald', { level: 9,
      loadout: { weapon: null, gear: [mkItem('ms', 'Memory Stone'), null] },
    }) }, [baitCard]);
    gs.getState().endTurn();
    expect(p2().hand.length, 'its tick draw + the turn draw').toBe(before.hand + 2);
    expect(gs.getState().game.pendingDeadPick?.source, 'then it dies with its death trigger').toBe('Memory Stone');
    expect(deadNames()).toContain('Sworn Herald');
  });

  it('pin 5 — Oathsworn: the sworn card returns to hand on a flee (canon: "When this permanent leaves the encounter, return the sworn card to your hand.")', () => {
    const swornCard = CATALOG[7];
    const before = seedP2({ f1: mkComp('oath', compCard.name, { level: 9, sworn: swornCard }) });
    gs.getState().endTurn();
    expect(p2().hand.map(c => c.id), 'sworn card back to hand').toContain(swornCard.id);
    expect(p2().hand.length, 'sworn return + turn draw').toBe(before.hand + 2);
    expect(deadNames(), 'the Oathsworn body died').toContain(compCard.name);
    expect(p2().dead.map(c => c.id), 'sworn card NOT buried').not.toContain(swornCard.id);
  });
});
