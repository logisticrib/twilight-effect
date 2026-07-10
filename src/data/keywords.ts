/**
 * Canonical keyword definitions, QUOTED VERBATIM from docs/Master_Keyword_List.md
 * (standing lesson 2026-07-04: keyword definitions are quoted from canon, never
 * paraphrased — the previous entries here were compressed paraphrases, and one had
 * drifted: Untamed said "no Items" where canon says "no Gear").
 *
 * Consumers: the Library keyword panel, and the validator's prose-completeness check
 * (a card sentence is reminder text iff its vocabulary is contained in one of its
 * declared keywords' canonical definitions — so these strings being VERBATIM canon is
 * load-bearing, not cosmetic).
 */
export const KEYWORD_DEFS: Record<string, string> = {
  'Ranged':        'This character can attack from the Back Line.',
  'Cleave':        'When this character attacks, it deals damage equal to its attack to each character on the same line as the target. This is exclusive to two-handed weapons.',
  'Evasive':       "This character can attack any opponent character regardless of the target's positioning. Still subject to Guardian targeting requirement.",
  'Hit & Run':     'After this character attacks, it may take an extra move action.',
  'Zealous':       'This character may attack without needing to first pass a willpower check.',
  'Guardian':      'While this character is ready (not exhausted) and a legal target, opponents must attack it before any other character.',
  'Armor':         'If the equipped character would be dealt damage, prevent all of that damage and put an armor counter on this item. When this item has X armor counters, sacrifice it.',
  'Scavenger':     'When this companion enters the encounter, you may return an item from your Dead Zone and immediately attach it to this companion.',
  'Kit-Master':    'When this companion enters the encounter, you may move target item from one character you control to another character you control.',
  'Tribute':       'As an additional cost to play this Angel companion, pay its Tribute cost.',
  'Reckless':      'When this character attacks, it deals 1 damage to itself.',
  'Poison':        'If a character is damaged by this character, exhaust that character and place a Poison counter on it. At the beginning of each player\'s turn, for each Poisoned character they control, that player rolls a die. If the result is less than or equal to that player\'s current Willpower, remove all Poison counters from that character and ready it. Otherwise, that character remains exhausted this turn and its controller takes 1 damage for each Poison counter on it.',
  'Acrobatics':    'This companion cannot be damaged by any source that does not target it directly.',
  'Reinforce':     'When this enters play, add N Anchor counters to target Physical Construct you control.',
  'Dismantle':     'When this enters play, remove up to N Anchor counters from target Physical Construct. If it has no Anchor counters remaining, sacrifice it.',
  'Coercion':      'When this companion enters, target opponent must discard a card or sacrifice a permanent. (The Player Character cannot be chosen as the sacrificed permanent — owner ruling ratified 2026-07-04.)',
  'Dismay':        'As long as one or more permanents with Dismay are in the encounter under your control, your opponent is Dismayed. (A Dismayed player has −1 Willpower. Dismayed does not stack.)',
  'Untamed':       'While there are no Gear or Physical Constructs in the encounter, this character is Untamed. Per-card text defines the bonus granted while Untamed.',
  'Oathsworn':     "As this permanent enters the encounter, place a card from your hand face-down beneath it. If you can't, sacrifice this permanent. When this permanent leaves the encounter, return the sworn card to your hand.",
  'Animate Magic': 'When this enters, target Magical Construct you control becomes a Companion with the type Manifest and Attack and HP equal to X. It is no longer a Construct but retains its text and Anchor counters. If it would leave the encounter, sacrifice it instead.',
  'Bane':          "This deals double damage to Companions whose subtype or class is [NAME]. Appears on cards as [NAME]'S BANE.",
  'Paranoia':      "Whenever an opponent plays a Companion, look at the top card of that player's deck. You may put that card on the top or bottom of their deck.",
};
