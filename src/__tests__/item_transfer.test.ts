// Item Transfer on Character Exit — rules §Items: "When a character leaves the
// encounter with one or more items attached, the controlling player may exhaust a
// ready character in their party with an open slot of the appropriate type to
// immediately equip one of those items. / Each character can only be exhausted once
// in this way per triggering event / This ability is used separately for each item /
// Any items not equipped to another character through this ability are moved to the
// Dead Zone." Rulings 2026-07-08: applies to ALL exits (death, fleeing, bounce,
// sacrifice); the PC is an eligible rescuer; mid-combat kills DEFER the window until
// the attack completes; the Poison check resolves BEFORE any transfer window (Rules
// Note under Ready Phase). Engine shape: the items already sit in the Dead Zone —
// claiming removes them, declining leaves them (save-safe, no limbo zone).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkPc, mkItem } from './helpers';
import { reactiveHold } from '../store/gameStore';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];
const IRON = CATALOG.find(c => c.name === 'Iron Sword')!;          // weapon
const STONE = CATALOG.find(c => c.name === 'Anchor Stone')!;       // gear (trinket)

const bearerLoadout = (withGear = false) => ({
  weapon: mkItem('it-w', 'Iron Sword'),
  gear: [withGear ? mkItem('it-g', 'Anchor Stone') : null, null],
});
const emptyLoadout = () => ({ weapon: null, gear: [null, null] });

/** p1 attacker kills p2's item-bearer; p2's other board entities as given. */
function killBearer(p2Extra: Record<string, ReturnType<typeof mkComp>>, withGear = false) {
  freshGame();
  const att = mkComp('kb-att', compCard.name, { atk: 9 });
  const bearer = mkComp('kb-bearer', compCard2.name, { hp: 3, loadout: bearerLoadout(withGear) });
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: { f1: att } },
    p2: { ...s.game.p2, board: { f1: bearer, ...p2Extra } },
  }, pending: { action: 'attack', charId: 'kb-att' } }));
  gs.getState().resolveAttack('kb-bearer');
}

describe('Item Transfer on Character Exit (death — combat kill)', () => {
  it('arms the window for the DEFENDER after the attack; claiming equips + exhausts', () => {
    killBearer({ f2: mkComp('kb-resc', compCard.name, { loadout: emptyLoadout() }) });
    let g = gs.getState().game;
    const it = g.pendingItemTransfer!;
    expect(it, 'window armed once the attack completed').toBeTruthy();
    expect(it.lp, 'owned by the departed character\'s controller').toBe('p2');
    expect(it.items.map(x => x.name)).toEqual(['Iron Sword']);
    expect(g.p2.dead.some(c => c.id === IRON.id), 'item rests in the Dead Zone during the window').toBe(true);
    // MP: the attacker is held while the defender decides; the owner is not.
    expect(reactiveHold(g, 'p1'), 'attacker held').toContain('Item Transfer');
    expect(reactiveHold(g, 'p2'), 'owner not held').toBeNull();

    gs.getState().resolveItemTransfer('kb-resc');
    g = gs.getState().game;
    expect(g.pendingItemTransfer, 'window resolved').toBeNull();
    expect(g.p2.board.f2?.loadout?.weapon?.name, 'item equipped onto the rescuer').toBe('Iron Sword');
    expect(g.p2.board.f2?.exhausted, 'rescuer exhausted as the cost').toBe(true);
    expect(g.p2.board.f2?.tapped).toBe('major');
    expect(g.p2.dead.some(c => c.id === IRON.id), 'claimed item left the Dead Zone').toBe(false);
  });

  it('once per event: the lone rescuer exhausts for item 1, so item 2 stays dead', () => {
    killBearer({ f2: mkComp('kb-resc', compCard.name, { loadout: emptyLoadout() }) }, true);
    let g = gs.getState().game;
    expect(g.pendingItemTransfer?.items.map(x => x.name), 'both items in one event').toEqual(['Iron Sword', 'Anchor Stone']);

    gs.getState().resolveItemTransfer('kb-resc');
    g = gs.getState().game;
    // The rescuer could HOLD the gear (free slots) but was already exhausted this
    // event — no eligible rescuer remains, so the second item's window evaporates.
    expect(g.pendingItemTransfer, 'no second prompt').toBeNull();
    expect(g.pendingItemTransferQueue, 'nothing left queued').toEqual([]);
    expect(g.p2.dead.some(c => c.id === STONE.id), 'unclaimed item stays in the Dead Zone').toBe(true);
    expect(g.p2.board.f2?.loadout?.gear.filter(Boolean), 'rescuer got only the claimed item').toEqual([]);
  });

  it('declining leaves the item in the Dead Zone and closes the window', () => {
    killBearer({ f2: mkComp('kb-resc', compCard.name, { loadout: emptyLoadout() }) });
    gs.getState().declineItemTransfer();
    const g = gs.getState().game;
    expect(g.pendingItemTransfer).toBeNull();
    expect(g.p2.dead.some(c => c.id === IRON.id), 'declined item stays dead').toBe(true);
    expect(g.p2.board.f2?.exhausted, 'rescuer untouched').toBe(false);
  });

  it('no eligible rescuer → no prompt at all (items straight to the Dead Zone)', () => {
    killBearer({ f2: mkComp('kb-tired', compCard.name, { exhausted: true, tapped: 'major', loadout: emptyLoadout() }) });
    const g = gs.getState().game;
    expect(g.pendingItemTransfer, 'window evaporated (nothing claimable)').toBeNull();
    expect(g.pendingItemTransferQueue).toEqual([]);
    expect(g.p2.dead.some(c => c.id === IRON.id)).toBe(true);
  });

  it('the PC is an eligible rescuer (ruled 2026-07-08 — "a ready character in their party")', () => {
    killBearer({ b1: mkPc('kb-pc', { loadout: emptyLoadout() }) });
    let g = gs.getState().game;
    expect(g.pendingItemTransfer, 'window armed with the PC as the only candidate').toBeTruthy();
    gs.getState().resolveItemTransfer('kb-pc');
    g = gs.getState().game;
    expect(g.p2.board.b1?.loadout?.weapon?.name, 'PC took up the weapon').toBe('Iron Sword');
    expect(g.p2.board.b1?.exhausted, 'PC exhausted as the cost').toBe(true);
  });
});

