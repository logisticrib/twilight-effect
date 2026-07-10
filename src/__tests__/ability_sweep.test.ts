// PERMANENT sweep (owner directive 2026-07-08): every activated ability in the card
// pool must, when driven in a legal state, either (a) pay its cost and resolve its
// effect with the cards in the expected zones, or (b) refuse EXPLICITLY with a
// user-visible toast. ZERO silent outcomes. The sweep enumerates the catalog
// dynamically, so newly minted activated abilities are covered automatically.
//
// Also pins the cost-payment contract for EVERY Cost kind in the schema (via
// synthetic catalog cards): unpayable costs refuse BEFORE paying; the two kinds the
// engine cannot pay at all ('sacrifice', 'discard') refuse loudly and are rejected
// by the mint-gate. Self-sacrifice routes through destroyEntity — the same exit path
// as every other departure — so items reach the Dead Zone and the Item Transfer
// window applies (owner directive: no parallel exit path).
import { describe, it, expect, afterEach } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkItem } from './helpers';
import { gatherActivated } from '../store/gameStore';
import { validateCards } from '../data/validateCards';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];
const PHYS = CATALOG.find(c => c.type === 'Construct' && /Fortification|Trap/.test(c.subtype ?? ''))!;
const MAGIC = CATALOG.find(c => c.type === 'Construct' && /Incantation/.test(c.subtype ?? ''))!;

/** A target-rich legal arena: own companion + own physical construct, enemy front +
 *  back characters + an enemy magical construct — every current TargetSpec an
 *  activated ability uses has at least one legal target here. */
function arena(bearer: { ent: ReturnType<typeof mkComp>; slot: 'f1' | 'b2' }) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, selected: null,
    p1: { ...s.game.p1, board: {
      [bearer.slot]: bearer.ent,
      f2: mkConstruct('sw-phys', PHYS.name, 3, { subtype: PHYS.subtype }),
      b1: mkComp('sw-own2', compCard2.name),
      ...(bearer.slot !== 'f1' ? { f1: mkComp('sw-own1', compCard.name) } : {}),
    } },
    p2: { ...s.game.p2, board: {
      f1: mkComp('sw-foe', compCard2.name, { hp: 9 }),
      b2: mkComp('sw-backfoe', compCard.name, { hp: 9 }),
      b3: mkConstruct('sw-magic', MAGIC.name, 3, { subtype: MAGIC.subtype }),
    } },
  } }));
}

/** Mount `card`'s activated abilities on a legal bearer; returns the bearer's id. */
function mount(card: Card): string {
  if (card.type === 'Item') {
    const holder = mkComp('sw-bearer', compCard.name, {
      loadout: { weapon: null, gear: [mkItem('sw-item', card.name), null] },
    });
    arena({ ent: holder, slot: 'f1' });
    return 'sw-bearer';
  }
  if (card.type === 'Construct') {
    arena({ ent: mkConstruct('sw-bearer', card.name, 3, { subtype: card.subtype }), slot: 'b2' });
    return 'sw-bearer';
  }
  arena({ ent: mkComp('sw-bearer', card.name), slot: 'f1' }); // Companion (or PC-ish)
  return 'sw-bearer';
}

const activatedCards = CATALOG.filter(c => (c.effects ?? []).some(ce => ce.trigger === 'activated'));

