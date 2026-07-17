// Defender-Ranged targetability EXCISED (owner ruling 2026-07-16). Canon RANGED
// (Master_Keyword_List, quoted verbatim): "This character can attack from the
// Back Line." — one sentence, purely offensive. The rules docs' targeting rules
// carried an extra clause ("Back Line targets become legal … or when the
// defender has Ranged") that the owner ruled a FABRICATION: never designed,
// contradicts the keyword text. Corrected rule: back-line characters are legal
// attack targets only when the opposing front line is empty of characters OR
// the attacker has Evasive. The defender's keywords play NO role in its
// targetability. Ranged's actual (offensive) effect is unchanged and pinned
// here as a regression.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp } from './helpers';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];

const lastToast = () => gs.getState().toasts.at(-1)?.msg ?? '';
const p2hp = (slot: string) => (gs.getState().game.p2.board as Record<string, { hp: number } | undefined>)[slot]?.hp;

/** p1 attacker in f1 (pending armed), p2 defenders as given. */
function arm(att: ReturnType<typeof mkComp>, defs: Record<string, ReturnType<typeof mkComp>>) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: { f1: att } },
    p2: { ...s.game.p2, board: defs },
  }, pending: { action: 'attack', charId: att.id } }));
}

describe('defender-Ranged grants NO targetability (correction 2026-07-16)', () => {
  it('a back-line Ranged character behind an occupied front line is NOT a legal target for a normal attacker', () => {
    arm(mkComp('atk-1', compCard.name, { atk: 2 }),
      { f1: mkComp('ft-1', compCard2.name, { hp: 5 }), b1: mkComp('rg-1', compCard2.name, { hp: 5, keywords: ['Ranged'] }) });
    gs.getState().resolveAttack('rg-1');
    expect(p2hp('b1'), 'back-line Ranged defender untargetable — its own keywords are irrelevant').toBe(5);
    expect(lastToast()).toContain('Must target the Front Line first');
    // The front line remains the legal set for this attacker.
    gs.setState({ pending: { action: 'attack', charId: 'atk-1' } });
    gs.getState().resolveAttack('ft-1');
    expect(p2hp('f1'), 'front-liner attackable as normal').toBe(3);
  });

  it('the same back-line Ranged character IS legal for an EVASIVE attacker (Evasive unchanged)', () => {
    arm(mkComp('atk-1', compCard.name, { atk: 2, keywords: ['Evasive'] }),
      { f1: mkComp('ft-1', compCard2.name, { hp: 5 }), b1: mkComp('rg-1', compCard2.name, { hp: 5, keywords: ['Ranged'] }) });
    gs.getState().resolveAttack('rg-1');
    expect(p2hp('b1'), 'Evasive reaches the back line — attacker-side permission is the rule').toBe(3);
  });

  it("regression — Ranged's ACTUAL effect is untouched: a back-line Ranged character can still initiate an attack (and hit the opposing front line)", () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { b1: mkComp('rg-atk', compCard.name, { atk: 2, keywords: ['Ranged'] }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('ft-1', compCard2.name, { hp: 5 }) } },
    } }));
    gs.getState().beginAttack('rg-atk');
    expect(gs.getState().pending?.action, 'Ranged attacker arms from the back line').toBe('attack');
    gs.getState().resolveAttack('ft-1');
    expect(p2hp('f1'), 'attack resolves — Ranged grants offense from the back line').toBe(3);
  });
});
