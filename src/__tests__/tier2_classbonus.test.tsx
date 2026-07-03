// @vitest-environment jsdom
// Tier 2 item 5 (test_seed_plan.md): class bonuses lock at phase start. The offered
// bonus set snapshots the Class Zone classes at modal MOUNT — a bonus that swaps a
// CZ card (czSwapById rewrites the slot's class) must NOT change the remaining offers.
// This is mount-timing behavior, so it's the plan's sanctioned component test.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ClassBonusModal } from '../screens/play/modals/ClassBonusModal';
import { gs, freshGame } from './helpers';
import { CATALOG } from '../data/catalog';

const pikestaff = CATALOG.find(c => c.name === 'Pikestaff')!;
const sorcererCard = CATALOG.find(c => c.class1 === 'Sorcerer' && c.type === 'Companion')!;

afterEach(cleanup);

function seed(czEntries: { cls: string; name: string }[]) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
    classZone: czEntries.map((e, i) => {
      const card = CATALOG.find(c => c.name === e.name)!;
      return { id: `cz-${i}`, cls: e.cls, name: e.name, faceDown: false, cardData: card };
    }),
    willpower: czEntries.length,
    hand: [sorcererCard],
  } } }));
}

describe('class bonuses lock at phase start (ClassBonusModal snapshot)', () => {
  it('offers derive from the CZ classes at mount', () => {
    seed([{ cls: 'Warrior', name: pikestaff.name }, { cls: 'Sorcerer', name: sorcererCard.name }]);
    render(<ClassBonusModal onClose={() => {}} player="p1" />);
    expect(screen.getByText(/Gear Up!/), 'Warrior bonus offered').toBeTruthy();
    expect(screen.getByText(/Elemental Fury/), 'Sorcerer bonus offered').toBeTruthy();
  });

  it('a CZ-swapping bonus does not change the offered set', () => {
    seed([{ cls: 'Warrior', name: pikestaff.name }]);
    render(<ClassBonusModal onClose={() => {}} player="p1" />);
    expect(screen.getByText(/Gear Up!/), 'only the Warrior bonus offered').toBeTruthy();
    expect(screen.queryByText(/Elemental Fury/), 'no Sorcerer bonus yet').toBeNull();

    // Apply Gear Up!: the single weapon CZ target auto-selects; swap the SORCERER
    // hand card into the Class Zone.
    fireEvent.click(screen.getByText('Choose…'));
    fireEvent.click(screen.getAllByText(sorcererCard.name)[0]);

    // The swap really happened — the live CZ slot is now Sorcerer-classed…
    const cz = gs.getState().game.p1.classZone[0];
    expect(cz.cls, 'live CZ class swapped by the bonus').toBe('Sorcerer');
    expect(cz.name).toBe(sorcererCard.name);

    // …but the OFFERED set stays locked to the mount snapshot.
    expect(screen.getByText(/✓ Applied/), 'Warrior bonus resolved').toBeTruthy();
    expect(screen.queryByText(/Elemental Fury/), 'Sorcerer bonus must NOT appear mid-phase').toBeNull();
    expect(screen.getByText(/1 \/ 1 resolved/), 'resolution count complete').toBeTruthy();
  });
});
