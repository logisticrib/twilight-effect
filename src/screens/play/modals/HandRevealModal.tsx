import { ModalShell, md } from './ModalShell';
import { CardFace } from '../../../components/CardFace';
import { useGameStore } from '../../../store/gameStore';

const pickBtn = { padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 } as const;

/** Opponent-hand reveal (Arc A, 2026-07-22): the LOOKER sees the revealed hand.
 *  Renders only on the looker's client (info entitlement — the hand's owner is held
 *  via the ReactiveHoldBanner meanwhile). With pick 'toBottomDraw' (Mark the
 *  Pockets) the looker MAY choose a card — it goes to the bottom of its owner's
 *  deck and that player draws a card; skipping is always allowed ("you may"). */
export function HandRevealModal() {
  const hr = useGameStore(s => s.game.pendingHandReveal);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const resolveHandReveal = useGameStore(s => s.resolveHandReveal);
  const revealed = useGameStore(s => (s.game.pendingHandReveal ? s.game[s.game.pendingHandReveal.handSide] : null));
  if (!hr || !revealed || (!isSolo && hr.lp !== localPlayer)) return null;

  const picking = hr.pick === 'toBottomDraw';
  return (
    <ModalShell glyph="👁" eyebrow={`${hr.source} · hand reveal`}
      title={`${revealed.name}'s hand`}
      sub={picking
        ? 'You may choose a card — it goes to the bottom of their deck and they draw a card. Or close without choosing.'
        : 'Look at the revealed hand, then close.'}
      footer={
        <>
          <div style={md.spacer} />
          <button style={md.btn(picking ? 'ghost' : 'primary')} onClick={() => resolveHandReveal(null)}>
            {picking ? 'Choose none' : 'Done'}
          </button>
        </>
      }>
      <div style={md.cardRow}>
        {revealed.hand.map(c => {
          // Arc F (2026-08-25, Steal the Show): the pick filter — Companions are
          // shown but not pickable (the store refuses them too).
          const barred = picking && hr.pickFilter === 'nonCompanion' && c.type === 'Companion';
          return picking && !barred ? (
            <button key={c.id} style={pickBtn} title={`Bottom ${c.name} — they draw a card`} onClick={() => resolveHandReveal(c.id)}>
              <CardFace data={c} scale={0.62} />
            </button>
          ) : (
            <div key={c.id} style={barred ? { opacity: 0.45 } : undefined} title={barred ? `${c.name} — Companions cannot be chosen` : undefined}>
              <CardFace data={c} scale={0.62} />
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
