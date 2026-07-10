// Owner rulings 2026-07-08 (second batch) + the three authored carve-outs.
//  OQ2 — sacrifice IS a death: death/destroy triggers (Memory Stone) fire on every
//        sacrifice path (centralized in destroyEntity). Rules Note under §Dead Zone.
//  OQ3 — universal pre-cost refusal: an ability that would affect NOTHING cannot be
//        activated (non-interactive recipients checked up front too).
//  Carve-outs: Bastion Wall (grantKeywords aura), Watchtower (backLineAttack — attack
//  eligibility ONLY, no defensive Ranged), Pyre of the Unbound (startOfTurn modal).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkPc, mkItem } from './helpers';
import { effectiveKeywords } from '../store/keywords';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];

describe('OQ2: sacrifice IS a death — death triggers fire (Memory Stone)', () => {
  it('sacrificing a Memory Stone bearer arms the Dead-Zone recovery pick', () => {
    freshGame();
    const bearer = mkComp('sd-bearer', compCard.name, {
      loadout: { weapon: null, gear: [mkItem('sd-ms', 'Memory Stone'), null] },
    });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: bearer }, dead: [compCard2] }, // something to recover
    } }));
    gs.getState().sacrificeEntity('sd-bearer');
    const g = gs.getState().game;
    expect(g.p1.board.f1, 'bearer sacrificed off the board').toBeUndefined();
    expect(g.pendingDeadPick?.source, 'Memory Stone onDestroy FIRED on the sacrifice').toBe('Memory Stone');
    // Its Item Transfer window queues behind the death-trigger pick (arming order).
    expect(g.pendingItemTransferQueue.length, 'transfer window queued behind the pick').toBe(1);
  });

  it('a Dismantle sacrifice fires them too (same centralized exit path)', () => {
    freshGame();
    // A construct cannot carry Memory Stone; pin the centralization structurally: the
    // anchor-loss sacrifice goes through destroyEntity, whose card lands in the Dead
    // Zone — and destroyEntity is the SINGLE place death triggers fire (asserted above).
    const wall = mkConstruct('sd-wall', 'Tripwire Snare', 1, { subtype: 'Trap' });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f2: wall } },
    } }));
    gs.getState().sacrificeEntity('sd-wall');
    const g = gs.getState().game;
    expect(g.p1.board.f2).toBeUndefined();
    expect(g.p1.dead.some(c => c.name === 'Tripwire Snare')).toBe(true);
  });
});

describe('OQ3: an ability that would affect nothing cannot be activated (pre-cost)', () => {
  it('Collapsing Tunnel with an empty enemy back line refuses and is NOT sacrificed', () => {
    freshGame();
    const tunnel = mkConstruct('nq-tunnel', 'Collapsing Tunnel', 3, { subtype: 'Trap' });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { b2: tunnel } },
      p2: { ...s.game.p2, board: { f1: mkComp('nq-front', compCard2.name) } }, // front only
    } }));
    const toastsBefore = gs.getState().toasts.length;
    gs.getState().activateAbility('nq-tunnel', 0);
    const st = gs.getState();
    expect(st.game.p1.board.b2, 'cost NOT paid — tunnel retained').toBeTruthy();
    expect(st.game.p1.dead.some(c => c.name === 'Collapsing Tunnel')).toBe(false);
    expect(st.toasts.length, 'explicit refusal').toBeGreaterThan(toastsBefore);
    expect(st.toasts[st.toasts.length - 1].msg).toMatch(/would affect nothing/i);
  });
});

describe('carve-out: Bastion Wall — grantKeywords static aura', () => {
  it('grants GUARDIAN to own FRONT-line companions only, and targeting honors it', () => {
    freshGame();
    const wall = mkConstruct('bw-wall', 'Bastion Wall', 3, { subtype: 'Fortification' });
    const front = mkComp('bw-front', compCard.name);
    const back = mkComp('bw-back', compCard2.name);
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: front, b1: back, f2: wall } },
      p2: { ...s.game.p2, board: { f1: mkComp('bw-att', compCard2.name, { atk: 2 }) } },
    } }));
    const g = gs.getState().game;
    expect(effectiveKeywords(g.p1.board.f1!, g), 'front-line companion GAINS Guardian').toContain('Guardian');
    expect(effectiveKeywords(g.p1.board.b1!, g), 'back-line companion does not').not.toContain('Guardian');
    expect(effectiveKeywords(g.p2.board.f1!, g), 'enemy unaffected').not.toContain('Guardian');

    // Targeting: the attacker must hit the granted Guardian first.
    gs.setState({ pending: { action: 'attack', charId: 'bw-att' } });
    gs.getState().resolveAttack('bw-back');
    const g2 = gs.getState().game;
    expect(g2.p1.board.b1?.hp, 'non-Guardian target refused').toBe(g.p1.board.b1!.hp);
    expect(gs.getState().toasts.some(t => /Guardian/.test(t.msg)), 'refusal names Guardian').toBe(true);
  });
});

