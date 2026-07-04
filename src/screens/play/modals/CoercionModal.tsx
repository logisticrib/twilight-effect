import { ModalShell, md } from './ModalShell';
import { CardFace } from '../../../components/CardFace';
import { CATALOG } from '../../../data/catalog';
import { useGameStore } from '../../../store/gameStore';
import { TBL } from '../../../tokens';
import type { BoardEntity } from '../../../types/card';

const pickBtn = { padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 } as const;

/** Coercion (on-enter keyword): an enemy Coercion companion entered, and the VICTIM
 *  chooses which price to pay — discard a card from hand, or sacrifice a permanent
 *  (never the PC; it's excluded by the store). Renders only on the victim's client,
 *  like PoisonModal; the acting player sees the ReactiveHoldBanner meanwhile. There
 *  is no skip — the keyword is a must, and the store armed it only when payable. */
export function CoercionModal() {
  const co = useGameStore(s => s.game.pendingCoercion);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const discard = useGameStore(s => s.resolveCoercionDiscard);
  const sacrifice = useGameStore(s => s.resolveCoercionSacrifice);
  const victimState = useGameStore(s => (s.game.pendingCoercion ? s.game[s.game.pendingCoercion.victim] : null));
  if (!co || !victimState || (!isSolo && co.victim !== localPlayer)) return null;

  const permanents = (Object.values(victimState.board) as (BoardEntity | undefined)[])
    .filter((e): e is BoardEntity => !!e && e.kind !== 'pc');

  return (
    <ModalShell glyph="⛓" eyebrow={`${co.source} · Coercion`}
      title="Discard a card or sacrifice a permanent"
      sub="An enemy Coercion companion entered. Choose the price: click a hand card to discard it, or one of your permanents to sacrifice it.">
      {victimState.hand.length > 0 && (
        <>
          <div style={md.sectionLbl}>Discard from hand<span style={md.sectionLine} /></div>
          <div style={{ ...md.cardRow, marginBottom: permanents.length ? 18 : 0 }}>
            {victimState.hand.map(c => (
              <button key={c.id} style={pickBtn} title={`Discard ${c.name}`} onClick={() => discard(c.id)}>
                <CardFace data={c} scale={0.62} />
              </button>
            ))}
          </div>
        </>
      )}
      {permanents.length > 0 && (
        <>
          <div style={md.sectionLbl}>Sacrifice a permanent<span style={md.sectionLine} /></div>
          <div style={md.cardRow}>
            {permanents.map(e => {
              const card = CATALOG.find(c => c.name === e.name) ?? null;
              return (
                <button key={e.id} style={pickBtn} title={`Sacrifice ${e.name}`} onClick={() => sacrifice(e.id)}>
                  {card
                    ? <CardFace data={card} scale={0.62} />
                    : <span style={{ display: 'inline-block', padding: '14px 18px', border: `1px solid ${TBL.matLine2}`, borderRadius: 8, color: TBL.ink, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>{e.name}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </ModalShell>
  );
}
