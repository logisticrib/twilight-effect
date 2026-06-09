import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../../../store/gameStore';
import { TBL } from '../../../tokens';
import { MulliganModal }   from './MulliganModal';
import { ClassBonusModal } from './ClassBonusModal';
import { OathswornModal }  from './OathswornModal';
import { PoisonModal }     from './PoisonModal';

const MODALS = [
  { id: 'mulligan',   label: 'Mulligan',    glyph: '⟳' },
  { id: 'classbonus', label: 'Class Bonus', glyph: '✦' },
  { id: 'oathsworn',  label: 'Oathsworn',   glyph: '❦' },
  { id: 'poison',     label: 'Poison',       glyph: '☣' },
];

export function ModalLauncher() {
  const { setOathContext, game } = useGameStore();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const trigger = (id: string) => {
    if (id === 'oathsworn' && !game.p1.hand.length) {
      // ensure there's something to show for demo
      setOathContext({ permanentId: 'demo', name: 'Demo Permanent' });
    }
    setActive(id);
    setOpen(false);
  };

  const triggerStyle = (isOpen: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
    fontSize: 11.5, fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em',
    color: isOpen ? '#1a1208' : TBL.amber2,
    background: isOpen ? TBL.amber : 'rgba(214,160,80,0.1)',
    border: `1px solid ${TBL.amber}66`,
  });
  const menuStyle: CSSProperties = {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 400,
    minWidth: 180, background: '#1d1810',
    border: `1px solid ${TBL.matLine2}`, borderRadius: 8,
    padding: 6, boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
  };
  const itemStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '8px 8px', borderRadius: 5, cursor: 'pointer',
    fontSize: 13, color: TBL.ink, fontFamily: "'Inter', sans-serif",
  };

  return (
    <>
      <div style={{ position: 'relative' }}>
        <div style={triggerStyle(open)} onClick={() => setOpen(o => !o)} title="Preview modals">
          ⚑ Modals
        </div>
        {open && (
          <div style={menuStyle}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.ink3, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '4px 8px 6px' }}>
              Preview a modal
            </div>
            {MODALS.map(m => (
              <div key={m.id} style={itemStyle}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                onClick={() => trigger(m.id)}>
                <span style={{ width: 18, textAlign: 'center' }}>{m.glyph}</span>
                {m.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Render the selected modal */}
      {active === 'mulligan'   && <MulliganModal   onClose={() => setActive(null)} />}
      {active === 'classbonus' && <ClassBonusModal onClose={() => setActive(null)} />}
      {active === 'oathsworn'  && <OathswornModal  onClose={() => setActive(null)} />}
      {active === 'poison'     && <PoisonModal     onClose={() => setActive(null)} />}
    </>
  );
}