describe('sweep: every activated ability resolves or refuses loudly (no silent outcomes)', () => {
  it('the pool has activated abilities to sweep (guard against a silently empty sweep)', () => {
    expect(activatedCards.length).toBeGreaterThanOrEqual(5);
  });

  for (const card of activatedCards) {
    it(`${card.name} (${card.type}): every ability index pays, resolves, or refuses with a toast`, () => {
      const bearerId = mount(card);
      const bearer = gs.getState().game.p1.board[card.type === 'Construct' ? 'b2' : 'f1']!;
      const abilities = gatherActivated(bearer);
      expect(abilities.length, 'bearer exposes the authored abilities').toBeGreaterThan(0);

      for (let i = 0; i < abilities.length; i++) {
        mount(card); // fresh arena per index
        const before = JSON.stringify(gs.getState().game);
        const toastsBefore = gs.getState().toasts.length;
        gs.getState().activateAbility(bearerId, i);

        let after = gs.getState();
        if (after.pendingActionTarget) {
          // Target armed — resolving it must change the game.
          gs.getState().resolveActionTarget(after.pendingActionTarget.eligibleIds[0]);
          after = gs.getState();
          expect(after.pendingActionTarget, `${card.name}[${i}]: target resolved`).toBeNull();
        }
        const changed = JSON.stringify(after.game) !== before;
        const toasted = after.toasts.length > toastsBefore;
        expect(changed || toasted, `${card.name}[${i}]: SILENT outcome — no state change, no toast`).toBe(true);

        // Cost contract: a paid sacrificeSelf puts the source card in the Dead Zone.
        const ab = abilities[i];
        if (ab.cost?.kind === 'sacrificeSelf' && changed) {
          expect(after.game.p1.dead.some(c => c.name === ab.sourceName),
            `${card.name}[${i}]: sacrificed source reached the Dead Zone`).toBe(true);
          if (ab.itemId) {
            const holder = after.game.p1.board.f1;
            expect(holder?.loadout?.gear.some(g2 => g2?.name === ab.sourceName) || holder?.loadout?.weapon?.name === ab.sourceName,
              `${card.name}[${i}]: sacrificed item left the loadout`).toBe(false);
          } else {
            expect(Object.values(after.game.p1.board).some(e => e?.id === bearerId),
              `${card.name}[${i}]: sacrificed entity left the board`).toBe(false);
          }
        }
      }
    });
  }

  it('with NO legal target, a targeted sacrifice ability refuses BEFORE paying (Quill keeps its quill)', () => {
    freshGame();
    const holder = mkComp('nt-holder', compCard.name, {
      loadout: { weapon: null, gear: [mkItem('nt-quill', 'Quill of Unmaking'), null] },
    });
    // No constructs anywhere — the bounce has no legal target.
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: holder } },
      p2: { ...s.game.p2, board: { f1: mkComp('nt-foe', compCard2.name) } },
    } }));
    const toastsBefore = gs.getState().toasts.length;
    gs.getState().activateAbility('nt-holder', 0);
    const after = gs.getState();
    expect(after.toasts.length, 'explicit refusal toast').toBeGreaterThan(toastsBefore);
    expect(after.toasts[after.toasts.length - 1].msg).toMatch(/no legal target/i);
    expect(after.game.p1.board.f1?.loadout?.gear[0]?.name, 'cost NOT paid — quill retained').toBe('Quill of Unmaking');
    expect(after.game.p1.dead.some(c => c.name === 'Quill of Unmaking'), 'nothing buried').toBe(false);
  });

  it('self-sacrifice is a REAL exit: an item-bearing sacrificer opens the Item Transfer window', () => {
    freshGame();
    // Synthetic companion card whose ability self-sacrifices (none shipped carries
    // both sacrificeSelf and items, so pin the exit-path contract synthetically).
    const synth = { ...compCard, id: '__synth-sacself', name: '__Martyr',
      effects: [{ trigger: 'activated' as const, cost: { kind: 'sacrificeSelf' as const }, effects: [{ op: 'draw' as const, count: 1 }] }] };
    (CATALOG as Card[]).push(synth as Card);
    try {
      const bearer = mkComp('ms-bearer', '__Martyr', {
        loadout: { weapon: mkItem('ms-sword', 'Iron Sword'), gear: [null, null] },
      });
      const rescuer = mkComp('ms-resc', compCard2.name, { loadout: { weapon: null, gear: [null, null] } });
      gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: bearer, f2: rescuer } } } }));
      gs.getState().activateAbility('ms-bearer', 0);
      const g = gs.getState().game;
      expect(g.p1.board.f1, 'sacrificer left the board').toBeUndefined();
      expect(g.p1.dead.some(c => c.name === 'Iron Sword'), 'its ITEM reached the Dead Zone (was lost by the old inline removal)').toBe(true);
      expect(g.pendingItemTransfer?.lp, 'Item Transfer window opened — same exit path as any departure').toBe('p1');
      expect(g.pendingItemTransfer?.items.map(x => x.name)).toEqual(['Iron Sword']);
    } finally {
      (CATALOG as Card[]).splice(CATALOG.findIndex(c => c.id === '__synth-sacself'), 1);
    }
  });
});

