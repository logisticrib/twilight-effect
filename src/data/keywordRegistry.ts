/**
 * The canonical keyword vocabulary (from Master_Keyword_List.md) — part of the data
 * contract. Deliberately DEPENDENCY-FREE: the deck validator / future mint-gate imports
 * this without dragging in the engine, the store, or the shipped catalog. The engine
 * (store/keywords.ts) re-exports it, so gameplay code keeps its existing import path.
 *
 * Each keyword resolves at one lifecycle event; `done` tracks engine support so the
 * gaps stay visible.
 */
// 'play' (Arc E, 2026-08-23) is the CASTER's own play-time window — an additional cost
// charged before the permanent reaches the stack. Distinct from 'enter' (the permanent
// is already entering) and from 'oppPlay' (an OPPONENT's play, e.g. Paranoia).
// 'death' (2026-08-25, for Haunt) is the moment a permanent's death has fully
// resolved — listeners fired, items transferred, card in its owner's Dead Zone. No
// prior keyword resolved there ('damaged' is the pre-death prevention window; a death
// by sacrifice or flee never passes through it at all).
export type KwEvent = 'static' | 'enter' | 'play' | 'attack' | 'damaged' | 'turnStart' | 'oppPlay' | 'death';

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
  'Armor':   { event: 'damaged', done: true,  note: 'removeArmorCounter — enters loaded with X, counts DOWN (inverted 2026-08-18); companion-side counters are the ability (universal counter rule)' },
  Acrobatics:{ event: 'damaged', done: true,  note: 'isImmuneToSplash' },
  Poison:    { event: 'damaged', done: true,  note: 'poisonHitPatch in combat; ready-phase check via PoisonModal/resolvePoison' },
  // Static auras
  Dismay:    { event: 'static',  done: true,  note: 'recomputeStatics' },
  Inspire:   { event: 'static',  done: true,  note: 'recomputeStatics (mirror of Dismay: reads YOUR OWN board, +1 via currentWillpower)' },
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

  // Arc C (2026-08-23). isUntamedEncounter (engine/stats.ts) is the ONE predicate,
  // derived on read and never serialized. KEYWORD-INDEPENDENT by owner ruling this
  // date: the state belongs to the ENCOUNTER, and this keyword's only job is to attach
  // a per-card bonus to it — which is why dd000066 can ask "if it is Untamed" without
  // printing UNTAMED. Two clause shapes carry the bonuses: `static` + if:{untamed}
  // (continuous, re-read every stat/keyword read) and `onEnter` + if:{untamed} (the
  // entry snapshot, read exactly once).
  Untamed:        { event: 'static',  done: true,  note: 'isUntamedEncounter: no Gear and no Physical Constructs, BOTH boards (encounter-wide); Weapons never suppress. Bonuses ride clause-level if:{kind:untamed} — static = continuous, onEnter = entry snapshot (dd000066)' },

  // ── Not yet implemented ───────────────────────────────────────────────────────
  // Vocabulary added 2026-08-19 for the Sworn Wild dev deck. Both are DECLARED so their
  // carriers validate; NEITHER has engine behavior yet (the Untamed precedent — the
  // contract must not advertise implemented space, but it must name what cards print).
  // Arc E (2026-08-23). The play-time cost chokepoint now exists: placeCard gates on it
  // AFTER every legality check and BEFORE the Class-Zone spend, so no cost is ever paid
  // for a play that then fails. `event: 'play'` — it is not an enter trigger; the cost
  // resolves entirely before the companion is pushed onto the stack.
  Tribute:        { event: 'play',    done: true,  note: 'additional cost to PLAY (Angel exclusive). Cost AUTHORED as tribute.sacrificeSubtype, read via TRIBUTE_BY_NAME; paid by sacrificing one of YOUR matching permanents (tributePayable). Unpayable = UNPLAYABLE: refused at placeCard, card stays in hand, nothing paid. Slot-as-pick: a Back-Line slot held by a payable Beast is a legal target (owner 2026-08-23)' },
  // Printed parameterized as "Warded against [X]" — keywordBase strips the parameter the
  // way it does for "[NAME]'s Bane". NOT to be confused with `lineWard`, an unrelated
  // Fortification mechanic that shares the word.
  Warded:         { event: 'damaged', done: false, note: 'canon: warded characters cannot be targeted, attacked, or damaged by cards of type or subtype [X]. No targeting/damage gate consults it' },

  // Vocabulary added 2026-08-25 for the Requiem dev deck (Bard / Necromancer) — all
  // four owner-ratified into Master_Keyword_List.md the same day. DECLARED so their
  // carriers validate; NONE has engine behavior yet (the Untamed/Tribute precedent:
  // the contract names what cards print without advertising unimplemented space).
  // Crescendo is the Untamed SHAPE (a derived board state the keyword hangs a per-card
  // bonus on) but CONTROLLER-scoped: "you control a Vocal Construct" — never
  // encounter-wide. Keyword-independent like Untamed: cards may ask "if you are in
  // Crescendo" without printing it.
  // Arc B (2026-08-25): LIVE — inCrescendo (engine/stats.ts), the isUntamedEncounter
  // pattern CONTROLLER-scoped; condition kind 'crescendo' in conditionMet (+ the
  // selfItemStat bearer's-controller binding for item clauses). Keyword-independent.
  Crescendo:      { event: 'static',  done: true,  note: 'inCrescendo: any Vocal Construct (subtype in {Chant, Song, Rite, Blessing, Utterance, Dirge} — isVocalConstruct) on YOUR board. Bonuses ride clause-level if:{kind:crescendo} — static = continuous, onEnter = entry snapshot (Siren), onPlay = cast-time (Encore), startOfTurn (Skald), equipped = bearer-controller (Gilded Lute), onAttack = declaration window (Satyr, with the pendingCombatPick target prompt)' },
  // Replaces the sacrifice fired by LAST-Anchor-counter removal (decay AND effect
  // removal — canon unifies them, 2026-07-15 family) with a return to hand. The
  // construct leaves but never dies: no sacrifice event, no Dead Zone.
  Reprise:        { event: 'static',  done: false, note: 'canon: when this Vocal Construct would be sacrificed because its last Anchor counter was removed, return it to your hand instead. No replacement hook exists at either last-counter site (readyPhase decay / anchor-removal ops)' },
  // The death fully happens first (listeners fire, items transfer, card touches the
  // Dead Zone), THEN the return — WITH a Memory counter, which IS the whole tracker:
  // a companion that dies carrying a Memory counter stays dead. Reworked from
  // "Restless" the same day (owner playtest feedback: the once-state needed a physical
  // tracker). Per-stint: counters cease on zone change, so outside reanimation resets
  // it. No slot = no return AND no counter (Haunt retained). A flee IS a death.
  Haunt:          { event: 'death',   done: false, note: 'canon: when this companion dies, if it had no Memory counters on it, return it from your Dead Zone to an empty Command Zone slot you control, exhausted, with a Memory counter on it. Needs a death listener + Memory-counter check at death + owner-routed slot pick that places the counter; flee counts (a flee is a death, 2026-07-20)' },
  // Printed parameterized as "Entomb N" — keywordBase strips the number as it does for
  // Armor/Reinforce. Self-mill: YOUR deck, YOUR Dead Zone. Arc A (2026-08-25): LIVE —
  // parseEntomb (stats) feeds millCards (entities) at both enter sites: the inline
  // runOnEnter block for single-unit carriers, and an 'entomb' enterUnit kind for the
  // Arc G owner-ordered multi-pending window (Palegrove Gravekeeper + Scavenger).
  // The same arc interpreted the mill op and installed the deck-out loss in drawCards
  // (ANY mandatory draw from an empty deck loses — owner-ruled 2026-08-25).
  Entomb:         { event: 'enter',   done: true,  note: 'parseEntomb -> millCards at runOnEnter (single-unit) and armEnterUnit (multi-pending, owner-ordered). Partial/empty mill no-ops (R4); milling never loses — only draws do (drawCards chokepoint)' },
};
