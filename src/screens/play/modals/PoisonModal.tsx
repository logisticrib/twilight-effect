import { useState, useMemo, type CSSProperties } from 'react';
import { ModalShell, md } from './ModalShell';
import { useGameStore } from '../../../store/gameStore';
import { TBL, CLASSCLR, GLYPH } from '../../../tokens';
import type { BoardEntity } from '../../../types/card';

interface PoisonChar {
  id: string;
  name: string;
  cls: string;
  counters: number;
  roll: number | null;
  cleansed: boolean | null;
  dmg: number;
  done: boolean;
}

interface Props { onClose: () => void; }

export function PoisonModal({ onClose }: Props) {
  const { game, setGame } = useGameStore();
  const willpower = Math.max(game.p1.willpower, 1);

  const initial = useMemo<PoisonChar[]>(() => {
    const out: PoisonChar[] = [];
    for (const ent of Object.values(game.p1.board)) {
      if (ent && (ent.poison ?? 0) > 0) {
        out.push({ id: ent.id, name: ent.name, cls: ent.cls, counters: ent.poison!, roll: null, cleansed: null, dmg: 0, done: false });
      }
    }
    // Demo fallback
    if (out.length === 0) {
      out.push({ id: 'demo-1', name: 'Demo Companion', cls: 'Druid', counters: 2, roll: null, cleansed: null, dmg: 0, done: false });
    }
    return out;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [chars, setChars] = useState<PoisonChar[]>(initial);
  const [playerHp, setPlayerHp] = useState(game.p1.hp);
  const allDone = chars.every(c => c.done);

  const rollFor = (i: number) => {
    setChars(cs => cs.map((c, k) => {
      if (k !== i || c.done) return c;
      const roll = 1 + Math.floor(Math.random() * 6);
      const cleansed = roll <= willpower;
      if (!cleansed) setPlayerHp(hp => Math.max(0, hp - c.counters));
      return {
        ...c, roll, cleansed,
        counters: cleansed ? 0 : c.counters,
        dmg: cleansed ? 0 : c.counters,
        done: true,
      };
    }));
  };

  const commit = () => {
    setGame(g => {
      const board = { ...g.p1.board };
      for (const ch of chars) {
        const slotKey = Object.keys(board).find(k => {
          const ent = board[k as keyof typeof board] as BoardEntity | undefined;
          return ent?.id === ch.id;
        });
        if (!slotKey) continue;
        const ent = board[slotKey as keyof typeof board]!;
        board[slotKey as keyof typeof board] = ch.cleansed
          ? { ...ent, poison: 0, statuses: ent.statuses.filter(s => s !== 'Poisoned'), exhausted: false, tapped: 'none' as const }
          : ent;
      }
      return { ...g, p1: { ...g.p1, board, hp: playerHp } };
    });
    onClose();
  };

  const pipStyle: CSSProperties = {
    width: 14, height: 14, borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 30%, #c9a8e0, #5a3c74)',
    border: '1px solid #b79fd0',
  };

  return (
    <ModalShell
      glyph="☣" color={TBL.violet}
      eyebrow="Ready Phase · Poison check"
      title="Resolve Poison"
      sub={`For each Poisoned character you control, roll a d6. If the result is ≤ your Willpower (${willpower}), remove all Poison counters and ready it. Otherwise it stays exhausted and you take 1 damage per counter.`}
      footer={
        <>
          <span style={md.costNote}>
            {chars.filter(c => c.done).length} / {chars.length} resolved · roll ≤ Willpower to cleanse
          </span>
          <div style={md.spacer} />
          <button style={md.btn(allDone ? 'primary' : 'ghost')} onClick={commit}>
            {allDone ? 'Continue' : 'Resolve later'}
          </button>
        </>
      }
    >
      {/* HP readout in top-right of body */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.ink3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Your HP</div>
          <div style={{ fontFamily: "'Newsreader', serif", fontSize: 26, fontWeight: 600, color: playerHp < 8 ? TBL.danger : TBL.ink, lineHeight: 1 }}>
            {playerHp}
          </div>
        </div>
      </div>

      {chars.map((ch, i) => {
        const clr = CLASSCLR[ch.cls] ?? TBL.ink3;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            borderRadius: 9, marginBottom: 8,
            background: 'rgba(124,90,156,0.1)',
            border: `1px solid ${TBL.violet}44`,
          }}>
            {/* Class glyph */}
            <div style={{
              width: 42, height: 42, borderRadius: 9, flexShrink: 0,
              background: `${clr}22`, border: `1px solid ${clr}66`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, color: clr, fontFamily: "'Newsreader', serif",
            }}>
              {GLYPH[ch.cls] ?? '◆'}
            </div>

            {/* Name + counters */}
            <div style={{ minWidth: 160 }}>
              <div style={{ fontFamily: "'Newsreader', serif", fontSize: 17, color: TBL.ink, fontWeight: 600 }}>{ch.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: ch.counters }).map((_, k) => (
                    <div key={k} style={pipStyle} />
                  ))}
                  {ch.cleansed && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.good }}>cleansed</span>}
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: ch.done && !ch.cleansed ? TBL.danger : TBL.good, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {ch.done ? (ch.cleansed ? '· readied' : '· stays exhausted') : '· exhausted'}
                </span>
              </div>
            </div>

            {/* Die result */}
            <div style={{
              width: 42, height: 42, borderRadius: 9, flexShrink: 0,
              background: ch.done ? (ch.cleansed ? `${TBL.good}22` : `${TBL.danger}22`) : `${TBL.amber}22`,
              border: `1px solid ${ch.done ? (ch.cleansed ? TBL.good : TBL.danger) : TBL.amber}66`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18,
              color: ch.done ? (ch.cleansed ? TBL.good : TBL.danger) : TBL.amber,
            }}>
              {ch.roll ?? '?'}
            </div>

            {/* Outcome */}
            <div style={{ marginLeft: 'auto', minWidth: 160, textAlign: 'right' }}>
              {!ch.done ? (
                <button style={md.btn('primary')} onClick={() => rollFor(i)}>Roll die</button>
              ) : (
                <div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
                    color: ch.cleansed ? TBL.good : TBL.danger, letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>
                    {ch.roll} {ch.cleansed ? '≤' : '>'} WP{willpower} · {ch.cleansed ? 'cleansed' : 'holds'}
                  </div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, marginTop: 2,
                    color: ch.cleansed ? TBL.good : TBL.danger,
                  }}>
                    {ch.cleansed ? 'counters removed · readied' : `you take −${ch.dmg} HP · stays exhausted`}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </ModalShell>
  );
}