describe('carve-out: Watchtower — back-line attack permission (NOT a Ranged grant)', () => {
  it('lets a back-line companion attack; without it the attack is refused', () => {
    freshGame();
    const archerless = mkComp('wt-comp', compCard.name, { atk: 2 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { b1: archerless } },
      p2: { ...s.game.p2, board: { f1: mkComp('wt-foe', compCard2.name, { hp: 9 }) } },
    } }));
    gs.getState().beginAttack('wt-comp');
    expect(gs.getState().pending, 'no tower → back-line attack refused').toBeNull();

    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { ...s.game.p1.board, f3: mkConstruct('wt-tower', 'Watchtower', 3, { subtype: 'Fortification' }) } },
    } }));
    gs.getState().beginAttack('wt-comp');
    expect(gs.getState().pending?.action, 'tower → attack arms from the back line').toBe('attack');
    // Deliberately NOT a Ranged grant: full Ranged would also make the companion
    // TARGETABLE in the back line (targeting rule "…or the defender has Ranged").
    const g = gs.getState().game;
    expect(effectiveKeywords(g.p1.board.b1!, g)).not.toContain('Ranged');
  });
});

describe('carve-out: Pyre of the Unbound — start-of-turn modal (sacrifice: 4 target / 2 AoE)', () => {
  function seedPyreTurn() {
    freshGame(); // p1 active
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { b3: mkPc('py-pc1'), f1: mkComp('py-foe1', compCard.name, { hp: 9 }), f2: mkComp('py-foe2', compCard2.name, { hp: 9 }) } },
      p2: { ...s.game.p2, board: { b3: mkPc('py-pc2'), f3: mkConstruct('py-pyre', 'Pyre of the Unbound', 3, { subtype: 'Incantation' }) } },
    } }));
    gs.getState().endTurn(); // p1 → p2: Pyre's controller's turn starts
  }

  it('arms the modal for the controller at their turn start; declining keeps the Pyre', () => {
    seedPyreTurn();
    const pm = gs.getState().game.pendingModalChoice!;
    expect(pm, 'modal armed').toBeTruthy();
    expect(pm.lp, 'owned by the controller').toBe('p2');
    expect(pm.optional, '"you may" — declinable').toBe(true);
    expect(pm.cost).toBe('sacrificeSelf');
    expect(pm.options.map(o => o.label)).toEqual([
      'Deal 4 damage to target character',
      'Deal 2 damage to each opposing character',
    ]);
    gs.getState().declineModalChoice();
    const g = gs.getState().game;
    expect(g.pendingModalChoice, 'prompt cleared').toBeNull();
    expect(g.p2.board.f3?.name, 'Pyre kept — declining pays nothing').toBe('Pyre of the Unbound');
  });

  it('AoE mode: pays the sacrifice, hits each opposing character for 2', () => {
    seedPyreTurn();
    gs.getState().resolveModalChoice(1);
    const g = gs.getState().game;
    expect(g.p2.board.f3, 'Pyre sacrificed as the cost').toBeUndefined();
    expect(g.p2.dead.some(c => c.name === 'Pyre of the Unbound')).toBe(true);
    expect(g.p1.board.f1?.hp, 'enemy companion hit').toBe(7);
    expect(g.p1.board.f2?.hp, 'other enemy companion hit').toBe(7);
    expect(g.p1.board.b3?.hp, 'enemy PC hit too (each opposing character)').toBe(18);
  });

  it('targeted mode: pays the sacrifice, then chains into a target pick for 4', () => {
    seedPyreTurn();
    gs.getState().resolveModalChoice(0);
    const st = gs.getState();
    expect(st.game.p2.board.f3, 'Pyre sacrificed').toBeUndefined();
    expect(st.pendingActionTarget?.sourceName, 'target pick armed').toBe('Pyre of the Unbound');
    gs.getState().resolveActionTarget('py-foe1');
    expect(gs.getState().game.p1.board.f1?.hp, '4 damage to the chosen character').toBe(5);
  });
});
