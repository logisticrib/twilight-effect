// @vitest-environment jsdom
// Regression: drive the REAL setup/poison modals through their component event paths and
// assert the recording exports (replay-validates) clean. Guards the class of bug where a
// store action wired straight as an onClick handler (ClassBonusModal footer → advanceSetup)
// receives the click event as args[0]; the recorder's clone(args) threw on the circular event
// and silently dropped the advance, so replay under-walked game.setupQueue and placePc
// diverged. The fix routes non-JSON-serializable args to a state-paste (isReplayable
// allowlist) and never silently drops an entry. See tasks/test_seed_plan.md Phase 2.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { gs, deckCards, mkPc, mkComp } from './helpers';
import { recorder } from '../replay/recorder';
import { tryExport } from '../replay/exportReplay';
import { ModalHost } from '../screens/play/modals/ModalHost';
import { PoisonModal } from '../screens/play/modals/PoisonModal';

/** Click the last button whose label matches (footer buttons render after body buttons). */
function clickBtn(re: RegExp) {
  const all = screen.getAllByRole('button');
  const hits = all.filter(b => re.test(b.textContent ?? ''));
  if (!hits.length) throw new Error(`no button matching ${re}; present: ${all.map(b => b.textContent).join(' | ')}`);
  act(() => { fireEvent.click(hits[hits.length - 1]); });
}

describe('setup + poison record and replay clean through real components', () => {
  beforeEach(() => { recorder._resetForTest(); });
  afterEach(() => { cleanup(); recorder._resetForTest(); });

  it('mulligan → class bonus → PC placement exports clean (event-arg advanceSetup regression)', () => {
    act(() => { gs.getState().startSolo(deckCards, deckCards); });
    render(<ModalHost />);

    clickBtn(/Keep/);                // mulligan p1 (keep)
    clickBtn(/Keep/);                // mulligan p2 (keep)
    clickBtn(/Skip|Begin|Continue/); // class bonus p1 — footer onClick={() => onClose()} → advanceSetup
    clickBtn(/Skip|Begin|Continue/); // class bonus p2
    act(() => { gs.getState().placePc('b1', 'p1'); }); // board clicks (banner is non-blocking)
    act(() => { gs.getState().placePc('b2', 'p2'); });

    // Setup fully consumed — proves the two class-bonus advances were RECORDED, not dropped.
    expect(gs.getState().game.setupQueue).toEqual([]);
    // The class-bonus advanceSetups must be present as entries (the bug dropped them).
    const steps = recorder.getStatus().steps;
    expect(steps).toBeGreaterThanOrEqual(6);

    const res = tryExport();
    expect(res.ok ? 'ok' : res.error).toBe('ok'); // replay() validated the whole log
  }, 30_000); // heavy: renders every CZ + hand CardFace through the real modal tree

  it('poison roll (PoisonModal) exports clean — resolvePoison rides a serializable outcomes arg', () => {
    // Seed a mid-game position with a poisoned companion while suspended, then record.
    recorder.suspend();
    gs.getState().startSolo(deckCards, deckCards);
    gs.setState(s => ({ game: { ...s.game,
      setupQueue: [], currentPhase: 'ready' as const, activePlayer: 'p1' as const,
      pendingPoison: 'p1' as const,
      p1: { ...s.game.p1, board: {
        b3: mkPc('pc-1', { hp: 18, maxHp: 20 }),
        b1: mkComp('poisoned-1', 'Toxin Victim', { poison: 2, statuses: ['Poisoned'], exhausted: true }),
      } },
    } }));
    recorder.resume();
    recorder._beginForTest(() => gs.getState());

    render(<PoisonModal player="p1" onClose={() => gs.getState().setGame(g => ({ ...g, pendingPoison: null }))} />);
    clickBtn(/Roll die/);  // rolls in-component (rng.next), stores outcome in local state
    clickBtn(/Continue/);  // commit → resolvePoison(p1, [{id,cleansed}]) [action] + onClose [paste]

    expect(gs.getState().game.pendingPoison).toBeNull();
    const res = tryExport();
    expect(res.ok ? 'ok' : res.error).toBe('ok');
  }, 30_000);
});
