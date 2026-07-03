// Tier 4 item 2 (test_seed_plan.md) — the deck-JSON data contract. validateCards is a
// reusable function (src/data/validateCards.ts) so it can later gate the card-generation
// pipeline (mint-gate); this test keeps the CURRENT decks inside the contract and proves
// the validator actually catches each class of authoring mistake.
import { describe, it, expect } from 'vitest';
import { validateCards } from '../data/validateCards';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const base = CATALOG[0];
const clone = (over: Record<string, unknown>): Card => ({ ...base, id: 'clone-1', name: 'Clone Under Test', ...over } as unknown as Card);

describe('data contract: the shipped decks validate clean', () => {
  it('validateCards(CATALOG) reports zero problems', () => {
    expect(validateCards(CATALOG)).toEqual([]);
  });
});

describe('the validator catches each class of authoring mistake (mint-gate behavior)', () => {
  const expectCaught = (card: Card, why: string) => {
    const problems = validateCards([card]);
    expect(problems.length, `${why} — must be caught`).toBeGreaterThan(0);
    expect(problems.join(' | '), 'problem names the card').toContain('Clone Under Test');
  };

  it('unknown effect op', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'obliterate', target: 'anyCharacter' }] }] }), 'typo op');
  });

  it('unknown trigger', () => {
    expectCaught(clone({ effects: [{ trigger: 'onSummon', effects: [] }] }), 'typo trigger');
  });

  it('unknown TargetSpec', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'damage', amount: 1, target: 'enemyMinion' }] }] }), 'typo target');
  });

  it('bad Amount shape', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'damage', amount: { dice: 6 }, target: 'anyCharacter' }] }] }), 'unknown amount key');
  });

  it('nested branch validation (dieCheck)', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'dieCheck', threshold: 4, onPass: [{ op: 'zap', target: 'self' }], onFail: [] }] }] }), 'bad op inside a dieCheck branch');
  });

  it('activated ability without cost or oncePerTurn (§11 guard)', () => {
    expectCaught(clone({ effects: [{ trigger: 'activated', effects: [{ op: 'draw', count: 1 }] }] }), 'free repeatable activated');
  });

  it('bad Cost kind', () => {
    expectCaught(clone({ effects: [{ trigger: 'activated', cost: { kind: 'payMana', amount: 2 }, effects: [] }] }), 'unknown cost');
  });

  it('bad Condition kind', () => {
    expectCaught(clone({ effects: [{ trigger: 'onPlay', effects: [{ op: 'draw', count: 1, if: { kind: 'moonIsFull' } }] }] }), 'unknown condition');
  });

  it('unknown keyword (typo against the KEYWORDS registry)', () => {
    expectCaught(clone({ keywords: ['Cleeve'] }), 'typo keyword');
  });

  it('bad per-type fields: Action cost domain, Item classification, Construct anchor, Companion hp, level range', () => {
    expectCaught(clone({ type: 'Action', actionPM: 'Huge' }), 'bad actionPM');
    expectCaught(clone({ type: 'Item', itemKind: '' }), 'unclassified item');
    expectCaught(clone({ type: 'Construct', anchor: 0 }), 'anchorless construct');
    expectCaught(clone({ type: 'Companion', attack: 2, hp: 0 }), '0-HP companion');
    expectCaught(clone({ level: 9 }), 'level out of range');
  });

  it('duplicate ids and names across a set', () => {
    const a = clone({ id: 'dup', name: 'Clone Under Test' });
    const b = clone({ id: 'dup', name: 'Clone Under Test' });
    const problems = validateCards([a, b]);
    expect(problems.some(x => x.includes('duplicate id')), 'duplicate id caught').toBe(true);
    expect(problems.some(x => x.includes('duplicate name')), 'duplicate name caught').toBe(true);
  });
});
