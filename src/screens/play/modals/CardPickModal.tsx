import type { ReactNode } from 'react';
import { ModalShell, md } from './ModalShell';
import { CardFace } from '../../../components/CardFace';
import { CATALOG } from '../../../data/catalog';
import { TBL } from '../../../tokens';
import type { Card } from '../../../types/card';

/** One clickable option. `card` may be omitted — the pick then resolves `name` in
 *  the catalog, and falls back to a plain name chip on a miss (never a wrong card). */
export interface CardPick {
  key: string | number;
  name: string;
  card?: Card | null;
  /** Optional line rendered under the card (e.g. armor counter forecast). */
  caption?: ReactNode;
}

interface Props {
  glyph: string;
  color?: string;
  eyebrow: string;
  title: string;
  sub?: string;
  picks: CardPick[];
  onPick: (key: string | number) => void;
  /** Tooltip for each pick button (defaults to the card name). */
  pickTitle?: (name: string) => string;
  /** Footer action (Skip/Cancel). Omit for forced picks (e.g. Armor). */
  cancel?: { label: string; onClick: () => void };
  width?: string;
}

/** The shared pick-a-card dialog: a ModalShell whose body is a row of clickable
 *  card faces. Kit-Master, Dead-Zone recovery, Armor absorb, and equip-from-hand
 *  are all this dialog with different picks. */
export function CardPickModal({ glyph, color, eyebrow, title, sub, picks, onPick, pickTitle, cancel, width }: Props) {
  return (
    <ModalShell glyph={glyph} color={color} eyebrow={eyebrow} title={title} sub={sub}
      width={width ?? 'min(760px, 94vw)'}
      footer={cancel && (
        <>
          <div style={md.spacer} />
          <button style={md.btn('ghost')} onClick={() => cancel.onClick()}>{cancel.label}</button>
        </>
      )}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        {picks.map(p => {
          const card = p.card !== undefined ? p.card : CATALOG.find(c => c.name === p.name) ?? null;
          return (
            <div key={p.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button onClick={() => onPick(p.key)} title={pickTitle ? pickTitle(p.name) : p.name}
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 }}>
                {card
                  ? <CardFace data={card} scale={0.62} />
                  : <span style={{ display: 'inline-block', padding: '14px 18px', border: `1px solid ${TBL.matLine2}`, borderRadius: 8, color: TBL.ink, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>{p.name}</span>}
              </button>
              {p.caption}
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
