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
  /** The type line's tokens, AUTHORED in the card data (owner ruling 2026-08-20) —
   *  never inferred at load and never split at runtime. "Spirit Beast Deer" is
   *  ["Spirit","Beast","Deer"]; "Weapon - Sword" is ["Weapon","Sword"]. Matching is
   *  SET MEMBERSHIP over this array, so stacked modifiers work regardless of position
   *  and the engine never parses a type line. `subtype` remains the display string;
   *  validateCards enforces that the two stay in sync. */
  subtypes: string[];
  /** The TRIBUTE cost this Angel charges to play (Arc E, 2026-08-23). AUTHORED here,
   *  never parsed out of the printed text -- the equipOnto lesson (2026-08-18): printed
   *  prose must not be load-bearing code input, or a rewording silently changes rules.
   *  Dropped in normalize() exactly like `subtypes` and read through a catalog lookup,
   *  because Card objects serialize into recordings and a new always-absent key would
   *  re-hash every fixture (the Arc B trap). Absent on every non-Tribute card. */
  tribute?: { sacrificeSubtype: string };
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
  /** NON-CANON dev card (owner-authored dev decks, 2026-07-22). Dev cards are playable
   *  and fully validated, but must be EXCLUDED from shipped-pool queries and coverage
   *  audits' "shipped" counts. On dev cards, effectsFlag strings start "DEV " —
   *  "DEV NOT-IMPLEMENTED …" marks visible machinery debt (tier4 pins the convention). */
  dev?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Normalized card used throughout the app. */
/**
 * The RUNTIME card. `subtypes` is DELIBERATELY OMITTED — it lives in
 * catalog.ts's SUBTYPES_BY_ID / SUBTYPES_BY_NAME lookups instead.
 *
 * STANDING RULE (owner, 2026-08-20): nothing new serializes into GameState unless a
 * RECORDING needs it; derived data lives in lookups. Card objects sit inside recorded
 * snapshots (hand, deck, dead, classZone.cardData), so a new key here re-hashes every
 * fixture — which is exactly what broke t3 when `subtypes` was briefly a Card field.
 */
export interface Card extends Omit<RawCard, 'subtypes'> {
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
 *  `until: 'endOfTurn'` buffs are stripped when the buffed entity's owner's turn
 *  ends (shipped). Timed anchors (Arc B, 2026-07-23) strip at the named player's
 *  turn boundary instead — all boundary processing lives in endTurn's expiry pass.
 *  EXTENSION POINT: Arc H's skip-refresh and Arc I's end-of-turn control reversion
 *  should add anchor kinds here rather than fork a parallel mechanism. */
export interface ActiveBuff {
  atk?: number;
  grant?: string[];       // keywords granted (e.g. 'Guardian')
  modifiers?: Modifier[]; // flag modifiers (e.g. 'hpFloor1', 'cannotAttack')
  until: 'endOfTurn' | { at: 'turnStart' | 'turnEnd'; of: 'p1' | 'p2' };
  /** Window gate (Doubt): the payload applies only while `activeDuring` is the
   *  active player. Absent = always live (every shipped buff). */
  activeDuring?: 'p1' | 'p2';
  /** Dormant until that player's turn STARTS ("during its controller's NEXT turn"
   *  cast mid-turn): cleared at that boundary; a still-pending entry is never
   *  active, and the turnEnd strip skips it (an own-turn cast must survive its own
   *  cast turn's end). */
  pendingUntilTurnOf?: 'p1' | 'p2';
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
  /** Armor counters held by the ENTITY itself (companion-variant Armor, and any
   *  card effect that places them) -- owner-ratified 2026-08-18. The counters ARE
   *  the prevention ability: while this is > 0 the companion prevents damage,
   *  removing one per instance, and at 0 it simply stops (nothing is sacrificed).
   *  OPTIONAL and absent for every companion that never held one (hash discipline,
   *  as with `poison` / `stolenFrom`). */
  armorCounters?: number;
  /** The printed X the entity's armor counters started from -- display only, the
   *  `anchorsStart` pattern. Absent when the counters came from an effect rather
   *  than a printed keyword. */
  armorStart?: number;
  loadout?: Loadout;
  sworn?: Card | null; // oathsworn card tucked beneath
  acts: Acts;          // per-turn action budget
  buffs?: ActiveBuff[]; // temporary modifiers (Action-card buffs, etc.)
  /** Arc I (2026-08-11, Command the Broken): set while this entity sits on a board
   *  its OWNER does not control — the value is the owner's side. Control is board
   *  membership (ruling 2); this marker carries OWNERSHIP, which never changes:
   *  deaths/bounces route zones to the owner (ruling 4), and the endTurn reversion
   *  pass relocates the entity home when the clock expires. OPTIONAL — absent for
   *  every un-stolen entity (hash discipline). */
  stolenFrom?: 'p1' | 'p2';
}