describe('cost-kind payment contract (synthetic cards — every schema kind)', () => {
  const pushSynth = (name: string, cost: unknown, effects: unknown[] = [{ op: 'draw', count: 1 }]): Card => {
    const synth = { ...compCard, id: `__synth-${name}`, name: `__${name}`,
      effects: [{ trigger: 'activated', cost, effects }] } as unknown as Card;
    (CATALOG as Card[]).push(synth);
    return synth;
  };
  afterEach(() => {
    for (let i = CATALOG.length - 1; i >= 0; i--) {
      if (CATALOG[i].id.startsWith('__synth-')) (CATALOG as Card[]).splice(i, 1);
    }
  });
  const seed = (bearer: ReturnType<typeof mkComp>) => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: bearer } } } }));
  };
  const lastToast = () => gs.getState().toasts[gs.getState().toasts.length - 1]?.msg ?? '';

  // 'sacrifice'/'discard' were REMOVED from the Cost schema (owner ruling 2026-07-08 —
  // no engine payment path existed; re-add with engine support). Deck JSON is not
  // type-checked, so the ENGINE must still refuse them at runtime (never cost-free),
  // and the mint-gate rejects them as unknown cost shapes.
  it('removed cost kinds reaching runtime as legacy data refuse loudly (never cost-free)', () => {
    for (const cost of [{ kind: 'sacrifice', target: 'ownCompanion' }, { kind: 'discard', count: 1 }]) {
      pushSynth(`unpayable-${(cost as { kind: string }).kind}`, cost);
      const bearer = mkComp('cp-bearer', `__unpayable-${(cost as { kind: string }).kind}`);
      seed(bearer);
      const before = JSON.stringify(gs.getState().game);
      gs.getState().activateAbility('cp-bearer', 0);
      expect(JSON.stringify(gs.getState().game), 'nothing changed (the old code resolved the ability COST-FREE)').toBe(before);
      expect(lastToast()).toMatch(/not supported by the engine/i);
    }
  });

  it('the mint-gate rejects the removed cost kinds as unknown shapes', () => {
    const bad1 = pushSynth('mint-sac', { kind: 'sacrifice', target: 'ownCompanion' });
    const bad2 = pushSynth('mint-disc', { kind: 'discard', count: 1 });
    const problems = validateCards([bad1, bad2], []);
    expect(problems.filter(p => /bad cost/i.test(p)).length, 'both rejected at mint').toBe(2);
  });

  it("'payHP' refuses a lethal payment BEFORE paying; pays when survivable", () => {
    pushSynth('payhp', { kind: 'payHP', amount: 3 });
    const poor = mkComp('cp-poor', '__payhp', { hp: 3, maxHp: 5 });
    seed(poor);
    gs.getState().activateAbility('cp-poor', 0);
    expect(gs.getState().game.p1.board.f1?.hp, 'lethal cost refused — HP untouched').toBe(3);
    expect(lastToast()).toMatch(/not enough HP/i);

    const rich = mkComp('cp-rich', '__payhp', { hp: 5, maxHp: 5 });
    seed(rich);
    gs.getState().activateAbility('cp-rich', 0);
    expect(gs.getState().game.p1.board.f1?.hp, 'cost paid').toBe(2);
  });

  it("'exhaustSelf' refuses when already exhausted (construct — characters gate earlier)", () => {
    pushSynth('exh', { kind: 'exhaustSelf' });
    freshGame();
    const tired = mkConstruct('cp-tired', '__exh', 3, { exhausted: true, tapped: 'major' });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { b1: tired } } } }));
    const before = JSON.stringify(gs.getState().game);
    gs.getState().activateAbility('cp-tired', 0);
    expect(JSON.stringify(gs.getState().game)).toBe(before);
    expect(lastToast()).toMatch(/exhaust cost/i);
  });

  it("'removeAnchor' refuses when short; paying the LAST anchor sacrifices (engine default — pins current state)", () => {
    pushSynth('anch', { kind: 'removeAnchor', count: 2 });
    freshGame();
    const low = mkConstruct('cp-low', '__anch', 1);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { b1: low } } } }));
    gs.getState().activateAbility('cp-low', 0);
    expect(gs.getState().game.p1.board.b1?.anchors, 'insufficient anchors — refused, unpaid').toBe(1);
    expect(lastToast()).toMatch(/not enough Anchor/i);

    freshGame();
    const exact = mkConstruct('cp-exact', '__anch', 2);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { b1: exact } } } }));
    gs.getState().activateAbility('cp-exact', 0);
    const g = gs.getState().game;
    expect(g.p1.board.b1, 'last anchor paid → construct sacrificed (consistent with the anchor op)').toBeUndefined();
    expect(g.p1.dead.some(c => c.name === '__anch'), 'sacrificed card in the Dead Zone').toBe(true);
  });
});

describe('the ✕ Sacrifice affordance is a real exit (was adjustHp(-999): a silent no-op)', () => {
  it('sacrificing a construct moves it to the Dead Zone', () => {
    freshGame();
    const wall = mkConstruct('sx-wall', PHYS.name, 3, { subtype: PHYS.subtype });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f2: wall } } } }));
    gs.getState().sacrificeEntity('sx-wall');
    const g = gs.getState().game;
    expect(g.p1.board.f2, 'construct left the board (adjustHp(-999) left it at 0 HP forever)').toBeUndefined();
    expect(g.p1.dead.some(c => c.name === PHYS.name), 'card in the Dead Zone').toBe(true);
  });

  it('sacrificing an item-bearing companion opens the Item Transfer window', () => {
    freshGame();
    const bearer = mkComp('sx-bearer', compCard.name, { loadout: { weapon: mkItem('sx-sword', 'Iron Sword'), gear: [null, null] } });
    const rescuer = mkComp('sx-resc', compCard2.name, { loadout: { weapon: null, gear: [null, null] } });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: bearer, f2: rescuer } } } }));
    gs.getState().sacrificeEntity('sx-bearer');
    const g = gs.getState().game;
    expect(g.p1.board.f1).toBeUndefined();
    expect(g.pendingItemTransfer?.items.map(x => x.name), 'rescue window opened').toEqual(['Iron Sword']);
  });
});
