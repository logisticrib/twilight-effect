/**
 * The canonical keyword vocabulary (from Master_Keyword_List.md) — part of the data
 * contract. Deliberately DEPENDENCY-FREE: the deck validator / future mint-gate imports
 * this without dragging in the engine, the store, or the shipped catalog. The engine
 * (store/keywords.ts) re-exports it, so gameplay code keeps its existing import path.
 *
 * Each keyword resolves at one lifecycle event; `done` tracks engine support so the
 * gaps stay visible.
 */
export type KwEvent = 'static' | 'enter' | 'attack' | 'damaged' | 'turnStart';

export interface KeywordSpec {
  event: KwEvent;
  done: boolean;
  /** Where the rule currently lives (engine fn or existing combat code). */
  note: string;
}

export const KEYWORDS: Record<string, KeywordSpec> = {
  // Combat & positioning (resolved in resolveAttack today)
  Ranged:    { event: 'attack',  done: true,  note: 'beginAttack eligibility' },
  Cleave:    { event: 'attack',  done: true,  note: 'resolveAttack splash' },
  Evasive:   { event: 'attack',  done: true,  note: 'targeting rules' },
  Zealous:   { event: 'attack',  done: true,  note: 'summoning-sickness bypass' },
  Guardian:  { event: 'attack',  done: true,  note: 'targeting rules' },
  Reckless:  { event: 'attack',  done: true,  note: 'resolveAttack self-damage' },
  'Hit & Run': { event: 'attack', done: true, note: 'grantHitRun + resolveMove gate' },
  // Printed as "X's Bane" (Goblin's Bane…) — double damage vs companions of the named subtype/class.
  Bane:      { event: 'attack',  done: true,  note: 'parseBanes -> per-hit doubling in applyCombatHit' },
  // Items / defence
  'Armor':   { event: 'damaged', done: true,  note: 'applyDamageToEntity counters' },
  Acrobatics:{ event: 'damaged', done: true,  note: 'isImmuneToSplash' },
  Poison:    { event: 'damaged', done: true,  note: 'poisonHitPatch in combat; ready-phase check via PoisonModal/resolvePoison' },
  // Static auras
  Dismay:    { event: 'static',  done: true,  note: 'recomputeStatics' },
  // Set-specific
  Oathsworn: { event: 'enter',   done: true,  note: 'oathsworn modal' },

  // ── Not yet implemented (need targeting UI or structured card data) ──────────
  Reinforce:      { event: 'enter',   done: true,  note: 'pendingTrigger -> resolveTrigger (add anchors)' },
  Dismantle:      { event: 'enter',   done: true,  note: 'pendingTrigger -> resolveTrigger (remove anchors / sacrifice)' },
  'Kit-Master':   { event: 'enter',   done: true,  note: 'pendingKit two-step (source item -> dest char)' },
  Scavenger:      { event: 'enter',   done: true,  note: 'placeCard -> Dead-Zone pick with attachTo -> equipOnto' },
  Coercion:       { event: 'enter',   done: false, note: 'opponent discards or sacrifices' },
  'Animate Magic':{ event: 'enter',   done: false, note: 'construct -> companion' },
  Untamed:        { event: 'static',  done: false, note: 'per-card text bonus (needs card data)' },
  Paranoia:       { event: 'enter',   done: false, note: 'peek/reorder opponent deck' },
};
