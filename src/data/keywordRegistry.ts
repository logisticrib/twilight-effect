/**
 * The canonical keyword vocabulary (from Master_Keyword_List.md) — part of the data
 * contract. Deliberately DEPENDENCY-FREE: the deck validator / future mint-gate imports
 * this without dragging in the engine, the store, or the shipped catalog. The engine
 * (store/keywords.ts) re-exports it, so gameplay code keeps its existing import path.
 *
 * Each keyword resolves at one lifecycle event; `done` tracks engine support so the
 * gaps stay visible.
 */
export type KwEvent = 'static' | 'enter' | 'attack' | 'damaged' | 'turnStart' | 'oppPlay';

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

  // ── On-enter triggers (targeted / prompted; resolved from placeCard) ─────────
  Reinforce:      { event: 'enter',   done: true,  note: 'pendingTrigger -> resolveTrigger (add anchors)' },
  Dismantle:      { event: 'enter',   done: true,  note: 'pendingTrigger -> resolveTrigger (remove anchors / sacrifice)' },
  'Kit-Master':   { event: 'enter',   done: true,  note: 'pendingKit two-step (source item -> dest char)' },
  Scavenger:      { event: 'enter',   done: true,  note: 'placeCard -> Dead-Zone pick with attachTo -> equipOnto' },
  Coercion:       { event: 'enter',   done: true,  note: 'pendingCoercion -> victim modal (discard or sacrifice; PC cannot be sacrificed — ruling ratified 2026-07-04)' },
  'Animate Magic':{ event: 'enter',   done: true,  note: "parseAnimateMagic -> pendingActionTarget 'enter' -> animate op ('manifest' leave-sacrifice on bounce)" },

  // Canonical (docs/Master_Keyword_List.md): "Whenever an OPPONENT plays a Companion, look
  // at the top card of THAT player's deck. You may put that card on the top or bottom of
  // their deck." The Paranoia CONTROLLER looks and decides; the placing player makes no
  // choice and by default never sees the card. (Two earlier takes invented other shapes —
  // an on-enter self peek and a victim-decides own-deck check. Both wrong; see canon.)
  Paranoia:       { event: 'oppPlay', done: true,  note: "placeCard arms a controller-owned PendingPeek over the PLACING player's deck (top/bottom only)" },

  // ── Not yet implemented ───────────────────────────────────────────────────────
  Untamed:        { event: 'static',  done: false, note: 'per-card text bonus (needs card data)' },
};
