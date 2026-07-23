import { ModalShell, md } from './ModalShell';
import { CardFace } from '../../../components/CardFace';
import { useGameStore } from '../../../store/gameStore';

const pickBtn = { padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 } as const;

/** Forced discard (Arc A, 2026-07-22): an effect made this player discard — the
 *  DISCARDING player chooses the card (owner agency, the Coercion precedent).
 *  Renders only on the victim's client, like CoercionModal; everyone else sees the
 *  ReactiveHoldBanner. No skip — the discard is mandatory (the op only arms when
 *  the victim has cards). */
export function DiscardModal() {
  const pd = useGameStore(s => s.game.pendingDiscard);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const resolveDiscard = useGameStore(s => s.resolveDiscard);
  const victimHand = useGameStore(s => (s.game.pendingDiscard ? s.game[s.game.pendingDiscard.victim].hand : null));
  if (!pd || !victimHand || (!isSolo && pd.victim !== localPlayer)) return null;

  return (
    <ModalShell glyph="🗑" eyebrow={`${pd.source} · discard`}
      title="Discard a card"
      sub={`${pd.source} forces a discard — click the card to discard.`}>
      <div style={md.cardRow}>
        {victimHand.map(c => (
          <button key={c.id} style={pickBtn} title={`Discard ${c.name}`} onClick={() => resolveDiscard(c.id)}>
            <CardFace data={c} scale={0.62} />
          </button>
        ))}
      </div>
    </ModalShell>
  );
}