describe('Item Transfer — other exits + Ready Phase ordering', () => {
  it('a fleeing companion opens the window — but the Poison check resolves FIRST (Rules Note 2026-07-08)', () => {
    freshGame();
    const bearer = mkComp('fl-bearer', 'Fleeing Bearer', { level: 5, loadout: bearerLoadout() });
    const rescuer = mkComp('fl-resc', 'Rescue Dummy', { loadout: emptyLoadout() });
    const poisoned = mkComp('fl-pois', 'Toxin Victim', { poison: 1, statuses: ['Poisoned'], exhausted: true, tapped: 'major' });
    gs.setState(s => ({ game: { ...s.game,
      p2: { ...s.game.p2, board: { f1: bearer, f2: rescuer, f3: poisoned } },
    } }));
    gs.getState().endTurn(); // p1 → p2: bearer (L5 > WP 3) flees; Poison check pends
    let g = gs.getState().game;
    expect(g.p2.board.f1, 'bearer fled').toBeUndefined();
    expect(g.p2.dead.some(c => c.id === IRON.id), 'its item reached the Dead Zone').toBe(true);
    expect(g.pendingPoison, 'Poison check armed for the readied player').toBe('p2');
    expect(g.pendingItemTransfer, 'transfer window HELD while Poison pends').toBeNull();
    expect(g.pendingItemTransferQueue.length, 'window queued behind it').toBe(1);

    gs.getState().resolvePoison('p2', []);
    g = gs.getState().game;
    expect(g.pendingPoison).toBeNull();
    expect(g.pendingItemTransfer?.items.map(x => x.name), 'window arms once Poison resolves').toEqual(['Iron Sword']);
    expect(g.pendingItemTransfer?.lp).toBe('p2');
  });

  it('a bounce is an exit — the window opens (Translocation Circle on an own bearer)', () => {
    freshGame();
    const circle = mkConstruct('bo-circle', 'Translocation Circle', 3, { subtype: 'Incantation' });
    const bearer = mkComp('bo-bearer', compCard.name, { loadout: bearerLoadout() });
    const rescuer = mkComp('bo-resc', compCard2.name, { loadout: emptyLoadout() });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: circle, b1: bearer, b2: rescuer }, hand: [] },
    } }));
    gs.getState().activateAbility('bo-circle', 0);
    expect(gs.getState().pendingActionTarget, 'bounce target armed').not.toBeNull();
    gs.getState().resolveActionTarget('bo-bearer');
    const g = gs.getState().game;
    expect(g.p1.board.b1, 'bearer bounced off the board').toBeFalsy();
    expect(g.p1.hand.map(c => c.name), 'bearer card to hand').toContain(compCard.name);
    expect(g.p1.dead.some(c => c.id === IRON.id), 'its item to the Dead Zone').toBe(true);
    expect(g.pendingItemTransfer?.lp, 'window opened for the controller').toBe('p1');
    expect(g.pendingItemTransfer?.items.map(x => x.name)).toEqual(['Iron Sword']);
  });
});
