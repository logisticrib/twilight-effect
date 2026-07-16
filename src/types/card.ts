import type { CardEffect, Modifier } from './effects';

export type CardType = 'Companion' | 'Construct' | 'Action' | 'Item';
export type TapState = 'none' | 'minor' | 'major';

/** Raw card as exported from the JSON deck files. */
export interface RawCard {
  id: string;
  name: string;
  level: number;
  type: CardType;
  subtype: string;
  rarity: string;
  class1: string;
  class2: string;
  attack: number | null;
  hp: number | null;
  anchor: number | null;
  actionSub: string;   // 'Minor' | 'Major' | 'Special' | ''
  actionPM: string;
  itemKind: string;    // weapon/gear classification
  keywords: string[];
  text: string;
  flavor: string;
  /** Structured card behavior. Optional — absent on cards not yet wired; the
   *  interpreter no-ops when missing, so unauthored cards keep current behavior. */
  effects?: CardEffect[];
  /** OWNER-APPROVED exemption from the validator's prose-completeness check: rules
   *  text that deliberately carries no structured effects. The string states WHY
   *  (dated) — never set without an explicit owner ruling (check added 2026-07-08:
   *  a prose-only card must not mint silently). */
  effectsFlag?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Normalized card used throughout the app. */
export interface Card extends RawCard {
  cls: string;         // alias for class1 (primary class)
}

/** An item equipped to a board entity. */
export interface EquippedItem {
  id: string;
  name: string;
  sub: string;
  hands?: 1 | 2;      // weapons only
  heavy?: boolean;    // gear: occupies both gear slots
  armor?: number;     // armor X value
  counters?: number;  // current armor counter tally
  /** Item exhaustion (owner-ratified 2026-07-15 — "exhaust this trinket" costs).
   *  OPTIONAL and absent/undefined when not exhausted (fixture-hash discipline:
   *  games that never exhaust an item hash identically to pre-mechanic games).
   *  Belongs to the ITEM: a Kit-Master move carries it; the controller's Ready
   *  Phase clears it. Granted statics/keywords are unaffected by it. */
  exhausted?: boolean;
  text: string;
}

export interface Loadout {
  weapon: EquippedItem | null;
  gear: (EquippedItem | null)[];
}

/** A temporary modifier applied to a board entity (e.g. by an Action card).
 *  `until: 'endOfTurn'` buffs are stripped when the turn passes. */
export interface ActiveBuff {
  atk?: number;
  grant?: string[];       // keywords granted (e.g. 'Guardian')
  modifiers?: Modifier[]; // flag modifiers (e.g. 'hpFloor1', 'cannotBeMoved')
  until: 'endOfTurn';
  source?: string;        // card name that applied it (for toasts)
}

/** Per-turn action budget for a board entity. */
export interface Acts {
  move:  boolean;
  minor: boolean;
  major: boolean;
}

/** A card placed on the board (companion, construct, or pc). */
export interface BoardEntity {
  id: string;
  kind: 'companion' | 'construct' | 'pc';
  name: string;
  cls: string;
  level: number;
  atk?: number;
  hp: number;
  maxHp: number;
  anchors?: number;
  anchorsStart?: number;
  keywords: string[];
  statuses: string[];
  subtype?: string;
  text: string;
  tapped: TapState;
  exhausted: boolean;
  fresh?: boolean;     // summoning sickness
  poison?: number;     // poison counter count
  loadout?: Loadout;
  sworn?: Card | null; // oathsworn card tucked beneath
  acts: Acts;          // per-turn action budget
  buffs?: ActiveBuff[]; // temporary modifiers (Action-card buffs, etc.)
}
