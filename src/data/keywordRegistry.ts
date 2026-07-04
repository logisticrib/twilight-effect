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
  // Items / defence
  'Armor':   { event: 'damaged', done: true,  note: 'applyDamageToEntity counters' },
  Acrobatics:{ event: 'damaged', done: true,  note: 'isImmuneToSplash' },
  // Static auras
  Dismay:    { event: 'static',  done: true,  note: 'recomputeStatics' },
  // Set-specific
  Oathsworn: { event: 'enter',   done: true,  note: 'oathsworn modal' },

  // ── Not yet implemented (need targeting UI or structured card data) ──────────
  Reinforce:      { event: 'enter',   done: true,  note: 'pendingTrigger -> resolveTrigger (add anchors)' },
  Dismantle:      { event: 'enter',   done: true,  note: 'pendingTrigger -> resolveTrigger (remove anchors / sacrifice)' },
  'Kit-Master':   { event: 'enter',   done: true,  note: 'pendingKit two-step (source item -> dest char)' },
  Scavenger:      { event: 'enter',   done: false, note: 'return item from Dead Zone' },
  Coercion:       { event: 'enter',   done: false, note: 'opponent discards or sacrifices a permanent (PC excluded — ruling ratified 2026-07-04)' },
  'Animate Magic':{ event: 'enter',   done: true,  note: "structured 'animate' op (Incantation = Magical Construct) + 'manifest' leave-sacrifice; keyword string itself not parsed" },
  Poison:         { event: 'damaged', done: false, note: 'application (exhaust + counter on damage) unwired; RESOLUTION done: pendingPoison -> resolvePoison (roll <= WP cleanses+readies, else stays exhausted + 1 dmg per counter to controller PC)' },
  Untamed:        { event: 'static',  done: false, note: 'per-card text bonus (needs card data)' },
  Bane:           { event: 'attack',  done: false, note: 'double damage vs subtype/class' },
  // Canonical (Master_Keyword_List): "Whenever an OPPONENT plays a Companion, look at the
  // top card of THAT player's deck. You may put that card on the top or bottom of their
  // deck." The Paranoia controller decides; the placing player makes no choice and does
  // not see the card. (An earlier registry note guessed an on-enter self trigger — wrong.)
  Paranoia:       { event: 'oppPlay', done: true,  note: 'placeCard arms an opponent-owned PendingPeek over the placing player\'s deck (top/bottom)' },
};
