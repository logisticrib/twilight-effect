// Guardian × target legality (bugfix, owner 2026-07-15). Canon GUARDIAN
// (Master_Keyword_List, quoted verbatim): "While this character is ready (not
// exhausted) and a legal target, opponents must attack it before any other
// character." The old gate filtered on ready ONLY — a back-line ready Guardian
// behind an occupied front line deadlocked every attack for a normal attacker
// (anything else: "Guardian first!"; the Guardian itself: Front Line priority).
// The fix computes Front-Line-priority legality FIRST, then applies Guardian
// WITHIN the legal set — a structural reordering, no special cases.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp } from './helpers';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];

const attacker = (over: Parameters<typeof mkComp>[2] = {}) => mkComp('atk-1', compCard.name, { atk: 2, ...over });
const guardian = (id: string, over: Parameters<typeof mkComp>[2] = {}) =>
  mkComp(id, compCard2.name, { hp: 5, keywords: ['Guardian'], ...over });
const grunt = (id: string, over: Parameters<typeof mkComp>[2] = {}) => mkComp(id, compCard2.name, { hp: 5, ...over });

function arm(att: ReturnType<typeof mkComp>, defs: Record<string, ReturnType<typeof mkComp>>) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: { f1: att } },
    p2: { ...s.game.p2, board: defs },
  }, pending: { action: 'attack', charId: att.id } }));
}
const lastToast = () => gs.getState().toasts.at(-1)?.msg ?? '';
const hpOf = (slot: string) => (gs.getState().game.p2.board as Record<string, { hp: number } | undefined>)[slot]?.hp;

describe('Guardian requires target legality (canon clause, previously unimplemented)', () => {
  it('pin 1 — back-line ready Guardian + occupied front + normal attacker: NO deadlock, front-line characters attackable; the unreachable Guardian itself stays protected by Front Line priority', () => {
    arm(attacker(), { f1: grunt('ft-1'), b1: guardian('gd-1') });
    // The unreachable Guardian is still not directly attackable — with no Guardian
    // binding, the chosen-target legality check (Front Line priority) must refuse.
    gs.getState().resolveAttack('gd-1');
    expect(hpOf('b1'), 'back-line Guardian untargetable for a normal attacker').toBe(5);
    expect(lastToast()).toContain('Must target the Front Line first');
    gs.setState({ pending: { action: 'attack', charId: 'atk-1' } });
    gs.getState().resolveAttack('ft-1');
    expect(hpOf('f1'), 'front-line grunt takes the hit — the unreachable Guardian binds nothing').toBe(3);
  });

  it('pin 2 — same board, EVASIVE attacker: the back Guardian IS legal for it → it MUST attack a Guardian (Evasive grants reach, never a Guardian bypass)', () => {
    arm(attacker({ keywords: ['Evasive'] }), { f1: grunt('ft-1'), b1: guardian('gd-1') });
    gs.getState().resolveAttack('ft-1');
    expect(hpOf('f1'), 'refused — a legal Guardian binds the Evasive attacker').toBe(5);
    expect(lastToast()).toContain('Guardian must be attacked first');
    gs.setState({ pending: { action: 'attack', charId: 'atk-1' } });
    gs.getState().resolveAttack('gd-1');
    expect(hpOf('b1'), 'the Guardian itself is attackable').toBe(3);
  });

  it('pin 3 — back-line Guardian WITH Ranged is a legal target for everyone → binds a normal attacker', () => {
    arm(attacker(), { f1: grunt('ft-1'), b1: guardian('gd-1', { keywords: ['Guardian', 'Ranged'] }) });
    gs.getState().resolveAttack('ft-1');
    expect(hpOf('f1'), 'refused — the Ranged Guardian is legal, so it binds').toBe(5);
    expect(lastToast()).toContain('Guardian must be attacked first');
    gs.setState({ pending: { action: 'attack', charId: 'atk-1' } });
    gs.getState().resolveAttack('gd-1');
    expect(hpOf('b1'), 'the Ranged back-line Guardian takes the hit').toBe(3);
  });

  it('pin 4 (regression) — front-line ready Guardian binds exactly as before', () => {
    arm(attacker(), { f1: guardian('gd-1'), f2: grunt('ft-2') });
    gs.getState().resolveAttack('ft-2');
    expect(hpOf('f2'), 'refused — front Guardian binds').toBe(5);
    expect(lastToast()).toContain('Guardian must be attacked first');
    gs.setState({ pending: { action: 'attack', charId: 'atk-1' } });
    gs.getState().resolveAttack('gd-1');
    expect(hpOf('f1'), 'Guardian attackable').toBe(3);
  });

  it('pin 5 (regression) — an exhausted Guardian binds nobody', () => {
    arm(attacker(), { f1: guardian('gd-1', { exhausted: true }), f2: grunt('ft-2') });
    gs.getState().resolveAttack('ft-2');
    expect(hpOf('f2'), 'free targeting — Guardian not ready').toBe(3);
  });

  it('pin 6 — two Guardians, one legal (front) one unreachable (back): the legal one binds, the other contributes nothing', () => {
    arm(attacker(), { f1: guardian('gd-front'), f2: grunt('ft-2'), b1: guardian('gd-back') });
    gs.getState().resolveAttack('gd-back');
    expect(hpOf('b1'), 'unreachable back Guardian still not directly attackable (Front Line priority)').toBe(5);
    gs.setState({ pending: { action: 'attack', charId: 'atk-1' } });
    gs.getState().resolveAttack('ft-2');
    expect(hpOf('f2'), 'refused — the LEGAL (front) Guardian binds').toBe(5);
    expect(lastToast()).toContain('Guardian must be attacked first');
    gs.setState({ pending: { action: 'attack', charId: 'atk-1' } });
    gs.getState().resolveAttack('gd-front');
    expect(hpOf('f1'), 'the legal Guardian takes the hit').toBe(3);
  });

  it('pin 7 — legality is recomputed per declaration (R2 2026-07-15): once the Guardian dies, later attacks target normally', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('atk-1', compCard.name, { atk: 9 }), f2: mkComp('atk-2', compCard.name, { atk: 2 }) } },
      p2: { ...s.game.p2, board: { f1: guardian('gd-1', { hp: 1 }), f2: grunt('ft-2') } },
    }, pending: { action: 'attack', charId: 'atk-1' } }));
    gs.getState().resolveAttack('gd-1');
    expect(gs.getState().game.p2.board.f1, 'Guardian killed by the first attack').toBeUndefined();
    gs.setState({ pending: { action: 'attack', charId: 'atk-2' } });
    gs.getState().resolveAttack('ft-2');
    expect(hpOf('f2'), 'second attacker targets freely — no dead Guardian residue').toBe(3);
  });
});
