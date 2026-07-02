import { useState, type CSSProperties } from 'react';
import { ModalShell, md } from './ModalShell';
import { CardFace } from '../../../components/CardFace';
import { useGameStore } from '../../../store/gameStore';
import { CATALOG } from '../../../data/catalog';
import { TBL, CLASSCLR } from '../../../tokens';

interface Props { onClose: () => void; }

export function OathswornModal({ onClose }: Props) {
  // The Oathsworn trigger belongs to whoever placed the permanent — the LOCAL player
  // (never a hardcoded side: in multiplayer/sandbox-switched games p1 may be the
  // opponent, and their hand must not be shown or mutated here).
  const { game, localPlayer, oathContext, setGame, setOathContext } = useGameStore();
  const [tucked, setTucked] = useState<string | null>(null);

  const permName = oathContext?.name ?? 'Oathsworn Permanent';
  const hand = game[localPlayer].hand;

  const finish = (sacrifice: boolean) => {
    if (oathContext) {
      const lp = localPlayer;
      setGame(g => {
        const ps = g[lp];
        const board = { ...ps.board };
        let newHand = [...ps.hand];
        let newDead = ps.dead;
        // Find the permanent on the board
        const slotKey = Object.keys(board).find(k => board[k as keyof typeof board]?.id === oathContext.permanentId);
        if (sacrifice) {
          if (slotKey) {
            const ent = board[slotKey as keyof typeof board];
            delete board[slotKey as keyof typeof board];
            const c = ent && CATALOG.find(cc => cc.name === ent.name);
            if (c) newDead = [...ps.dead, c]; // sacrificed permanents go to the Dead Zone
          }
        } else if (tucked && slotKey) {
          // Capture the sworn card BEFORE filtering it out of the hand (filtering
          // first meant `sworn` was always tucked as null).
          const swornCard = newHand.find(c => c.id === tucked) ?? null;
          newHand = newHand.filter(c => c.id !== tucked);
          const ent = board[slotKey as keyof typeof board];
          if (ent) board[slotKey as keyof typeof board] = { ...ent, sworn: swornCard };
        }
        return { ...g, [lp]: { ...ps, board, hand: newHand, dead: newDead } };
      });
      setOathContext(null);
    }
    onClose();
  };

  const tuckZone: CSSProperties = {
    marginTop: 14, height: 80, borderRadius: 10,
    border: `2px dashed ${tucked ? TBL.amber : TBL.matLine2}`,
    background: tucked ? 'rgba(214,160,80,0.1)' : 'rgba(0,0,0,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    color: tucked ? TBL.amber2 : TBL.ink3, fontSize: 13, transition: 'all .15s',
    fontFamily: "'Newsreader', serif",
  };

  return (
    <ModalShell
      glyph="❦" color={CLASSCLR['Paladin']}
      eyebrow="Trigger · Verdant Pact"
      title={`Oathsworn — ${permName} enters`}
      sub="As this permanent enters, tuck a card from your hand face-down beneath it. If you can't or won't, it is sacrificed. The sworn card returns to your hand when it leaves."
      footer={
        <>
          <button style={md.btn('danger')} onClick={() => finish(true)}>
            Can't pay — sacrifice
          </button>
          <div style={md.spacer} />
          <button
            style={{ ...md.btn('primary'), opacity: tucked ? 1 : 0.45 }}
            onClick={() => tucked && finish(false)}
          >
            Swear &amp; resolve
          </button>
        </>
      }
    >
      <div style={md.sectionLbl}>
        Choose a card to swear
        <div style={md.sectionLine} />
      </div>
      <div style={md.cardRow}>
        {hand.map(card => {
          const isChosen = tucked === card.id;
          return (
            <div key={card.id} onClick={() => setTucked(isChosen ? null : card.id)} style={{
              cursor: 'pointer',
              transform: isChosen ? 'translateY(-8px)' : 'none',
              transition: 'transform .14s',
              filter: tucked && !isChosen ? 'grayscale(0.6) brightness(0.7)' : 'none',
              outline: isChosen ? `2px solid ${TBL.amber}` : 'none',
              borderRadius: 10,
            }}>
              <CardFace data={card} scale={0.5} hoverable />
            </div>
          );
        })}
        {hand.length === 0 && (
          <div style={{ color: TBL.ink3, fontFamily: "'Newsreader', serif", fontSize: 14, padding: '12px 0' }}>
            Your hand is empty — you must sacrifice.
          </div>
        )}
      </div>
      <div style={tuckZone}>
        {tucked
          ? `◈ Sworn card tucked face-down beneath ${permName}`
          : '▽ Select a card above to swear it'}
      </div>
    </ModalShell>
  );
}
