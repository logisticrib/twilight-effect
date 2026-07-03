import { useState, type CSSProperties } from 'react';
import { ModalShell, md } from './ModalShell';
import { CardFace } from '../../../components/CardFace';
import { useGameStore, seatName, shuffle } from '../../../store/gameStore';
import { CATALOG } from '../../../data/catalog';
import { TBL } from '../../../tokens';
import type { Card } from '../../../types/card';

interface Props { onClose: () => void; isSequence?: boolean; player?: 'p1' | 'p2'; }

export function MulliganModal({ onClose, isSequence, player = 'p1' }: Props) {
  const game = useGameStore(s => s.game);
  const setGame = useGameStore(s => s.setGame);
  const localPlayer = useGameStore(s => s.localPlayer);
  const ps = game[player];

  // Resolve full Card objects for the initial CZ — prefer the entry's own cardData,
  // fall back to a catalog lookup, and DROP misses (never substitute a wrong card).
  const initialCzCards: Card[] = ps.classZone
    .map(cz => cz.cardData ?? CATALOG.find(c => c.name === cz.name))
    .filter((c): c is Card => !!c);

  // All working state tracks the player's real deck — not the global catalog.
  // Initial deck = remaining draw pile after PC + CZ + hand were dealt (41 cards).
  const [workingDeck, setWorkingDeck] = useState<Card[]>(() => ps.deck);
  const [workingCZ,   setWorkingCZ]   = useState<Card[]>(() => initialCzCards);
  const [workingHand, setWorkingHand] = useState<Card[]>(() => ps.hand.slice(0, 5));

  const [mulliganCount, setMulliganCount] = useState(0);
  const [phase, setPhase]   = useState<'decide' | 'bottom'>('decide');
  const [picked, setPicked] = useState<string[]>([]);

  const needToBottom = mulliganCount;
  const pickComplete = picked.length === needToBottom;
  const canMulligan  = (mulliganCount + 1) <= workingHand.length;

  const doMulligan = () => {
    // Return current hand + CZ to the deck, shuffle, redeal 3 CZ + 5 hand
    const pile = shuffle([...workingDeck, ...workingHand, ...workingCZ]);
    const newCZ   = pile.splice(0, 3);
    const newHand = pile.splice(0, 5);
    setWorkingDeck(pile);
    setWorkingCZ(newCZ);
    setWorkingHand(newHand);
    setMulliganCount(n => n + 1);
    setPicked([]);
    setPhase('bottom');
  };

  const togglePick = (id: string) => {
    setPicked(p => {
      if (p.includes(id)) return p.filter(x => x !== id);
      if (p.length < needToBottom) return [...p, id];
      return p;
    });
  };

  const confirmBottom = () => {
    // Move picked cards to the bottom of the working deck
    const toBottom = workingHand.filter(c => picked.includes(c.id));
    setWorkingDeck(d => [...d, ...toBottom]);
    setWorkingHand(h => h.filter(c => !picked.includes(c.id)));
    setPicked([]);
    setPhase('decide');
  };

  const keep = () => {
    setGame(g => ({
      ...g,
      [player]: {
        ...g[player],
        hand: workingHand,
        deck: workingDeck,
        classZone: workingCZ.map((c, i) => ({
          id: `cz-${player}-${i}`,
          cls: c.class1 || 'Classless',
          name: c.name,
          faceDown: false,
          cardData: c,
        })),
        willpower: workingCZ.length,
      },
    }));
    onClose();
  };

  const pillStyle = (on: boolean): CSSProperties => ({
    transform: on ? 'translateY(10px)' : 'none',
    transition: 'transform .14s',
    filter: on ? 'grayscale(0.5) brightness(0.65)' : 'none',
    outline: on ? `2px solid ${TBL.danger}` : 'none',
    borderRadius: 10, cursor: phase === 'bottom' ? 'pointer' : 'default',
    position: 'relative',
  });

  const inBottom = phase === 'bottom';

  return (
    <ModalShell
      glyph="⟳" color={TBL.amber}
      eyebrow={`Setup · ${player.toUpperCase()} Mulligan${mulliganCount > 0 ? ` · ×${mulliganCount}` : ''}`}
      title={inBottom
        ? `Bottom ${needToBottom} card${needToBottom !== 1 ? 's' : ''}`
        : `${seatName(player, localPlayer)} — Mulligan`}
      sub={inBottom
        ? `Choose ${needToBottom} card${needToBottom !== 1 ? 's' : ''} to place on the bottom of your deck. (${picked.length}/${needToBottom} chosen)`
        : 'Keep this Class Zone and opening hand, or mulligan both. Mulliganing returns everything to your deck and redeals — then you bottom an escalating number of cards. Your PC is never returned.'}
      footer={
        inBottom ? (
          <>
            <span style={md.costNote}>{picked.length} / {needToBottom} chosen to bottom</span>
            <div style={md.spacer} />
            <button
              style={{ ...md.btn('primary'), opacity: pickComplete ? 1 : 0.45 }}
              onClick={() => pickComplete && confirmBottom()}
            >
              Confirm bottom
            </button>
          </>
        ) : (
          <>
            <span style={md.costNote}>
              {mulliganCount === 0 ? 'No mulligans taken yet' : `${mulliganCount} mulligan${mulliganCount > 1 ? 's' : ''} taken`}
              {!canMulligan ? ' · hand too small to mulligan again' : ''}
            </span>
            <div style={md.spacer} />
            <button
              style={{ ...md.btn('ghost'), opacity: canMulligan ? 1 : 0.4 }}
              onClick={() => canMulligan && doMulligan()}
            >
              Mulligan (−{mulliganCount + 1})
            </button>
            <button style={md.btn('primary')} onClick={keep}>
              {isSequence ? 'Keep — continue ›' : 'Keep these'}
            </button>
          </>
        )
      }
    >
      <div style={md.sectionLbl}>
        Class Zone · {workingCZ.length} cards
        <div style={md.sectionLine} />
        Willpower {workingCZ.length} / 5
      </div>
      <div style={md.cardRow}>
        {workingCZ.map((c, i) => (
          <CardFace key={c.id + i} data={c} scale={0.52} />
        ))}
      </div>

      <div style={{ ...md.sectionLbl, marginTop: 18 }}>
        Opening hand · {workingHand.length}
        <div style={md.sectionLine} />
        {inBottom && (
          <span style={{ color: TBL.amber2, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
            tap to bottom
          </span>
        )}
      </div>
      <div style={md.cardRow}>
        {workingHand.map(card => {
          const sel = picked.includes(card.id);
          return (
            <div
              key={card.id}
              style={pillStyle(sel)}
              onClick={inBottom ? () => togglePick(card.id) : undefined}
            >
              <CardFace data={card} scale={0.52} />
              {sel && (
                <div style={{
                  position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                  color: '#fff', background: TBL.danger, padding: '2px 7px', borderRadius: 3,
                  letterSpacing: '0.06em', whiteSpace: 'nowrap',
                }}>↓ BOTTOM</div>
              )}
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
