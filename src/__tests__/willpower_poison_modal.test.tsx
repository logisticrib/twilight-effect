// @vitest-environment jsdom
// The Poison check reads THE current Willpower (Dismayed-adjusted — owner ruling
// 2026-07-04). The roll-vs-WP comparison lives in PoisonModal (component-side), so
// this is a component test: same base WP, same die roll — Dismayed flips the outcome.
// Also pins the removal of the modal's old raw read + its un-canonical floor-at-1.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PoisonModal } from '../screens/play/modals/PoisonModal';
import { gs, freshGame, mkComp, mkPc } from './helpers';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function seed(dismayed: boolean) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, pendingPoison: 'p1',
    p1: { ...s.game.p1, willpower: 3, dismayed, hp: 20,
      board: {
        f1: mkComp('po-1', compCard.name, { poison: 2, statuses: ['Poisoned'], exhausted: true, tapped: 'major' }),
        b1: mkPc('po-pc', { hp: 20 }),
      } },
  } }));
}

describe('Poison check rolls against current Willpower (one-Willpower rule)', () => {
  it('shows the Dismayed-adjusted Willpower in the check text', () => {
    seed(true);
    render(<PoisonModal player="p1" onClose={() => {}} />);
    expect(screen.getByText(/≤ your Willpower \(2\)/), 'sub text shows current WP 2, not base 3').toBeTruthy();
  });

  it('same roll of 3: cleanses at current WP 3, holds at current WP 2 (Dismayed)', () => {
    // 1 + floor(0.4 × 6) = 3
    vi.spyOn(Math, 'random').mockReturnValue(0.4);

    seed(false);
    const a = render(<PoisonModal player="p1" onClose={() => {}} />);
    fireEvent.click(screen.getByText('Roll die'));
    expect(screen.getByText(/counters removed · readied/), '3 ≤ 3 → cleansed').toBeTruthy();
    a.unmount();

    seed(true);
    render(<PoisonModal player="p1" onClose={() => {}} />);
    fireEvent.click(screen.getByText('Roll die'));
    // one element carries both halves ("· stays exhausted" also appears as a status tag)
    expect(screen.getByText(/you take −2 HP · stays exhausted/), '3 > 2 → holds, 1 dmg per counter').toBeTruthy();
  });

  it('committing the Dismayed failure applies the per-counter damage through the store', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    seed(true);
    render(<PoisonModal player="p1" onClose={() => {}} />);
    fireEvent.click(screen.getByText('Roll die'));
    fireEvent.click(screen.getByText('Continue'));
    const g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'PC entity 20 → 18 (2 counters)').toBe(18);
    expect(g.p1.hp, 'headline mirrored').toBe(18);
    expect(g.p1.board.f1?.poison, 'counters kept on the failed unit').toBe(2);
    expect(g.pendingPoison, 'prompt cleared').toBeNull();
  });
});
