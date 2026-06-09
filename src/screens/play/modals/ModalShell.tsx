import type { CSSProperties, ReactNode } from 'react';
import { TBL } from '../../../tokens';

export const md = {
  scrim: {
    position: 'fixed', inset: 0, zIndex: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    background: 'radial-gradient(ellipse at center, rgba(10,8,5,0.7), rgba(6,5,3,0.9))',
    backdropFilter: 'blur(7px)',
  } as CSSProperties,
  panel: {
    width: 'min(880px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    background: 'linear-gradient(180deg, #221b12, #16110b)',
    border: `1px solid ${TBL.matLine2}`, borderRadius: 14,
    boxShadow: '0 30px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
    overflow: 'hidden',
  } as CSSProperties,
  head: {
    flexShrink: 0, padding: '18px 22px 14px', borderBottom: `1px solid ${TBL.matLine}`,
    display: 'flex', alignItems: 'flex-start', gap: 14,
    background: 'linear-gradient(180deg, rgba(214,160,80,0.08), transparent)',
  } as CSSProperties,
  glyph: (c?: string): CSSProperties => ({
    width: 42, height: 42, borderRadius: 9, flexShrink: 0,
    background: `${c ?? TBL.amber}22`,
    border: `1px solid ${c ?? TBL.amber}66`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, color: c ?? TBL.amber, fontFamily: "'Newsreader', serif",
  }),
  eyebrow: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.amber2,
    letterSpacing: '0.22em', textTransform: 'uppercase',
  } as CSSProperties,
  title: {
    fontFamily: "'Newsreader', serif", fontSize: 25, fontWeight: 600, color: TBL.ink,
    lineHeight: 1.05, marginTop: 3,
  } as CSSProperties,
  sub: {
    fontSize: 13, color: TBL.ink2, lineHeight: 1.45, marginTop: 5, maxWidth: 620,
    fontFamily: "'Inter', sans-serif",
  } as CSSProperties,
  body: { flex: 1, overflowY: 'auto', padding: '18px 22px' } as CSSProperties,
  foot: {
    flexShrink: 0, padding: '14px 22px', borderTop: `1px solid ${TBL.matLine}`,
    display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.2)',
  } as CSSProperties,
  sectionLbl: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.ink3,
    letterSpacing: '0.16em', textTransform: 'uppercase', margin: '4px 0 10px',
    display: 'flex', alignItems: 'center', gap: 10,
  } as CSSProperties,
  sectionLine: { flex: 1, height: 1, background: TBL.matLine } as CSSProperties,
  cardRow: { display: 'flex', gap: 10, flexWrap: 'wrap' } as CSSProperties,
  spacer: { flex: 1 } as CSSProperties,
  costNote: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TBL.amber2,
    letterSpacing: '0.04em',
  } as CSSProperties,
  btn: (variant: 'primary' | 'ghost' | 'danger'): CSSProperties => ({
    padding: '9px 16px', borderRadius: 7, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, border: '1px solid',
    background: variant === 'primary' ? TBL.amber
               : variant === 'danger'  ? 'rgba(224,106,106,0.14)'
               :                         'rgba(255,255,255,0.05)',
    color: variant === 'primary' ? '#1a1208'
          : variant === 'danger'  ? TBL.danger
          :                         TBL.ink,
    borderColor: variant === 'primary' ? TBL.amber
               : variant === 'danger'  ? `${TBL.danger}66`
               :                         TBL.matLine2,
  }),
};

interface ModalShellProps {
  glyph: string;
  color?: string;
  eyebrow: string;
  title: string;
  sub?: string;
  children: ReactNode;
  footer: ReactNode;
  onScrimClick?: () => void;
}

export function ModalShell({ glyph, color, eyebrow, title, sub, children, footer, onScrimClick }: ModalShellProps) {
  return (
    <div style={md.scrim} onClick={onScrimClick}>
      <div style={md.panel} onClick={e => e.stopPropagation()}>
        <div style={md.head}>
          <div style={md.glyph(color)}>{glyph}</div>
          <div style={{ flex: 1 }}>
            <div style={md.eyebrow}>{eyebrow}</div>
            <div style={md.title}>{title}</div>
            {sub && <div style={md.sub}>{sub}</div>}
          </div>
        </div>
        <div style={md.body}>{children}</div>
        <div style={md.foot}>{footer}</div>
      </div>
    </div>
  );
}
