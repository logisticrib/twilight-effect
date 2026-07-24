// DEV deck — Arc E: item-hosted reactive triggers (2026-07-23, Caltrop Pouch).
// GATHER DESIGN: gatherEquippedAttacked (stack.ts) scans the ATTACKED character's
// LIVE loadout for 'onEquippedAttacked' clauses and pushes ordinary name-keyed
// reactive entries — resolveReactiveEntry needed ZERO changes (it resolves the
// ITEM card's clauses by sourceName). The bearer anchors the trigger; entries
// join the declaration-window batch with the same controller as Iron Spikes
// (batchOrderer's single-controller construction holds). Mandatory auto-fire —
// no prompt, no hold (the debt-#10 precedent).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkItem } from './helpers';
import { reactiveHold } from '../store/gameStore';
import { DW_ROGUE_DEV_CARDS } from '../data/catalog';

const pouchCard = () => {
  const c = DW_ROGUE_DEV_CARDS.find(x => x.name === 'Caltrop Pouch');
  if (!c) throw new Error('dev card missing: Caltrop Pouch');
  return c;
};

const g = () => gs.getState().game;
const attack = (charId: string, targetId: string) => {
  gs.setState(() => ({ pending: { action: 'attack', charId } }));
  gs.getState().resolveAttack(targetId);
};
const pouch = (id: string) => mkItem(id, 'Caltrop Pouch');

describe('Caltrop Pouch (47) — the declaration window gathered from EQUIPMENT', () => {
  it('an attacked bearer stings the attacker at declaration; mandatory auto-fire holds nobody', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('att', 'Attacker', { atk: 2, hp: 5 }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('bear', 'Pouch Bearer', { hp: 9, loadout: { weapon: null, gear: [pouch('cp-1'), null] } }) } },
    } }));
    attack('att', 'bear');
    expect(g().p1.board.f1?.hp, 'the attacker took the sting').toBe(4);
    expect(g().p2.board.f1?.hp, 'the attack still landed').toBe(7);
    expect(reactiveHold(g(), 'p1'), 'no hold on the attacker').toBeNull();
    expect(reactiveHold(g(), 'p2'), 'no hold on the defender').toBeNull();
  });

  it('ON-THEME: the sting kills a 1-HP attacker at declaration — the attack FIZZLES (Glass Cannon precedent)', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('glass', 'Glass Cannon', { atk: 4, hp: 1 }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('bear', 'Pouch Bearer', { hp: 9, loadout: { weapon: null, gear: [pouch('cp-1'), null] } }) } },
    } }));
    attack('glass', 'bear');
    expect(g().p1.board.f1, 'the attacker died to the sting').toBeFalsy();
    expect(g().p2.board.f1?.hp, 'its attack never landed').toBe(9);
    expect(gs.getState().toasts.map(t => t.msg).join(' | ')).toMatch(/fizzles/i);
  });

  it('the BEARER anchors the trigger: a moved pouch fires for its NEW bearer only (Kit-Master class)', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('att', 'Attacker', { atk: 1, hp: 9 }) } },
      p2: { ...s.game.p2, board: {
        f1: mkComp('a', 'Old Bearer', { hp: 9, loadout: { weapon: null, gear: [null, null] } }),
        f2: mkComp('b', 'New Bearer', { hp: 9, loadout: { weapon: null, gear: [pouch('cp-1'), null] } }),
      } },
    } }));
    attack('att', 'a'); // the pouch is NOT on this target
    expect(g().p1.board.f1?.hp, 'no sting from an item the target does not wear').toBe(9);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      board: { f1: { ...s.game.p1.board.f1!, acts: { move: false, minor: false, major: false }, exhausted: false, tapped: 'none' } } } } }));
    attack('att', 'b'); // the pouch IS on this target
    expect(g().p1.board.f1?.hp, 'the new bearer stings').toBe(8);
  });

  it('a buried pouch fires nothing (item exit: nobody wears it)', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('att', 'Attacker', { atk: 1, hp: 9 }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('vic', 'Bare Victim', { hp: 9 }) }, dead: [pouchCard()] },
    } }));
    attack('att', 'vic');
    expect(g().p1.board.f1?.hp, 'the Dead Zone stings nobody').toBe(9);
  });

  it('TWO pouches = two triggers: the owner orders the batch, the attacker takes 2', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('att', 'Attacker', { atk: 2, hp: 5 }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('bear', 'Double Bearer', { hp: 9, loadout: { weapon: null, gear: [pouch('cp-1'), pouch('cp-2')] } }) } },
    } }));
    attack('att', 'bear');
    const po = g().pendingTriggerOrder;
    expect(po, '>1 simultaneous trigger — the ordering prompt arms').toBeTruthy();
    expect(po?.lp, 'the BATCH CONTROLLER (defender) orders').toBe('p2');
    gs.getState().resolveTriggerOrder(0); // one pick completes a 2-batch
    expect(g().pendingTriggerOrder, 'order complete').toBeFalsy();
    expect(g().p1.board.f1?.hp, 'both pouches stung').toBe(3);
    expect(g().p2.board.f1?.hp, 'the attack landed after').toBe(7);
  });

  it('a PC bearer counts ("equipped character", not companion-only)', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('att', 'Attacker', { atk: 2, hp: 5 }) } },
      p2: { ...s.game.p2, board: { b3: { ...mkPc('pc-2'), loadout: { weapon: null, gear: [pouch('cp-1'), null] } } } },
    } }));
    attack('att', 'pc-2');
    expect(g().p1.board.f1?.hp, 'the PC stings back').toBe(4);
    expect(g().p2.board.b3?.hp, 'the attack landed on the PC').toBe(18);
  });
});
